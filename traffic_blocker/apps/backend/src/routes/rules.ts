import type { Router } from "express";
import { botSettingsSchema, customRuleSchema, rateLimitSettingsSchema, simulateRuleSchema, vpnSettingsSchema } from "@traffic-blocker/rule-schemas";
import { HttpError } from "../lib/errors.js";
import { parsePage, sendData } from "../lib/http.js";
import { parseNetwork } from "../lib/ip.js";
import { PLANS } from "../engines/plans.js";
import { evaluate, findRuleConflicts } from "../engines/rules.js";
import { AuditLog, BotDetection, CustomRule } from "../models/index.js";
import { assertCapacity, assertScheduleAllowed, effectivePlan } from "../services/plans.js";
import { activeCount, asyncRoute, audit, currentRuleset, protectionStatus, refresh, shopOf, type AppRuntime } from "../http/shared.js";

function publishedBotSettings(shop: ReturnType<typeof shopOf>): Record<string, unknown> {
  const bot = shop.settings.bot as { toObject?: () => Record<string, unknown> } | undefined;
  const plain = typeof bot?.toObject === "function" ? bot.toObject() : { ...(bot ?? {}) };
  return {
    ...plain,
    vpnAction: shop.settings.vpn?.vpnAction ?? "monitor",
    proxyAction: shop.settings.vpn?.proxyAction ?? "monitor",
    torAction: shop.settings.vpn?.torAction ?? "challenge",
  };
}

