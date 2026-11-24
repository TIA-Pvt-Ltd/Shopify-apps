import type { NextFunction, Request, Response } from "express";
import type { Redis } from "ioredis";
import { ZodError } from "zod";
import { COUNTRIES } from "@traffic-blocker/country-data";
import { DEFAULT_BLOCKED_PAGE, NATIVE_PROTECTION_SUMMARY, SIMULATED_EDGE_SUMMARY, type BlockedPageContent, type PlanId } from "@traffic-blocker/shared-types";
import type { AppConfig } from "../config.js";
import { HttpError, unauthorized } from "../lib/errors.js";
import { encryptSecret, randomId } from "../lib/crypto.js";
import { extractClientIp } from "../lib/ip.js";
import { emptyRuleset, type CompiledRuleset } from "../engines/rules.js";
import { activeRuleCount } from "../engines/compile.js";
import { logger } from "../logger.js";
import { sanitizeShopDomain, verifySessionToken } from "../shopify/auth.js";
import { activateWebPixel, exchangeSessionToken, registerWebhooks } from "../shopify/admin.js";
import { defaultDns, type FirewallDeps, type ShopRuntime, type TrafficRecord } from "../services/firewall.js";
import { recordLater } from "../services/traffic.js";
import { compileShop, publishRules } from "../services/plans.js";
import type { RulesetCache } from "../services/cache.js";
import type { GeoIpProvider } from "../engines/geoip.js";
import type { IntelligenceProvider } from "../engines/intelligence.js";
import type { RateLimitStore } from "../engines/rate-limit.js";
import { AuditLog, Billing, EdgeIntegration, Shop, type ShopDoc } from "../models/index.js";
import { PLANS } from "../engines/plans.js";

export interface AppRuntime {
  config: AppConfig;
  redis: Redis | null;
  cache: RulesetCache;
  geoip: GeoIpProvider;
  intel: IntelligenceProvider;
  rates: RateLimitStore;
  enqueueTraffic?: (record: TrafficRecord) => Promise<void>;
}

export function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

export function clientIp(req: Request, config: AppConfig): string {
  return extractClientIp({
    remoteAddress: req.socket.remoteAddress,
    forwardedFor: req.header("x-forwarded-for"),
    cfConnectingIp: req.header("cf-connecting-ip"),
    trustedProxyCidrs: config.trustedProxyCidrs,
  });
}

const sessionExchangeAttempt = new Map<string, number>();

export async function authenticate(req: Request, config: AppConfig): Promise<ShopDoc> {
  const header = req.header("authorization") ?? "";
  if (header.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    let claims;
    try {
      claims = verifySessionToken(token, config.shopifyApiKey, config.shopifyApiSecret);
    } catch (error) {
      logger.warn({ err: error }, "session token rejected");
      throw unauthorized("Invalid session token");
    }
    const shop = await Shop.findOne({ shopDomain: claims.shop });
    if (shop?.installed && shop.accessTokenEncrypted) return shop as ShopDoc;
    return provisionFromSession(claims.shop, token, config);
  }
  if (!config.allowDevAuth) throw unauthorized();
  const domain = sanitizeShopDomain(req.header("x-dev-shop") ?? config.devShopDomain);
  if (!domain) throw unauthorized("Development shop domain is invalid");
  return ensureDevShop(domain);
}

async function provisionFromSession(domain: string, sessionToken: string, config: AppConfig): Promise<ShopDoc> {
  const lastAttempt = sessionExchangeAttempt.get(domain) ?? 0;
  if (Date.now() - lastAttempt < 60_000) return openInstalledShop(domain);
  sessionExchangeAttempt.set(domain, Date.now());
  try {
    const exchanged = await exchangeSessionToken(domain, sessionToken, config);
    const shop = await installShop(domain, exchanged.access_token, exchanged.scope, config);
    await registerWebhooks(domain, exchanged.access_token, config).catch((error) => logger.warn({ err: error, shop: domain }, "webhook registration failed"));
    await activateWebPixel(domain, exchanged.access_token, config).catch((error) => logger.warn({ err: error, shop: domain }, "web pixel activation failed"));
    return shop as ShopDoc;
  } catch (error) {
    logger.warn({ err: error, shop: domain }, "session token exchange failed; dashboard will open without an offline token");
    return openInstalledShop(domain);
  }
}

async function openInstalledShop(domain: string): Promise<ShopDoc> {
  const shop = await ensureDevShop(domain);
  if (!shop.installed) {
    shop.installed = true;
    shop.set("uninstalledAt", undefined);
    await shop.save();
  }
  return shop;
}

export async function ensureDevShop(domain: string): Promise<ShopDoc> {
  let shop = await Shop.findOne({ shopDomain: domain });
  if (!shop) shop = await Shop.create({ shopDomain: domain, ipSalt: randomId(16), installed: true });
  if (!(await Billing.findOne({ shopId: shop._id }))) {
    await Billing.create({
      shopId: shop._id,
      plan: "GROWTH",
      status: "trial",
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      test: true,
    });
  }
  return shop as ShopDoc;
}

export async function installShop(domain: string, token: string, scopes: string, config: AppConfig) {
  const encrypted = encryptSecret(token, config.encryptionKey);
  let shop = await Shop.findOne({ shopDomain: domain });
  if (!shop) {
    shop = await Shop.create({ shopDomain: domain, accessTokenEncrypted: encrypted, scopes, ipSalt: randomId(16), installed: true });
    await Billing.create({
      shopId: shop._id,
      status: "trial",
      plan: "GROWTH",
      trialEndsAt: new Date(Date.now() + PLANS.GROWTH.trialDays * 24 * 60 * 60 * 1000),
      test: config.shopifyBillingTest,
    });
  } else {
    shop.accessTokenEncrypted = encrypted;
    shop.scopes = scopes;
    shop.installed = true;
    shop.set("uninstalledAt", undefined);
    await shop.save();
  }
  return shop;
}

