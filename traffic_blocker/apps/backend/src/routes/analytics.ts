import type { Router } from "express";
import { eachDay, resolveDateRange, toCsv, type DatePreset } from "@traffic-blocker/analytics-utils";
import { blockedPageSchema, shopSettingsSchema } from "@traffic-blocker/rule-schemas";
import { DEFAULT_BLOCKED_PAGE, type BlockedPageContent } from "@traffic-blocker/shared-types";
import { HttpError } from "../lib/errors.js";
import { parsePage, sendData } from "../lib/http.js";
import { decryptSecret } from "../lib/crypto.js";
import { renderBlockedPage } from "../engines/blocked-page.js";
import { AnalyticsDaily, ASNBlock, BlockEvent, CountryBlock, CustomRule, IPBlock, Notification } from "../models/index.js";
import { logger } from "../logger.js";
import { asyncRoute, audit, shopOf, type AppRuntime } from "../http/shared.js";

export function mountAnalyticsRoutes(router: Router, runtime: AppRuntime): void {
  router.get("/analytics/overview", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const days = eachDay(rangeFrom(req));
    const rows = days.length ? await AnalyticsDaily.find({ shopId: shop._id, date: { $gte: days[0], $lte: days[days.length - 1] } }) : [];
    const totals = rows.reduce(
      (sum, row) => {
        sum.observedRequests += row.observedRequests;
        sum.allowedRequests += row.allowedRequests;
        sum.blockedRequests += row.blockedRequests;
        sum.detectedBots += row.botRequests;
        sum.cleanSessions += row.cleanSessions;
        return sum;
      },
      { observedRequests: 0, allowedRequests: 0, blockedRequests: 0, detectedBots: 0, cleanSessions: 0 },
    );
    let uniqueBlockedVisitors = rows.reduce((sum, row) => sum + (row.uniqueBlockedVisitors ?? 0), 0);
    if (runtime.redis && days.length > 0) {
      try {
        uniqueBlockedVisitors = await runtime.redis.pfcount(...days.map((day) => `tb:hll:blocked:${String(shop._id)}:${day}`));
      } catch (error) {
        logger.warn({ err: error }, "blocked visitor counter unavailable");
      }
    }
    const [countries, ips, asns, rules, countriesBlocked] = await Promise.all([
      CountryBlock.countDocuments({ shopId: shop._id, enabled: true }),
      IPBlock.countDocuments({ shopId: shop._id, enabled: true }),
      ASNBlock.countDocuments({ shopId: shop._id, enabled: true }),
      CustomRule.countDocuments({ shopId: shop._id, enabled: true }),
      CountryBlock.countDocuments({ shopId: shop._id, enabled: true }),
    ]);
    sendData(res, {
      ...totals,
      uniqueBlockedVisitors,
      activeRules: countries + ips + asns + rules,
      countriesBlocked,
      demo: shop.demo === true,
    });
  }));

  router.get("/analytics/timeseries", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const days = eachDay(rangeFrom(req));
    const rows = await AnalyticsDaily.find({ shopId: shop._id, date: { $in: days } });
    const byDate = new Map(rows.map((row) => [row.date, row]));
    sendData(res, days.map((date) => {
      const row = byDate.get(date);
      return { date, observed: row?.observedRequests ?? 0, allowed: row?.allowedRequests ?? 0, blocked: row?.blockedRequests ?? 0, bots: row?.botRequests ?? 0 };
    }));
  }));

  router.get("/analytics/breakdown", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const dimension = String(req.query.dimension ?? "country");
    const field = dimension === "device" ? "deviceCounts" : dimension === "browser" ? "browserCounts" : dimension === "source" ? "sourceCounts" : dimension === "reason" ? "reasonCounts" : dimension === "classification" ? "classificationCounts" : dimension === "hour" ? "hourCounts" : "countryCounts";
    const days = eachDay(rangeFrom(req));
    const rows = days.length ? await AnalyticsDaily.find({ shopId: shop._id, date: { $gte: days[0], $lte: days[days.length - 1] } }) : [];
    const totals = new Map<string, number>();
    for (const row of rows) {
      const map = row.get(field) as Map<string, number> | undefined;
      map?.forEach((count, key) => totals.set(key, (totals.get(key) ?? 0) + Number(count)));
    }
    sendData(res, [...totals.entries()].map(([key, count]) => ({ key, label: key, count })).sort((left, right) => right.count - left.count));
  }));

  router.get("/analytics/export", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const days = eachDay(rangeFrom(req));
    const rows = await AnalyticsDaily.find({ shopId: shop._id, date: { $in: days } }).sort({ date: 1 });
    res.setHeader("content-type", "text/csv");
    res.send(toCsv(
      ["date", "observedRequests", "allowedRequests", "blockedRequests", "botRequests", "cleanSessions"],
      rows.map((row) => [row.date, row.observedRequests, row.allowedRequests, row.blockedRequests, row.botRequests, row.cleanSessions]),
    ));
  }));

  router.get("/events", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const { page, pageSize } = parsePage(req.query as { page?: unknown; pageSize?: unknown });
    const filter: Record<string, unknown> = { shopId: shop._id };
    if (typeof req.query.country === "string" && req.query.country) filter.countryCode = req.query.country.toUpperCase();
    if (typeof req.query.reason === "string" && req.query.reason) filter.reason = req.query.reason;
    const [items, total] = await Promise.all([
      BlockEvent.find(filter).sort({ occurredAt: -1 }).skip((page - 1) * pageSize).limit(pageSize),
      BlockEvent.countDocuments(filter),
    ]);
    sendData(res, items.map((item) => ({
      id: String(item._id),
      occurredAt: item.occurredAt,
      action: item.action,
      reason: item.reason,
      countryCode: item.countryCode ?? null,
      asn: item.asn ?? null,
      browser: item.browser,
      device: item.device,
      path: item.path,
      enforcementMode: item.enforcementMode,
      preStorefront: false,
      ip: item.ipEncrypted && runtime.config.encryptionKey ? safeDecrypt(item.ipEncrypted, runtime.config.encryptionKey) : null,
      ipHash: item.ipHash,
    })), 200, { page, pageSize, total });
  }));

  router.get("/system/queues", asyncRoute(async (_req, res) => {
    if (!runtime.redis) {
      sendData(res, { available: false, queues: [] });
      return;
    }
    const raw = await runtime.redis.get("tb:queue-metrics");
    sendData(res, { available: true, queues: raw ? JSON.parse(raw) : [] });
  }));

  router.get("/blocked-page", asyncRoute(async (req, res) => {
    sendData(res, (shopOf(req).settings.blockedPage as BlockedPageContent) ?? DEFAULT_BLOCKED_PAGE);
  }));

  router.put("/blocked-page", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const body = blockedPageSchema.parse(req.body);
    shop.settings.blockedPage = blankToUndefined(body);
    shop.markModified("settings");
    await shop.save();
    await audit(shop, "update", "blocked_page");
    sendData(res, shop.settings.blockedPage);
  }));

  router.post("/blocked-page/preview", asyncRoute(async (req, res) => {
    const body = blockedPageSchema.parse(req.body);
    const country = typeof req.query.country === "string" ? req.query.country : null;
    sendData(res, { html: renderBlockedPage(blankToUndefined(body), country) });
  }));

  router.get("/notifications", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const { page, pageSize } = parsePage(req.query as { page?: unknown; pageSize?: unknown });
    const [items, total] = await Promise.all([
      Notification.find({ shopId: shop._id }).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize),
      Notification.countDocuments({ shopId: shop._id }),
    ]);
    sendData(res, items, 200, { page, pageSize, total });
  }));

  router.post("/notifications/:id/read", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const note = await Notification.findOne({ _id: req.params.id, shopId: shop._id });
    if (!note) throw new HttpError(404, "NOT_FOUND", "Notification not found");
    note.read = true;
    await note.save();
    sendData(res, note);
  }));

  router.put("/notifications/preferences", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const body = shopSettingsSchema.pick({
      notifyOnCountryBlock: true,
      notifyOnAttack: true,
      notifyOnBot: true,
      notifyOnEdgeFailure: true,
      emailNotifications: true,
      dailyReport: true,
      weeklyReport: true,
      notificationEmail: true,
    }).partial().parse(req.body);
    shop.settings.notifications = {
      countryBlock: body.notifyOnCountryBlock ?? shop.settings.notifications?.countryBlock ?? true,
      attack: body.notifyOnAttack ?? shop.settings.notifications?.attack ?? true,
      bot: body.notifyOnBot ?? shop.settings.notifications?.bot ?? true,
      edgeFailure: body.notifyOnEdgeFailure ?? shop.settings.notifications?.edgeFailure ?? true,
      email: body.emailNotifications ?? shop.settings.notifications?.email ?? false,
      dailyReport: body.dailyReport ?? shop.settings.notifications?.dailyReport ?? false,
      weeklyReport: body.weeklyReport ?? shop.settings.notifications?.weeklyReport ?? false,
      emailAddress: body.notificationEmail ?? shop.settings.notifications?.emailAddress ?? "",
    };
    shop.markModified("settings");
    await shop.save();
    sendData(res, shop.settings.notifications);
  }));
}

function rangeFrom(req: { query: Record<string, unknown> }) {
  const preset = (typeof req.query.preset === "string" ? req.query.preset : "7d") as DatePreset;
  return resolveDateRange(preset, new Date(), {
    from: typeof req.query.from === "string" ? req.query.from : undefined,
    to: typeof req.query.to === "string" ? req.query.to : undefined,
  });
}

function safeDecrypt(payload: string, key: string): string | null {
  try {
    return decryptSecret(payload, key);
  } catch {
    return null;
  }
}

function blankToUndefined(body: BlockedPageContent): BlockedPageContent {
  return {
    ...body,
    mode: body.mode || "generated",
    customHtml: body.customHtml || undefined,
    logoUrl: body.logoUrl || undefined,
    imageUrl: body.imageUrl || undefined,
    contactEmail: body.contactEmail || undefined,
    supportUrl: body.supportUrl || undefined,
    redirectUrl: body.redirectUrl || undefined,
  };
}
