import mongoose from "mongoose";
import type { PlanId } from "@traffic-blocker/shared-types";
import { countriesInContinent, getCountry, type ContinentCode } from "@traffic-blocker/country-data";
import { compileRuleset } from "../engines/compile.js";
import type { CompiledCustomRule } from "../engines/rules.js";
import { PLANS, withinLimit } from "../engines/plans.js";
import { paymentRequired } from "../lib/errors.js";
import { ASNBlock, Billing, CountryBlock, CustomRule, EdgeIntegration, IPBlock, Shop, Whitelist } from "../models/index.js";
import type { RulesetCache } from "./cache.js";

export async function effectivePlan(shopId: string): Promise<PlanId> {
  const [shop, billing] = await Promise.all([Shop.findById(shopId), Billing.findOne({ shopId })]);
  if (!shop) return "STARTER";
  if (billing?.status === "active") return (billing.plan as PlanId) ?? "STARTER";
  if (billing?.status === "trial" && billing.trialEndsAt && billing.trialEndsAt.getTime() > Date.now()) return "GROWTH";
  if (shop.plan === "GROWTH" || shop.plan === "ADVANCED") {
    shop.plan = "STARTER";
    await shop.save();
  }
  return "STARTER";
}

export async function assertCapacity(
  shopId: string,
  kind: "countryBlocks" | "ipBlocks" | "asnBlocks" | "customRules",
  usedAfterInsert: number,
): Promise<void> {
  const plan = await effectivePlan(shopId);
  const limit = PLANS[plan].limits[kind];
  if (limit !== null && usedAfterInsert > limit) {
    throw paymentRequired(`${PLANS[plan].name} includes ${limit} ${kind}. Upgrade to add more.`);
  }
}

export { withinLimit };

export async function assertFeature(shopId: string, feature: "edge" | "scheduledRules" | "notifications"): Promise<void> {
  const plan = await effectivePlan(shopId);
  if (!PLANS[plan].limits[feature]) {
    throw paymentRequired(`${PLANS[plan].name} does not include ${feature}.`);
  }
}

export async function compileShop(shopId: string): Promise<ReturnType<typeof compileRuleset>> {
  const shop = await Shop.findById(shopId);
  if (!shop?.settings) throw new Error("Shop not found");
  const settings = shop.settings;
  const [countries, ipBlocks, allows, asns, rules, edge] = await Promise.all([
    CountryBlock.find({ shopId }),
    IPBlock.find({ shopId }),
    Whitelist.find({ shopId, type: "ip" }),
    ASNBlock.find({ shopId }),
    CustomRule.find({ shopId }),
    EdgeIntegration.findOne({ shopId, protectionActive: true }),
  ]);
  const customCrawlers = Array.isArray(settings.bot?.customCrawlers) ? settings.bot.customCrawlers : [];
  const actions: Record<string, "allow" | "block" | "monitor"> = {};
  for (const crawler of customCrawlers as Array<{ name?: string; action?: "allow" | "block" | "monitor" }>) {
    if (crawler.name && crawler.action) actions[crawler.name] = crawler.action;
  }
  return compileRuleset({
    shopId: String(shop._id),
    version: Date.now(),
    allowlistOverride: settings.allowlistOverride !== false,
    failMode: settings.failMode === "closed" ? "closed" : "open",
    enforcementMode: settings.enforcementMode === "edge" ? "edge" : "shopify_native",
    edgeProtectionActive: Boolean(edge?.protectionActive),
    countries: countries.map((rule) => ({
      id: String(rule._id),
      countryCode: rule.countryCode,
      enabled: rule.enabled,
      expiresAt: rule.expiresAt,
      schedule: rule.schedule ?? undefined,
    })),
    ipBlocks: ipBlocks.map((rule) => ({
      id: String(rule._id),
      cidr: rule.cidr,
      enabled: rule.enabled,
      expiresAt: rule.expiresAt,
    })),
    ipAllows: allows.map((rule) => ({
      id: String(rule._id),
      cidr: rule.value,
      enabled: rule.enabled,
      expiresAt: rule.expiresAt,
    })),
    asns: asns.map((rule) => ({
      id: String(rule._id),
      asn: rule.asn,
      enabled: rule.enabled,
      expiresAt: rule.expiresAt,
    })),
    customRules: rules.map((rule) => ({
      id: String(rule._id),
      name: rule.name,
      priority: rule.priority,
      enabled: rule.enabled,
      combinator: rule.combinator as "and" | "or",
      conditions: rule.conditions as CompiledCustomRule["conditions"],
      action: rule.action as CompiledCustomRule["action"],
      expiresAt: rule.expiresAt?.toISOString(),
      schedule: rule.schedule ?? undefined,
    })),
    bot: {
      allowVerifiedSearchCrawlers: settings.bot?.allowVerifiedSearchCrawlers !== false,
      allowVerifiedAiCrawlers: settings.bot?.allowVerifiedAiCrawlers === true,
      customCrawlerActions: actions,
      unknownBotAction: (settings.bot?.unknownBotAction as CompiledCustomRule["action"]) ?? "monitor",
      maliciousBotAction: (settings.bot?.maliciousBotAction as CompiledCustomRule["action"]) ?? "block",
      datacenterAction: (settings.bot?.datacenterAction as CompiledCustomRule["action"]) ?? "monitor",
    },
    vpn: {
      vpnAction: (settings.vpn?.vpnAction as CompiledCustomRule["action"]) ?? "monitor",
      proxyAction: (settings.vpn?.proxyAction as CompiledCustomRule["action"]) ?? "monitor",
      torAction: (settings.vpn?.torAction as CompiledCustomRule["action"]) ?? "challenge",
    },
    rateLimit: {
      enabled: settings.rateLimit?.enabled !== false,
      requestsPerSecond: settings.rateLimit?.requestsPerSecond ?? 10,
      requestsPerMinute: settings.rateLimit?.requestsPerMinute ?? 120,
      requestsPerHour: settings.rateLimit?.requestsPerHour ?? 2000,
      blockMinutes: settings.rateLimit?.blockMinutes ?? 15,
      exemptIps: settings.rateLimit?.exemptIps ?? [],
      exemptPaths: settings.rateLimit?.exemptPaths ?? [],
    },
  });
}

