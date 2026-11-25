import type { Action, TrafficClassification } from "@traffic-blocker/shared-types";
import { NATIVE_PROTECTION_SUMMARY } from "@traffic-blocker/shared-types";
import { classifySource, contributesToAllowed, contributesToBlocked, isApprovedSession, isBotClassification } from "@traffic-blocker/analytics-utils";
import { getCountry } from "@traffic-blocker/country-data";
import { classifyBot, verifyCrawler, type CrawlerDefinition, type DnsVerifier } from "../engines/bot.js";
import { renderBlockedPage } from "../engines/blocked-page.js";
import { evaluate, type CompiledRuleset } from "../engines/rules.js";
import type { GeoIpProvider } from "../engines/geoip.js";
import type { IntelligenceProvider } from "../engines/intelligence.js";
import { snapshotRates, type RateLimitStore } from "../engines/rate-limit.js";
import { issueClearance, readClearance, hashIp, randomId } from "../lib/crypto.js";
import { parseUserAgent } from "../lib/ua.js";
import { logger } from "../logger.js";
import type { BlockedPageContent } from "@traffic-blocker/shared-types";

export interface ShopRuntime {
  id: string;
  domain: string;
  ipSalt: string;
  ruleset: CompiledRuleset;
  blockedPage: BlockedPageContent;
  customCrawlers: CrawlerDefinition[];
  autoBlock: boolean;
  autoBlockMinutes: number;
}

export interface TrafficRecord {
  requestId: string;
  shopId: string;
  action: Action;
  reason: string;
  layer: string;
  ruleId?: string;
  classification: TrafficClassification;
  signals: string[];
  countryCode: string | null;
  asn: number | null;
  asnOrg: string | null;
  ipHash: string;
  ipEncrypted?: string;
  browser: string;
  device: string;
  os: string;
  path: string;
  referrer: string;
  source: string;
  enforcementMode: "shopify_native";
  preStorefront: false;
  occurredAt: string;
  cleanSession: boolean;
  bot: boolean;
}

export interface DecisionResponse {
  action: Action;
  reason: string;
  layer: string;
  classification: TrafficClassification;
  signals: string[];
  conflict: boolean;
  enforcementMode: "shopify_native";
  preStorefront: false;
  controlsShopifyAnalytics: false;
  summary: string;
  requestId: string;
  blockedPageHtml?: string;
  challengeNonce?: string;
  clearance?: string;
}

export interface FirewallDeps {
  loadShop: (domain: string) => Promise<ShopRuntime | null>;
  geoip: GeoIpProvider;
  intel: IntelligenceProvider;
  rates: RateLimitStore;
  dns: DnsVerifier;
  signingSecret: string;
  encryptIp?: (ip: string) => string | undefined;
  sink: { record(event: TrafficRecord): void };
  rememberClient?: (shopId: string, ip: string) => void;
  onAutoBlock?: (shop: ShopRuntime, ip: string) => Promise<void>;
}

export interface DecideInput {
  shop: string;
  ip: string;
  path: string;
  userAgent: string;
  webdriver?: boolean;
  referrer?: string;
  clearance?: string;
  /** Present only to prove the engine ignores browser-supplied country codes. */
  clientCountry?: string;
  /** True when the storefront is rechecking an open page. Do not record another visit. */
  watch?: boolean;
}

const nodeDns: DnsVerifier = {
  async reverse(ip) {
    const dns = await import("node:dns/promises");
    return dns.reverse(ip);
  },
  async resolve(hostname) {
    const dns = await import("node:dns/promises");
    const [v4, v6] = await Promise.allSettled([dns.resolve4(hostname), dns.resolve6(hostname)]);
    return [
      ...(v4.status === "fulfilled" ? v4.value : []),
      ...(v6.status === "fulfilled" ? v6.value : []),
    ];
  },
};

export function defaultDns(): DnsVerifier {
  return nodeDns;
}

function rateExempt(ruleset: CompiledRuleset, ip: string, path: string): boolean {
  if (ruleset.rateLimit.exemptPaths.some((entry) => path === entry || path.startsWith(`${entry}/`))) return true;
  return ruleset.rateLimit.exemptIps.includes(ip);
}