export function firewallDeps(runtime: AppRuntime): FirewallDeps {
  return {
    loadShop: (domain) => loadRuntime(runtime, domain),
    geoip: runtime.geoip,
    intel: runtime.intel,
    rates: runtime.rates,
    dns: defaultDns(),
    signingSecret: runtime.config.signingSecret,
    encryptIp: (ip) => (runtime.config.encryptionKey ? encryptSecret(ip, runtime.config.encryptionKey) : undefined),
    sink: { record: (event) => recordLater(event, runtime.redis, runtime.enqueueTraffic) },
    onAutoBlock: async (shop, ip) => {
      const { parseNetwork } = await import("../lib/ip.js");
      const { IPBlock } = await import("../models/index.js");
      const parsed = parseNetwork(ip);
      const expiresAt = new Date(Date.now() + shop.autoBlockMinutes * 60 * 1000);
      await IPBlock.updateOne(
        { shopId: shop.id, cidr: parsed.cidr },
        { $set: { enabled: true, automatic: true, mode: "temporary", expiresAt, reason: "Automatic malicious bot block", version: parsed.version } },
        { upsert: true },
      );
      await refresh(runtime, shop.id);
    },
  };
}

export async function loadRuntime(runtime: AppRuntime, domain: string): Promise<ShopRuntime | null> {
  const shop = await Shop.findOne({ shopDomain: domain, installed: true });
  if (!shop?.settings) return null;
  const settings = shop.settings;
  const id = String(shop._id);
  let ruleset = await runtime.cache.get(id);
  if (!ruleset) {
    const compiled = await publishRules(id, runtime.cache);
    ruleset = (await runtime.cache.get(id)) ?? compiled;
  }
  const custom = Array.isArray(settings.bot?.customCrawlers) ? settings.bot.customCrawlers : [];
  return {
    id,
    domain: shop.shopDomain,
    ipSalt: shop.ipSalt,
    ruleset,
    blockedPage: (settings.blockedPage as BlockedPageContent) ?? DEFAULT_BLOCKED_PAGE,
    customCrawlers: (custom as Array<{ name: string; action: "allow" | "block" | "monitor"; dnsSuffixes?: string[]; cidrs?: string[] }>).map((crawler) => ({
      name: crawler.name,
      kind: "custom" as const,
      userAgentPattern: new RegExp(crawler.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      dnsSuffixes: crawler.dnsSuffixes ?? [],
      cidrs: crawler.cidrs ?? [],
    })),
    autoBlock: settings.bot?.autoBlock === true,
    autoBlockMinutes: settings.bot?.autoBlockMinutes ?? 60,
  };
}

export async function refresh(runtime: AppRuntime, shopId: string): Promise<void> {
  const { refreshRules } = await import("../services/plans.js");
  await refreshRules(shopId, runtime.cache);
}

export async function audit(shop: ShopDoc, action: string, resource: string, resourceId?: string, metadata?: Record<string, unknown>) {
  await AuditLog.create({ shopId: shop._id, action, resource, resourceId, metadata });
}

export async function protectionStatus(shop: ShopDoc, geoipConfigured: boolean) {
  const edge = await EdgeIntegration.findOne({ shopId: shop._id }).sort({ updatedAt: -1 });
  const active = Boolean(edge?.protectionActive && !edge.simulated);
  return {
    mode: active ? "edge" : "shopify_native",
    geoipConfigured,
    native: {
      preStorefront: false as const,
      clientSide: true,
      excludesApprovedSessions: true,
      controlsShopifyAnalytics: false,
      failModeGuaranteed: false,
      summary: NATIVE_PROTECTION_SUMMARY,
    },
    edge: {
      provider: edge?.provider ?? null,
      status: edge?.status ?? "not_connected",
      protectionActive: active,
      simulated: Boolean(edge?.simulated),
      lastVerifiedAt: edge?.lastVerifiedAt ?? null,
      summary: edge?.simulated ? SIMULATED_EDGE_SUMMARY : edge?.lastMessage || "Edge protection is not active.",
      checks: edge?.checks ?? [],
    },
  };
}

export function publicSettings(shop: ShopDoc) {
  return {
    enforcementMode: shop.settings.enforcementMode,
    failMode: shop.settings.failMode,
    allowlistOverride: shop.settings.allowlistOverride,
    timezone: shop.settings.timezone,
    notifications: shop.settings.notifications,
    bot: shop.settings.bot,
    vpn: shop.settings.vpn,
    rateLimit: shop.settings.rateLimit,
    nativeLimitation: NATIVE_PROTECTION_SUMMARY,
  };
}

export function sendError(error: unknown, res: Response): void {
  if (error instanceof ZodError) {
    res.status(422).json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: error.flatten() } });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ ok: false, error: { code: error.code, message: error.message, details: error.details } });
    return;
  }
  res.status(500).json({ ok: false, error: { code: "INTERNAL", message: "Unexpected server error" } });
}

export function shopOf(req: Request): ShopDoc {
  return req.shop as ShopDoc;
}

export const COUNTRY_COUNT = COUNTRIES.length;

export async function currentRuleset(runtime: AppRuntime, shopId: string): Promise<CompiledRuleset> {
  return (await runtime.cache.get(shopId)) ?? compileShop(shopId);
}

export function activeCount(ruleset: CompiledRuleset): number {
  return activeRuleCount(ruleset);
}

export function emptySet(shopId: string): CompiledRuleset {
  return emptyRuleset(shopId);
}

export type { PlanId };