export async function publishRules(shopId: string, cache: RulesetCache): Promise<ReturnType<typeof compileRuleset>> {
  const token = await cache.begin(shopId);
  const compiled = await compileShop(shopId);
  if ((await cache.current(shopId)) === token) await cache.set(shopId, compiled);
  return compiled;
}

export async function refreshRules(shopId: string, cache: RulesetCache): Promise<void> {
  await cache.invalidate(shopId);
  await publishRules(shopId, cache);
}

export async function enforcePlanCaps(shopId: string, plan: PlanId): Promise<void> {
  const limits = PLANS[plan].limits;
  await disableBeyond(CountryBlock as unknown as mongoose.Model<{ enabled: boolean }>, shopId, limits.countryBlocks);
  await disableBeyond(IPBlock as unknown as mongoose.Model<{ enabled: boolean }>, shopId, limits.ipBlocks);
  await disableBeyond(ASNBlock as unknown as mongoose.Model<{ enabled: boolean }>, shopId, limits.asnBlocks);
  await disableBeyond(CustomRule as unknown as mongoose.Model<{ enabled: boolean }>, shopId, limits.customRules);
  if (!limits.edge) {
    await EdgeIntegration.updateMany(
      { shopId, protectionActive: true },
      {
        $set: {
          protectionActive: false,
          status: "failed",
          lastMessage: "Edge protection was turned off because the current plan does not include it. Remove the provider ruleset if a previous deployment is still published.",
        },
      },
    );
  }
}

async function disableBeyond(model: mongoose.Model<{ enabled: boolean }>, shopId: string, limit: number | null): Promise<void> {
  if (limit === null) return;
  const rules = await model.find({ shopId, enabled: true }).sort({ createdAt: 1 });
  for (const rule of rules.slice(limit)) {
    rule.enabled = false;
    await rule.save();
  }
}

export function assertScheduleAllowed(shopPlan: PlanId, mode?: string): void {
  if ((mode === "temporary" || mode === "scheduled") && !PLANS[shopPlan].limits.scheduledRules) {
    throw paymentRequired("Temporary and scheduled rules require the Growth plan.");
  }
}

export function countryLabel(code: string): string {
  return getCountry(code)?.name ?? code;
}

export function continentCountries(continent: ContinentCode): string[] {
  return countriesInContinent(continent).map((country) => country.code);
}
