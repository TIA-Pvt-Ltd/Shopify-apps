import type { Router } from "express";
import { CONTINENTS, flagEmoji, getCountry } from "@traffic-blocker/country-data";
import { COUNTRIES } from "@traffic-blocker/country-data";
import { allowCountriesSchema, blockCountriesSchema, bulkCountrySchema, updateCountryRuleSchema } from "@traffic-blocker/rule-schemas";
import { HttpError } from "../lib/errors.js";
import { parsePage, sendData } from "../lib/http.js";
import { CountryBlock, Notification } from "../models/index.js";
import { assertCapacity, assertScheduleAllowed, continentCountries, effectivePlan } from "../services/plans.js";
import { asyncRoute, audit, refresh, shopOf, type AppRuntime } from "../http/shared.js";

export function mountCountryRoutes(router: Router, runtime: AppRuntime): void {
  router.get("/countries", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const { page, pageSize } = parsePage(req.query as { page?: unknown; pageSize?: unknown });
    const q = String(req.query.q ?? "").toLowerCase();
    const continent = String(req.query.continent ?? "");
    const rules = await CountryBlock.find({ shopId: shop._id });
    const byCode = new Map(rules.map((rule) => [rule.countryCode, rule]));
    let rows = COUNTRIES.map((country) => {
      const rule = byCode.get(country.code);
      return {
        code: country.code,
        name: country.name,
        continent: country.continent,
        continentName: CONTINENTS[country.continent],
        flag: flagEmoji(country.code),
        blocked: Boolean(rule),
        enabled: rule?.enabled ?? false,
        ruleId: rule ? String(rule._id) : null,
        mode: rule?.mode ?? null,
        expiresAt: rule?.expiresAt ?? null,
        schedule: rule?.schedule ?? null,
        blockedRequests: rule?.blockedCount ?? 0,
      };
    });
    if (q) rows = rows.filter((row) => row.name.toLowerCase().includes(q) || row.code.toLowerCase().includes(q));
    if (continent) rows = rows.filter((row) => row.continent === continent);
    sendData(res, rows.slice((page - 1) * pageSize, page * pageSize), 200, { page, pageSize, total: rows.length });
  }));

  router.get("/countries/blocked", asyncRoute(async (req, res) => {
    const rules = await CountryBlock.find({ shopId: shopOf(req)._id }).sort({ countryCode: 1 });
    sendData(res, rules.map(serializeCountry));
  }));

  router.get("/countries/analytics", asyncRoute(async (req, res) => {
    const rules = await CountryBlock.find({ shopId: shopOf(req)._id }).sort({ blockedCount: -1 });
    sendData(res, rules.map((rule) => ({
      countryCode: rule.countryCode,
      name: getCountry(rule.countryCode)?.name ?? rule.countryCode,
      blockedRequests: rule.blockedCount,
      enabled: rule.enabled,
    })));
  }));

  router.get("/countries/history", asyncRoute(async (req, res) => {
    const { AuditLog } = await import("../models/index.js");
    const rows = await AuditLog.find({ shopId: shopOf(req)._id, resource: "country_block" }).sort({ createdAt: -1 }).limit(100);
    sendData(res, rows);
  }));

  router.post("/countries/block", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const body = blockCountriesSchema.parse(req.body);
    await assertScheduleAllowed(await effectivePlan(String(shop._id)), body.mode);
    const existing = await CountryBlock.countDocuments({ shopId: shop._id, countryCode: { $in: body.countryCodes } });
    const total = await CountryBlock.countDocuments({ shopId: shop._id });
    await assertCapacity(String(shop._id), "countryBlocks", total + body.countryCodes.length - existing);
    const saved = [];
    for (const countryCode of body.countryCodes) {
      const rule = await CountryBlock.findOneAndUpdate(
        { shopId: shop._id, countryCode },
        { $set: { mode: body.mode, enabled: body.enabled, expiresAt: body.expiresAt ? new Date(body.expiresAt) : null, schedule: body.schedule ?? null, reason: body.reason ?? "" } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      saved.push(serializeCountry(rule));
    }
    await refresh(runtime, String(shop._id));
    await audit(shop, "block", "country_block", undefined, { countryCodes: body.countryCodes });
    if (shop.settings.notifications?.countryBlock !== false) {
      await Notification.create({
        shopId: shop._id,
        type: "country_block",
        severity: "info",
        title: "Country restriction saved",
        body: `Blocked ${body.countryCodes.join(", ")}.`,
        emailStatus: "not_requested",
      });
    }
    sendData(res, saved, 201);
  }));

  router.post("/countries/allow", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const body = allowCountriesSchema.parse(req.body);
    await CountryBlock.deleteMany({ shopId: shop._id, countryCode: { $in: body.countryCodes } });
    await refresh(runtime, String(shop._id));
    await audit(shop, "allow", "country_block", undefined, { countryCodes: body.countryCodes });
    sendData(res, { removed: body.countryCodes });
  }));

  router.post("/countries/bulk", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const body = bulkCountrySchema.parse(req.body);
    const codes = body.continent ? continentCountries(body.continent) : body.countryCodes ?? [];
    if (body.action === "allow") {
      await CountryBlock.deleteMany({ shopId: shop._id, countryCode: { $in: codes } });
    } else {
      await assertScheduleAllowed(await effectivePlan(String(shop._id)), body.mode);
      const existing = await CountryBlock.countDocuments({ shopId: shop._id, countryCode: { $in: codes } });
      const total = await CountryBlock.countDocuments({ shopId: shop._id });
      await assertCapacity(String(shop._id), "countryBlocks", total + codes.length - existing);
      for (const countryCode of codes) {
        await CountryBlock.updateOne(
          { shopId: shop._id, countryCode },
          { $set: { mode: body.mode, enabled: body.enabled, expiresAt: body.expiresAt ? new Date(body.expiresAt) : null, schedule: body.schedule ?? null } },
          { upsert: true },
        );
      }
    }
    await refresh(runtime, String(shop._id));
    await audit(shop, body.action, "country_block", undefined, { count: codes.length, continent: body.continent });
    sendData(res, { action: body.action, count: codes.length });
  }));

  router.patch("/countries/:id", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const body = updateCountryRuleSchema.parse(req.body);
    if (body.mode) await assertScheduleAllowed(await effectivePlan(String(shop._id)), body.mode);
    const rule = await CountryBlock.findOne({ _id: req.params.id, shopId: shop._id });
    if (!rule) throw new HttpError(404, "NOT_FOUND", "Country rule not found");
    if (body.enabled !== undefined) rule.enabled = body.enabled;
    if (body.mode) rule.mode = body.mode;
    if (body.expiresAt !== undefined) rule.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (body.schedule !== undefined) rule.schedule = body.schedule;
    if (body.reason !== undefined) rule.reason = body.reason;
    await rule.save();
    await refresh(runtime, String(shop._id));
    await audit(shop, "update", "country_block", String(rule._id));
    sendData(res, serializeCountry(rule));
  }));

  router.delete("/countries/:id", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const rule = await CountryBlock.findOneAndDelete({ _id: req.params.id, shopId: shop._id });
    if (!rule) throw new HttpError(404, "NOT_FOUND", "Country rule not found");
    await refresh(runtime, String(shop._id));
    await audit(shop, "delete", "country_block", String(rule._id));
    sendData(res, { deleted: true });
  }));
}

function serializeCountry(rule: {
  _id: unknown;
  countryCode: string;
  enabled: boolean;
  mode: string;
  expiresAt?: Date | null;
  schedule?: unknown;
  blockedCount: number;
  reason?: string;
}) {
  const country = getCountry(rule.countryCode);
  return {
    id: String(rule._id),
    countryCode: rule.countryCode,
    name: country?.name ?? rule.countryCode,
    continent: country?.continent ?? null,
    flag: flagEmoji(rule.countryCode),
    enabled: rule.enabled,
    mode: rule.mode,
    expiresAt: rule.expiresAt ?? null,
    schedule: rule.schedule ?? null,
    blockedRequests: rule.blockedCount,
    reason: rule.reason ?? "",
  };
}
