import type { Router } from "express";
import { asnRuleSchema, importIpsSchema, ipEntrySchema } from "@traffic-blocker/rule-schemas";
import { toCsv } from "@traffic-blocker/analytics-utils";
import { HttpError } from "../lib/errors.js";
import { parsePage, sendData } from "../lib/http.js";
import { parseNetwork } from "../lib/ip.js";
import { ASNBlock, BlockEvent, IPBlock, Whitelist } from "../models/index.js";
import { lookupAsn, searchAsns } from "../engines/intelligence.js";
import { assertCapacity, assertScheduleAllowed, effectivePlan } from "../services/plans.js";
import { asyncRoute, audit, refresh, shopOf, type AppRuntime } from "../http/shared.js";

export function mountNetworkRoutes(router: Router, runtime: AppRuntime): void {
  router.get("/ips", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const { page, pageSize } = parsePage(req.query as { page?: unknown; pageSize?: unknown });
    const q = String(req.query.q ?? "");
    const filter: Record<string, unknown> = { shopId: shop._id };
    if (q) filter.cidr = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const [blocks, total, allowlist] = await Promise.all([
      IPBlock.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize),
      IPBlock.countDocuments(filter),
      Whitelist.find({ shopId: shop._id, type: "ip" }).sort({ createdAt: -1 }),
    ]);
    sendData(res, { blocks, allowlist }, 200, { page, pageSize, total });
  }));

  router.post("/ips", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const body = ipEntrySchema.parse(req.body);
    await assertScheduleAllowed(await effectivePlan(String(shop._id)), body.mode);
    const parsed = parseNetwork(body.value);
    const total = await IPBlock.countDocuments({ shopId: shop._id });
    const exists = await IPBlock.exists({ shopId: shop._id, cidr: parsed.cidr });
    await assertCapacity(String(shop._id), "ipBlocks", total + (exists ? 0 : 1));
    const rule = await IPBlock.findOneAndUpdate(
      { shopId: shop._id, cidr: parsed.cidr },
      { $set: { version: parsed.version, mode: body.mode, enabled: body.enabled, reason: body.reason ?? "", expiresAt: body.expiresAt ? new Date(body.expiresAt) : null } },
      { upsert: true, new: true },
    );
    await refresh(runtime, String(shop._id));
    await audit(shop, "block", "ip", parsed.cidr);
    sendData(res, rule, 201);
  }));

  router.post("/ips/allow", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const body = ipEntrySchema.parse(req.body);
    const parsed = parseNetwork(body.value);
    await Whitelist.findOneAndUpdate(
      { shopId: shop._id, type: "ip", value: parsed.cidr },
      { $set: { enabled: body.enabled, note: body.reason ?? "", expiresAt: body.expiresAt ? new Date(body.expiresAt) : null } },
      { upsert: true, new: true },
    );
    await refresh(runtime, String(shop._id));
    await audit(shop, "allow", "ip", parsed.cidr);
    sendData(res, { cidr: parsed.cidr, list: "allow" }, 201);
  }));

  router.post("/ips/import", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const body = importIpsSchema.parse(req.body);
    const saved: string[] = [];
    const errors: Array<{ value: string; message: string }> = [];
    for (const entry of body.entries) {
      try {
        const parsed = parseNetwork(entry.value);
        if (body.list === "allow") {
          await Whitelist.updateOne(
            { shopId: shop._id, type: "ip", value: parsed.cidr },
            { $set: { enabled: entry.enabled, note: entry.reason ?? "" } },
            { upsert: true },
          );
        } else {
          const total = await IPBlock.countDocuments({ shopId: shop._id });
          const exists = await IPBlock.exists({ shopId: shop._id, cidr: parsed.cidr });
          await assertCapacity(String(shop._id), "ipBlocks", total + (exists ? 0 : 1));
          await IPBlock.updateOne(
            { shopId: shop._id, cidr: parsed.cidr },
            { $set: { version: parsed.version, enabled: entry.enabled, mode: entry.mode, reason: entry.reason ?? "", expiresAt: entry.expiresAt ? new Date(entry.expiresAt) : null } },
            { upsert: true },
          );
        }
        saved.push(parsed.cidr);
      } catch (error) {
        errors.push({ value: entry.value, message: error instanceof Error ? error.message : "Invalid entry" });
      }
    }
    await refresh(runtime, String(shop._id));
    sendData(res, { saved, errors });
  }));

  router.get("/ips/export", asyncRoute(async (req, res) => {
    const rules = await IPBlock.find({ shopId: shopOf(req)._id }).sort({ cidr: 1 });
    res.setHeader("content-type", "text/csv");
    res.send(toCsv(
      ["cidr", "version", "mode", "enabled", "reason", "expiresAt", "blockedRequests"],
      rules.map((rule) => [rule.cidr, rule.version, rule.mode, rule.enabled ? "true" : "false", rule.reason, rule.expiresAt?.toISOString() ?? "", rule.blockedCount]),
    ));
  }));

  router.patch("/ips/:id", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const rule = await IPBlock.findOne({ _id: req.params.id, shopId: shop._id });
    if (!rule) throw new HttpError(404, "NOT_FOUND", "IP rule not found");
    if (typeof req.body?.enabled === "boolean") rule.enabled = req.body.enabled;
    if (typeof req.body?.reason === "string") rule.reason = req.body.reason.slice(0, 240);
    if (typeof req.body?.expiresAt === "string") rule.expiresAt = new Date(req.body.expiresAt);
    await rule.save();
    await refresh(runtime, String(shop._id));
    sendData(res, rule);
  }));

  router.delete("/ips/:id", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const rule = await IPBlock.findOneAndDelete({ _id: req.params.id, shopId: shop._id });
    if (!rule) throw new HttpError(404, "NOT_FOUND", "IP rule not found");
    await refresh(runtime, String(shop._id));
    await audit(shop, "delete", "ip", String(rule._id));
    sendData(res, { deleted: true });
  }));

  router.get("/asns/search", asyncRoute(async (req, res) => {
    sendData(res, searchAsns(String(req.query.q ?? "")).slice(0, 25));
  }));

  router.get("/asns", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const rules = await ASNBlock.find({ shopId: shop._id }).sort({ asn: 1 });
    const observed = await BlockEvent.aggregate<{ _id: number; count: number; org?: string }>([
      { $match: { shopId: shop._id, asn: { $type: "number" } } },
      { $group: { _id: "$asn", count: { $sum: 1 }, org: { $first: "$asnOrg" } } },
      { $sort: { count: -1 } },
      { $limit: 50 },
    ]);
    sendData(res, {
      rules,
      observed: observed.map((row) => ({
        asn: row._id,
        organization: row.org || lookupAsn(row._id)?.organization || "Unknown organization",
        requests: row.count,
      })),
    });
  }));

  router.post("/asns", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const body = asnRuleSchema.parse(req.body);
    await assertScheduleAllowed(await effectivePlan(String(shop._id)), body.mode);
    const total = await ASNBlock.countDocuments({ shopId: shop._id });
    const exists = await ASNBlock.exists({ shopId: shop._id, asn: body.asn });
    await assertCapacity(String(shop._id), "asnBlocks", total + (exists ? 0 : 1));
    const known = lookupAsn(body.asn);
    const rule = await ASNBlock.findOneAndUpdate(
      { shopId: shop._id, asn: body.asn },
      { $set: { organization: body.organization || known?.organization || "", mode: body.mode, enabled: body.enabled, reason: body.reason ?? "", expiresAt: body.expiresAt ? new Date(body.expiresAt) : null } },
      { upsert: true, new: true },
    );
    await refresh(runtime, String(shop._id));
    await audit(shop, "block", "asn", String(body.asn));
    sendData(res, rule, 201);
  }));

  router.patch("/asns/:id", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const rule = await ASNBlock.findOne({ _id: req.params.id, shopId: shop._id });
    if (!rule) throw new HttpError(404, "NOT_FOUND", "ASN rule not found");
    if (typeof req.body?.enabled === "boolean") rule.enabled = req.body.enabled;
    if (typeof req.body?.expiresAt === "string") rule.expiresAt = new Date(req.body.expiresAt);
    await rule.save();
    await refresh(runtime, String(shop._id));
    sendData(res, rule);
  }));

  router.delete("/asns/:id", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const rule = await ASNBlock.findOneAndDelete({ _id: req.params.id, shopId: shop._id });
    if (!rule) throw new HttpError(404, "NOT_FOUND", "ASN rule not found");
    await refresh(runtime, String(shop._id));
    sendData(res, { deleted: true });
  }));
}
