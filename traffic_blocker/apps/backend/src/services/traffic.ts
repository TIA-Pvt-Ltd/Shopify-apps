import type { Redis } from "ioredis";
import mongoose from "mongoose";
import { contributesToAllowed, contributesToBlocked, isBotClassification } from "@traffic-blocker/analytics-utils";
import { AnalyticsDaily, ASNBlock, BlockEvent, BotDetection, CountryBlock, CustomRule, IPBlock, Notification, Shop, TrafficSession } from "../models/index.js";
import { logger } from "../logger.js";
import type { TrafficRecord } from "./firewall.js";

export async function persistTraffic(record: TrafficRecord, redis: Redis | null = null): Promise<void> {
  if (redis) {
    const seen = await redis.set(`tb:seen:${record.requestId}`, "1", "EX", 172800, "NX");
    if (seen !== "OK") return;
  }
  const allowed = contributesToAllowed(record.action) ? 1 : 0;
  const blocked = contributesToBlocked(record.action) ? 1 : 0;
  const bots = isBotClassification(record.classification) ? 1 : 0;
  const date = record.occurredAt.slice(0, 10);
  const hour = String(new Date(record.occurredAt).getUTCHours());
  let cleanSessions = 0;
  if (record.cleanSession) {
    const sessionKey = `${record.ipHash}:${date}`;
    const existing = await TrafficSession.findOne({ shopId: record.shopId, sessionKey, approved: true });
    if (!existing) {
      await TrafficSession.create({
        shopId: record.shopId,
        sessionKey,
        approved: true,
        classification: record.classification,
        countryCode: record.countryCode ?? undefined,
        browser: record.browser,
        device: record.device,
        source: record.source,
        enforcementMode: record.enforcementMode,
        requestCount: 1,
        eventIds: [],
        startedAt: new Date(record.occurredAt),
        lastSeenAt: new Date(record.occurredAt),
      });
      cleanSessions = 1;
    } else {
      existing.requestCount += 1;
      existing.lastSeenAt = new Date(record.occurredAt);
      await existing.save();
    }
  }
  if (blocked) {
    await BlockEvent.updateOne(
      { shopId: record.shopId, requestId: record.requestId },
      {
        $setOnInsert: {
          shopId: record.shopId,
          requestId: record.requestId,
          action: record.action,
          reason: record.reason,
          layer: record.layer,
          ruleId: record.ruleId,
          classification: record.classification,
          countryCode: record.countryCode ?? undefined,
          asn: record.asn ?? undefined,
          asnOrg: record.asnOrg ?? undefined,
          ipHash: record.ipHash,
          ipEncrypted: record.ipEncrypted,
          browser: record.browser,
          device: record.device,
          os: record.os,
          path: record.path,
          referrer: record.referrer,
          source: record.source,
          enforcementMode: record.enforcementMode,
          preStorefront: false,
          occurredAt: new Date(record.occurredAt),
        },
      },
      { upsert: true },
    );
    if (redis && record.countryCode) {
      await redis.pfadd(`tb:hll:blocked:${record.shopId}:${date}`, record.ipHash);
    }
  }
  if (bots || record.classification === "suspicious") {
    await BotDetection.create({
      shopId: record.shopId,
      ipHash: record.ipHash,
      classification: record.classification,
      signals: record.signals,
      action: record.action,
      occurredAt: new Date(record.occurredAt),
    });
  }
  const inc: Record<string, number> = {
    observedRequests: 1,
    allowedRequests: allowed,
    blockedRequests: blocked,
    botRequests: bots,
    cleanSessions,
  };
  if (record.countryCode) inc[`countryCounts.${record.countryCode}`] = 1;
  inc[`reasonCounts.${sanitizeKey(record.reason)}`] = 1;
  inc[`deviceCounts.${sanitizeKey(record.device)}`] = 1;
  inc[`browserCounts.${sanitizeKey(record.browser)}`] = 1;
  inc[`sourceCounts.${sanitizeKey(record.source)}`] = 1;
  inc[`hourCounts.${hour}`] = 1;
  inc[`classificationCounts.${record.classification}`] = 1;
  await AnalyticsDaily.updateOne({ shopId: record.shopId, date }, { $inc: inc }, { upsert: true });
  if (record.ruleId && blocked && mongoose.Types.ObjectId.isValid(record.ruleId)) {
    await Promise.all([
      CountryBlock.updateOne({ _id: record.ruleId, shopId: record.shopId }, { $inc: { blockedCount: 1 } }),
      IPBlock.updateOne({ _id: record.ruleId, shopId: record.shopId }, { $inc: { blockedCount: 1 } }),
      ASNBlock.updateOne({ _id: record.ruleId, shopId: record.shopId }, { $inc: { blockedCount: 1 } }),
      CustomRule.updateOne({ _id: record.ruleId, shopId: record.shopId }, { $inc: { matchCount: 1 } }),
    ]);
  }
  if (redis) {
    await redis.publish(`tb:live:${record.shopId}`, JSON.stringify({ action: record.action, at: record.occurredAt }));
    if (blocked) {
      const attacks = await redis.incr(`tb:attack:${record.shopId}`);
      if (attacks === 1) await redis.expire(`tb:attack:${record.shopId}`, 300);
      if (attacks === 100) {
        const shop = await Shop.findById(record.shopId);
        if (shop?.settings?.notifications?.attack !== false) {
          await Notification.create({
            shopId: record.shopId,
            type: "high_volume_attack",
            severity: "critical",
            title: "High volume of denied requests",
            body: "Traffic Blocker denied 100 requests for this shop in the last five minutes.",
            emailStatus: "not_requested",
          });
        }
      }
    }
  }
}

function sanitizeKey(value: string): string {
  return value.replace(/[.$]/g, "_").slice(0, 80) || "unknown";
}

export function recordLater(record: TrafficRecord, redis: Redis | null, enqueue?: (record: TrafficRecord) => Promise<void>): void {
  void (async () => {
    try {
      await persistTraffic(record, redis);
      if (enqueue) {
        try {
          await enqueue(record);
        } catch (error) {
          logger.error({ err: error }, "traffic queue failed");
        }
      }
    } catch (error) {
      logger.error({ err: error }, "traffic analytics failed");
    }
  })();
}