export async function assess(deps: FirewallDeps, input: DecideInput, shop: ShopRuntime, record: boolean): Promise<DecisionResponse> {
  const requestId = randomId(12);
  const occurredAt = new Date();
  try {
    const geo = deps.geoip.lookup(input.ip);
    const country = geo.countryCode ? getCountry(geo.countryCode) : undefined;
    const intel = deps.intel.inspect(input.ip, geo.asn);
    const ua = parseUserAgent(input.userAgent);
    const exempt = rateExempt(shop.ruleset, input.ip, input.path || "/");
    const rates = exempt ? { perSecond: 0, perMinute: 0, perHour: 0 } : await snapshotRates(deps.rates, `${shop.id}:${input.ip}`);
    const verified = await verifyCrawler(input.ip, input.userAgent, shop.customCrawlers, deps.dns);
    const bot = classifyBot({
      userAgent: input.userAgent,
      webdriver: input.webdriver === true,
      datacenter: intel.datacenter,
      tor: intel.tor,
      requestRatePerMinute: rates.perMinute,
      verifiedCrawler: verified,
    });
    let evaluation = evaluate(shop.ruleset, {
      ip: input.ip,
      countryCode: country?.code ?? geo.countryCode,
      continentCode: country?.continent ?? geo.continentCode,
      asn: geo.asn,
      isp: geo.asnOrg,
      vpn: intel.vpn,
      proxy: intel.proxy,
      tor: intel.tor,
      datacenter: intel.datacenter,
      browser: ua.browser,
      device: ua.device,
      path: input.path || "/",
      requestRatePerMinute: rates.perMinute,
      requestRatePerSecond: rates.perSecond,
      requestRatePerHour: rates.perHour,
      classification: bot.classification,
      malicious: bot.malicious,
      verifiedCrawler: bot.verifiedCrawler,
      behavior: rates.perMinute > 30 ? "repeated" : "normal",
      now: occurredAt,
    });
    const clearance = input.clearance ? readClearance(deps.signingSecret, input.clearance) : null;
    const ipHash = hashIp(input.ip, shop.ipSalt);
    if (
      clearance &&
      clearance.kind === "clearance" &&
      clearance.shopId === shop.id &&
      clearance.ipHash === ipHash &&
      evaluation.action === "challenge"
    ) {
      evaluation = { ...evaluation, action: "allow", reason: "challenge_passed", conflict: false };
    }
    const response: DecisionResponse = {
      action: evaluation.action,
      reason: evaluation.reason,
      layer: evaluation.layer,
      classification: bot.classification,
      signals: bot.signals,
      conflict: evaluation.conflict,
      enforcementMode: "shopify_native",
      preStorefront: false,
      controlsShopifyAnalytics: false,
      summary: NATIVE_PROTECTION_SUMMARY,
      requestId,
    };
    if (evaluation.action === "block" || evaluation.action === "rate_limit") {
      response.blockedPageHtml = renderBlockedPage(shop.blockedPage, country?.code ?? geo.countryCode);
    }
    if (evaluation.action === "challenge") {
      response.challengeNonce = issueClearance(deps.signingSecret, {
        shopId: shop.id,
        ipHash,
        kind: "nonce",
        notBefore: Date.now() + 1500,
        exp: Date.now() + 10 * 60 * 1000,
      });
    }
    if (record) {
      deps.rememberClient?.(shop.id, input.ip);
      logger.info({
        shopId: shop.id,
        action: evaluation.action,
        reason: evaluation.reason,
        ip: input.ip,
        country: country?.code ?? geo.countryCode,
        asn: geo.asn,
        vpn: intel.vpn,
        proxy: intel.proxy,
        tor: intel.tor,
        datacenter: intel.datacenter,
      }, "storefront decision");
      const traffic: TrafficRecord = {
        requestId,
        shopId: shop.id,
        action: evaluation.action,
        reason: evaluation.reason,
        layer: evaluation.layer,
        ruleId: evaluation.ruleId,
        classification: bot.classification,
        signals: bot.signals,
        countryCode: country?.code ?? geo.countryCode,
        asn: geo.asn,
        asnOrg: geo.asnOrg,
        ipHash,
        ipEncrypted: deps.encryptIp?.(input.ip),
        browser: ua.browser,
        device: ua.device,
        os: ua.os,
        path: input.path || "/",
        referrer: input.referrer ?? "",
        source: classifySource(input.referrer ?? ""),
        enforcementMode: "shopify_native",
        preStorefront: false,
        occurredAt: occurredAt.toISOString(),
        cleanSession: isApprovedSession(evaluation.action, bot.classification),
        bot: isBotClassification(bot.classification),
      };
      try {
        deps.sink.record(traffic);
      } catch (sinkError) {
        logger.error({ err: sinkError }, "analytics sink failed");
      }
      if (evaluation.action === "block" && evaluation.reason === "malicious_bot" && shop.autoBlock && deps.onAutoBlock) {
        void deps.onAutoBlock(shop, input.ip).catch((error) => logger.error({ err: error }, "automatic IP block failed"));
      }
    }
    return response;
  } catch (error) {
    logger.error({ err: error }, "decision engine failed");
    if (shop.ruleset.failMode === "closed") {
      return {
        action: "block",
        reason: "engine_error",
        layer: "default",
        classification: "suspicious",
        signals: ["engine_error"],
        conflict: false,
        enforcementMode: "shopify_native",
        preStorefront: false,
        controlsShopifyAnalytics: false,
        summary: NATIVE_PROTECTION_SUMMARY,
        requestId,
        blockedPageHtml: renderBlockedPage(shop.blockedPage),
      };
    }
    return {
      action: "allow",
      reason: "engine_error_fail_open",
      layer: "default",
      classification: "human",
      signals: ["engine_error"],
      conflict: false,
      enforcementMode: "shopify_native",
      preStorefront: false,
      controlsShopifyAnalytics: false,
      summary: NATIVE_PROTECTION_SUMMARY,
      requestId,
    };
  }
}