export function mountRuleRoutes(router: Router, runtime: AppRuntime): void {
  router.get("/rules", asyncRoute(async (req, res) => {
    sendData(res, await CustomRule.find({ shopId: shopOf(req)._id }).sort({ priority: 1, createdAt: 1 }));
  }));

  router.post("/rules", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const body = customRuleSchema.parse(req.body);
    if (body.schedule || body.expiresAt) await assertScheduleAllowed(await effectivePlan(String(shop._id)), "scheduled");
    const total = await CustomRule.countDocuments({ shopId: shop._id });
    await assertCapacity(String(shop._id), "customRules", total + 1);
    const rule = await CustomRule.create({ ...body, shopId: shop._id, expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined });
    await refresh(runtime, String(shop._id));
    await audit(shop, "create", "custom_rule", String(rule._id));
    sendData(res, rule, 201);
  }));

  router.patch("/rules/:id", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const body = customRuleSchema.partial().parse(req.body);
    const rule = await CustomRule.findOne({ _id: req.params.id, shopId: shop._id });
    if (!rule) throw new HttpError(404, "NOT_FOUND", "Rule not found");
    if (body.name !== undefined) rule.name = body.name;
    if (body.description !== undefined) rule.description = body.description ?? "";
    if (body.priority !== undefined) rule.priority = body.priority;
    if (body.enabled !== undefined) rule.enabled = body.enabled;
    if (body.combinator !== undefined) rule.combinator = body.combinator;
    if (body.conditions !== undefined) rule.conditions = body.conditions;
    if (body.action !== undefined) rule.action = body.action;
    if (body.schedule !== undefined) rule.schedule = body.schedule;
    if (body.expiresAt) rule.expiresAt = new Date(body.expiresAt);
    await rule.save();
    await refresh(runtime, String(shop._id));
    sendData(res, rule);
  }));

  router.delete("/rules/:id", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const rule = await CustomRule.findOneAndDelete({ _id: req.params.id, shopId: shop._id });
    if (!rule) throw new HttpError(404, "NOT_FOUND", "Rule not found");
    await refresh(runtime, String(shop._id));
    sendData(res, { deleted: true });
  }));

  router.post("/rules/simulate", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const body = simulateRuleSchema.parse(req.body);
    const ruleset = await currentRuleset(runtime, String(shop._id));
    const network = parseNetwork(body.ip);
    const result = evaluate(ruleset, {
      ip: network.cidr.split("/")[0],
      countryCode: body.countryCode?.toUpperCase() ?? null,
      continentCode: body.continentCode ?? null,
      asn: body.asn ?? null,
      isp: body.isp ?? null,
      vpn: body.vpn === true,
      proxy: body.proxy === true,
      tor: body.tor === true,
      datacenter: body.datacenter === true,
      browser: body.browser ?? "unknown",
      device: body.device ?? "desktop",
      path: body.path ?? "/",
      requestRatePerMinute: body.requestRatePerMinute ?? 0,
      requestRatePerSecond: 0,
      requestRatePerHour: 0,
      classification: "human",
      malicious: false,
      verifiedCrawler: null,
      behavior: "simulated",
      now: body.at ? new Date(body.at) : new Date(),
    });
    sendData(res, {
      simulated: true,
      ...result,
      note: "Simulation uses the values you entered. Live detection uses server-observed IP and MaxMind, not a browser-supplied country.",
    });
  }));

  router.get("/rules/conflicts", asyncRoute(async (req, res) => {
    const ruleset = await currentRuleset(runtime, String(shopOf(req)._id));
    sendData(res, findRuleConflicts(ruleset.customRules));
  }));

  router.get("/rules/history", asyncRoute(async (req, res) => {
    const rows = await AuditLog.find({ shopId: shopOf(req)._id, resource: "custom_rule" }).sort({ createdAt: -1 }).limit(100);
    sendData(res, rows);
  }));

  router.get("/firewall/status", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const status = await protectionStatus(shop, runtime.geoip.configured);
    const ruleset = await currentRuleset(runtime, String(shop._id));
    sendData(res, {
      ...status,
      activeRules: activeCount(ruleset),
      allowlistOverride: shop.settings.allowlistOverride !== false,
      failMode: shop.settings.failMode,
    });
  }));

  router.get("/bots/settings", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    sendData(res, publishedBotSettings(shop));
  }));

  router.put("/bots/settings", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const body = botSettingsSchema.parse(req.body);
    const plan = await effectivePlan(String(shop._id));
    if (PLANS[plan].limits.botProtection !== "advanced" && (body.customCrawlers.length > 0 || body.autoBlock)) {
      throw new HttpError(402, "PLAN_LIMIT", "Custom crawlers and automatic IP blocking require Growth or Advanced.");
    }
    shop.settings.bot = body;
    const raw = req.body as { vpnAction?: unknown; proxyAction?: unknown; torAction?: unknown };
    if (raw.vpnAction !== undefined || raw.proxyAction !== undefined || raw.torAction !== undefined) {
      shop.settings.vpn = vpnSettingsSchema.parse({
        vpnAction: raw.vpnAction ?? shop.settings.vpn?.vpnAction,
        proxyAction: raw.proxyAction ?? shop.settings.vpn?.proxyAction,
        torAction: raw.torAction ?? shop.settings.vpn?.torAction,
      });
    }
    shop.markModified("settings");
    await shop.save();
    await refresh(runtime, String(shop._id));
    sendData(res, publishedBotSettings(shop));
  }));

  router.get("/bots/detections", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const { page, pageSize } = parsePage(req.query as { page?: unknown; pageSize?: unknown });
    const [items, total] = await Promise.all([
      BotDetection.find({ shopId: shop._id }).sort({ occurredAt: -1 }).skip((page - 1) * pageSize).limit(pageSize),
      BotDetection.countDocuments({ shopId: shop._id }),
    ]);
    sendData(res, items, 200, { page, pageSize, total });
  }));

  router.put("/vpn/settings", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    shop.settings.vpn = vpnSettingsSchema.parse(req.body);
    shop.markModified("settings");
    await shop.save();
    await refresh(runtime, String(shop._id));
    sendData(res, shop.settings.vpn);
  }));

  router.put("/rate-limit", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const body = rateLimitSettingsSchema.parse(req.body);
    for (const value of body.exemptIps) parseNetwork(value);
    shop.settings.rateLimit = body;
    shop.markModified("settings");
    await shop.save();
    await refresh(runtime, String(shop._id));
    sendData(res, shop.settings.rateLimit);
  }));
}