export async function decide(deps: FirewallDeps, input: DecideInput): Promise<DecisionResponse | null> {
  const shop = await deps.loadShop(input.shop);
  if (!shop) return null;
  return assess(deps, input, shop, input.watch !== true);
}

export function contributes(record: Pick<TrafficRecord, "action" | "classification" | "cleanSession" | "bot">): {
  allowed: boolean;
  blocked: boolean;
} {
  return {
    allowed: contributesToAllowed(record.action),
    blocked: contributesToBlocked(record.action),
  };
}

export async function completeChallenge(deps: FirewallDeps, input: DecideInput & { nonce: string }): Promise<DecisionResponse | null> {
  const shop = await deps.loadShop(input.shop);
  if (!shop) return null;
  const nonce = readClearance(deps.signingSecret, input.nonce);
  const ipHash = hashIp(input.ip, shop.ipSalt);
  if (!nonce || nonce.kind !== "nonce" || nonce.shopId !== shop.id || nonce.ipHash !== ipHash) {
    return null;
  }
  if (nonce.notBefore && nonce.notBefore > Date.now()) {
    return {
      action: "challenge",
      reason: "challenge_too_soon",
      layer: "bot_policy",
      classification: "suspicious",
      signals: [],
      conflict: false,
      enforcementMode: "shopify_native",
      preStorefront: false,
      controlsShopifyAnalytics: false,
      summary: NATIVE_PROTECTION_SUMMARY,
      requestId: randomId(12),
      challengeNonce: input.nonce,
    };
  }
  const clearance = issueClearance(deps.signingSecret, {
    shopId: shop.id,
    ipHash,
    kind: "clearance",
    exp: Date.now() + 30 * 60 * 1000,
  });
  const decision = await assess(deps, { ...input, clearance }, shop, true);
  if (decision.action === "allow" && decision.reason === "challenge_passed") decision.clearance = clearance;
  return decision;
}

export async function inspect(deps: FirewallDeps, input: DecideInput): Promise<DecisionResponse | null> {
  const shop = await deps.loadShop(input.shop);
  if (!shop) return null;
  return assess(deps, input, shop, false);
}
