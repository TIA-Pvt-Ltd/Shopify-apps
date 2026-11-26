import { describe, expect, it } from "vitest";
import { parseNetwork, ipInCidr, extractClientIp, isPrivateIp } from "../src/lib/ip.js";
import { evaluate, findRuleConflicts, emptyRuleset, isRuleActive, type CompiledRuleset } from "../src/engines/rules.js";
import { classifyBot, verifyCrawler } from "../src/engines/bot.js";
import { renderBlockedPage } from "../src/engines/blocked-page.js";
import { MemoryRateLimitStore, snapshotRates } from "../src/engines/rate-limit.js";
import { buildCloudflareExpression, MockEdgeProvider, runEdgeDeployment, staticCompatibility } from "../src/engines/edge.js";
import { usageViolations, withinLimit } from "../src/engines/plans.js";
import { createSessionToken, verifyOauthHmac, verifySessionToken, verifyWebhookHmac } from "../src/shopify/auth.js";
import { createHmac } from "node:crypto";
import { contributesToAllowed, contributesToBlocked, isApprovedSession, toCsv } from "@traffic-blocker/analytics-utils";
import { NATIVE_PROTECTION_SUMMARY } from "@traffic-blocker/shared-types";
import { assess, type FirewallDeps, type ShopRuntime } from "../src/services/firewall.js";
import { MapGeoIp } from "../src/engines/geoip.js";
import { ListIntelligence } from "../src/engines/intelligence.js";
import { verifyAppProxySignature } from "../src/shopify/auth.js";
import { DEFAULT_BLOCKED_PAGE } from "@traffic-blocker/shared-types";

function ruleset(partial: Partial<CompiledRuleset> = {}): CompiledRuleset {
  return { ...emptyRuleset("shop"), ...partial };
}

const baseInput = {
  ip: "203.0.113.10",
  countryCode: "US" as string | null,
  continentCode: "NA" as string | null,
  asn: 7922 as number | null,
  isp: "Comcast",
  vpn: false,
  proxy: false,
  tor: false,
  datacenter: false,
  browser: "Chrome",
  device: "desktop",
  path: "/",
  requestRatePerMinute: 1,
  requestRatePerSecond: 1,
  requestRatePerHour: 1,
  classification: "human" as const,
  malicious: false,
  verifiedCrawler: null,
  behavior: "normal",
  now: new Date("2026-11-20T12:00:00Z"),
};

describe("IP and CIDR", () => {
  it("normalizes IPv4 and IPv6 and matches CIDR ranges", () => {
    expect(parseNetwork("192.168.1.10").cidr).toBe("192.168.1.10/32");
    expect(parseNetwork("192.168.1.0/24").cidr).toBe("192.168.1.0/24");
    expect(parseNetwork("2001:db8::1").version).toBe(6);
    expect(ipInCidr("192.168.1.10", "192.168.1.0/24")).toBe(true);
    expect(ipInCidr("192.168.2.10", "192.168.1.0/24")).toBe(false);
    expect(ipInCidr("2001:db8::1", "2001:db8::/32")).toBe(true);
    expect(() => parseNetwork("not-an-ip")).toThrow(/Invalid IP/);
    expect(isPrivateIp("192.168.29.125")).toBe(true);
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("203.0.113.10")).toBe(false);
    expect(isPrivateIp("2405:201:5023:4023:71e7:fe47:561f:e195")).toBe(false);
  });

  it("ignores forwarded headers from untrusted sockets", () => {
    const ip = extractClientIp({
      remoteAddress: "203.0.113.8",
      forwardedFor: "198.51.100.9",
      trustedProxyCidrs: ["127.0.0.1/32"],
    });
    expect(ip).toBe("203.0.113.8");
  });

  it("recognizes a VPN provider network even when the address is not on the CIDR list", () => {
    const intel = new ListIntelligence();
    expect(intel.inspect("203.0.113.5", 133618)).toMatchObject({ vpn: true, datacenter: true });
    expect(intel.inspect("203.0.113.5", 215373)).toMatchObject({ vpn: true, datacenter: true });
    expect(intel.inspect("203.0.113.5", 202053)).toMatchObject({ vpn: true, datacenter: true });
    expect(intel.inspect("203.0.113.5", 57169)).toMatchObject({ vpn: true, datacenter: true });
    expect(intel.inspect("203.0.113.5", 15169)).toMatchObject({ vpn: false, datacenter: true });
    expect(intel.inspect("203.0.113.5", 59253)).toMatchObject({ vpn: false, datacenter: true });
    expect(intel.inspect("203.0.113.5", 8764)).toMatchObject({ vpn: false, datacenter: false });
  });

  it("verifies a Shopify app proxy signature", () => {
    const params = new URLSearchParams("extra=1&extra=2&shop=shop-name.myshopify.com&logged_in_customer_id=&path_prefix=%2Fapps%2Fawesome_reviews&timestamp=1317327555&signature=e072b6d7e6622d85912a5214b860d3100dc1e73d9bc29f43796ac8c9ff8093cb");
    expect(verifyAppProxySignature(params, "hush")).toBe(true);
    expect(verifyAppProxySignature(params, "wrong")).toBe(false);
  });

  it("uses the nearest untrusted forwarded address from a trusted proxy", () => {
    const ip = extractClientIp({
      remoteAddress: "127.0.0.1",
      forwardedFor: "198.51.100.9, 127.0.0.1",
      trustedProxyCidrs: ["127.0.0.1/32"],
    });
    expect(ip).toBe("198.51.100.9");
  });
});

describe("rule precedence", () => {
  it("blocks a country after custom rules and does not treat VPN as malicious", () => {
    const decision = evaluate(ruleset({
      countryBlocks: [{ id: "c1", countryCode: "IN", enabled: true }],
      vpnAction: "monitor",
    }), { ...baseInput, countryCode: "IN", vpn: true });
    expect(decision.action).toBe("block");
    expect(decision.reason).toBe("country_blocked");
    const vpnOnly = evaluate(ruleset({ vpnAction: "monitor" }), { ...baseInput, vpn: true });
    expect(vpnOnly.action).toBe("monitor");
    expect(vpnOnly.reason).toBe("vpn_detected");
    const bypass = evaluate(ruleset({ vpnAction: "block", datacenterAction: "monitor" }), { ...baseInput, vpn: true, datacenter: true });
    expect(bypass.action).toBe("block");
    expect(bypass.reason).toBe("vpn_detected");
  });

  it("lets an allowlist override country and IP blocks only when configured", () => {
    const set = ruleset({
      allowlistOverride: true,
      countryBlocks: [{ id: "c1", countryCode: "IN", enabled: true }],
      ipBlocks: [{ id: "b1", cidr: "203.0.113.10/32", enabled: true }],
      ipAllows: [{ id: "a1", cidr: "203.0.113.10/32", enabled: true }],
    });
    expect(evaluate(set, { ...baseInput, countryCode: "IN" }).reason).toBe("allowlist");
    expect(evaluate({ ...set, allowlistOverride: false }, { ...baseInput, countryCode: "IN" }).reason).toBe("ip_blocked");
  });

  it("runs custom rules first and resolves same-priority conflicts restrictively", () => {
    const set = ruleset({
      countryBlocks: [{ id: "c1", countryCode: "IN", enabled: true }],
      customRules: [
        { id: "r1", name: "allow-in", priority: 10, enabled: true, combinator: "and", action: "allow", conditions: [{ field: "country", operator: "eq", value: "IN" }] },
        { id: "r2", name: "block-in", priority: 10, enabled: true, combinator: "and", action: "block", conditions: [{ field: "country", operator: "eq", value: "IN" }] },
      ],
    });
    const decision = evaluate(set, { ...baseInput, countryCode: "IN" });
    expect(decision.action).toBe("block");
    expect(decision.layer).toBe("custom_rule");
    expect(decision.conflict).toBe(true);
    expect(findRuleConflicts(set.customRules)).toHaveLength(1);
  });

  it("skips expired and out-of-schedule rules", () => {
    const expired = evaluate(ruleset({
      countryBlocks: [{ id: "c1", countryCode: "IN", enabled: true, expiresAt: "2026-11-01T00:00:00.000Z" }],
    }), { ...baseInput, countryCode: "IN" });
    expect(expired.reason).toBe("default_allow");
    const active = isRuleActive({
      id: "s",
      enabled: true,
      schedule: { timezone: "UTC", days: [5], startHour: 9, endHour: 17 },
    }, new Date("2026-11-20T12:00:00Z"));
    expect(active).toBe(true);
  });
});

describe("bots and crawlers", () => {
  it("does not verify a crawler from the user-agent alone", async () => {
    const verified = await verifyCrawler("203.0.113.10", "Mozilla/5.0 (compatible; Googlebot/2.1)", [], {
      async reverse() { return ["crawl.example.com"]; },
      async resolve() { return ["203.0.113.10"]; },
    });
    expect(verified).toBeNull();
    const bot = classifyBot({ userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1)", webdriver: false, datacenter: false, tor: false, requestRatePerMinute: 1, verifiedCrawler: null });
    expect(bot.classification).not.toBe("verified_crawler");
  });

  it("verifies Googlebot only when reverse and forward DNS agree", async () => {
    const verified = await verifyCrawler("66.249.66.1", "Mozilla/5.0 (compatible; Googlebot/2.1)", [], {
      async reverse() { return ["crawl-66-249-66-1.googlebot.com"]; },
      async resolve() { return ["66.249.66.1"]; },
    });
    expect(verified?.name).toBe("Googlebot");
  });

  it("classifies known attack tools as malicious bots and leaves curl suspicious", () => {
    const malicious = classifyBot({ userAgent: "sqlmap/1.7", webdriver: false, datacenter: false, tor: false, requestRatePerMinute: 1, verifiedCrawler: null });
    expect(malicious.classification).toBe("bot");
    expect(malicious.malicious).toBe(true);
    const curl = classifyBot({ userAgent: "curl/8.0", webdriver: false, datacenter: false, tor: false, requestRatePerMinute: 1, verifiedCrawler: null });
    expect(curl.classification).toBe("suspicious");
  });
});

describe("analytics separation", () => {
  it("does not count blocked traffic as an approved session", () => {
    expect(contributesToBlocked("block")).toBe(true);
    expect(contributesToAllowed("block")).toBe(false);
    expect(isApprovedSession("block", "human")).toBe(false);
    expect(isApprovedSession("allow", "human")).toBe(true);
    expect(isApprovedSession("allow", "bot")).toBe(false);
    expect(toCsv(["a"], [["x,y"]])).toBe('a\n"x,y"');
  });
});

describe("blocked page", () => {
  it("uses the default copy and escapes merchant content", () => {
    const html = renderBlockedPage({ ...DEFAULT_BLOCKED_PAGE, heading: "<script>alert(1)</script>" });
    expect(html).toContain("Access Restricted".replace("Access Restricted", "&lt;script&gt;alert(1)&lt;/script&gt;"));
    expect(html).not.toContain("<script>alert");
    const defaults = renderBlockedPage(DEFAULT_BLOCKED_PAGE);
    expect(defaults).toContain("Access Restricted");
    expect(defaults).toContain("Sorry, this store is not available in your region.");
    const blank = renderBlockedPage({ ...DEFAULT_BLOCKED_PAGE, mode: "blank" });
    expect(blank).not.toContain("Access Restricted");
    expect(blank).toContain(DEFAULT_BLOCKED_PAGE.backgroundColor);
    const custom = renderBlockedPage({ ...DEFAULT_BLOCKED_PAGE, mode: "custom", customHtml: "<p>Closed</p>" });
    expect(custom).toContain("<p>Closed</p>");
    const redirect = renderBlockedPage({ ...DEFAULT_BLOCKED_PAGE, mode: "redirect", redirectUrl: "https://example.com/away" });
    expect(redirect).toContain("https://example.com/away");
    expect(redirect).not.toContain("Access Restricted");
  });
});

describe("shopify verification", () => {
  it("verifies OAuth HMAC, webhook HMAC, and session tokens", () => {
    const secret = "shpss_test_secret";
    const params = new URLSearchParams({ code: "abc", shop: "demo.myshopify.com", state: "123", timestamp: "1700000000" });
    const message = [...params.keys()].sort().map((key) => `${key}=${params.get(key)}`).join("&");
    params.set("hmac", createHmac("sha256", secret).update(message).digest("hex"));
    expect(verifyOauthHmac(params, secret)).toBe(true);
    params.set("hmac", "deadbeef");
    expect(verifyOauthHmac(params, secret)).toBe(false);
    const body = Buffer.from(JSON.stringify({ id: 1 }));
    const hmac = createHmac("sha256", secret).update(body).digest("base64");
    expect(verifyWebhookHmac(body, hmac, secret)).toBe(true);
    expect(verifyWebhookHmac(body, hmac, "other")).toBe(false);
    const token = createSessionToken({ apiKey: "key", secret, shop: "demo.myshopify.com" });
    expect(verifySessionToken(token, "key", secret).shop).toBe("demo.myshopify.com");
    expect(() => verifySessionToken(token, "key", "wrong")).toThrow();
    const now = 1_700_000_000_000;
    const barelyExpired = createSessionToken({ apiKey: "key", secret, shop: "demo.myshopify.com", now: now - 65_000, ttlSeconds: 60 });
    expect(verifySessionToken(barelyExpired, "key", secret, now).shop).toBe("demo.myshopify.com");
    const skewExpired = createSessionToken({ apiKey: "key", secret, shop: "demo.myshopify.com", now: now - 140_000, ttlSeconds: 60 });
    expect(verifySessionToken(skewExpired, "key", secret, now).shop).toBe("demo.myshopify.com");
    const expired = createSessionToken({ apiKey: "key", secret, shop: "demo.myshopify.com", now: now - 200_000, ttlSeconds: 60 });
    expect(() => verifySessionToken(expired, "key", secret, now)).toThrow(/Expired session token/);
    const slightlyEarly = createSessionToken({ apiKey: "key", secret, shop: "demo.myshopify.com", now: now + 30_000, ttlSeconds: 60 });
    expect(verifySessionToken(slightlyEarly, "key", secret, now).shop).toBe("demo.myshopify.com");
    const notYetActive = createSessionToken({ apiKey: "key", secret, shop: "demo.myshopify.com", now: now + 120_000, ttlSeconds: 60 });
    expect(() => verifySessionToken(notYetActive, "key", secret, now)).toThrow(/not active/);
  });
});

describe("edge deployment", () => {
  it("never marks the mock provider as active protection", async () => {
    const result = await runEdgeDeployment({
      provider: new MockEdgeProvider(),
      expression: '(ip.src.country in {"IN"})',
      probeExpression: '(any(http.request.headers["x-tb-probe"][*] eq "0123456789abcdef0123456789abcdef"))',
      request: {
        shopDomain: "demo.myshopify.com",
        hostname: "store.example.com",
        ruleset: emptyRuleset("shop"),
        probeNonce: "0123456789abcdef0123456789abcdef",
      },
    });
    expect(result.protectionActive).toBe(false);
    expect(result.simulated).toBe(true);
    expect(result.status).toBe("simulated");
    expect(staticCompatibility({ provider: "cloudflare", hostname: "demo.myshopify.com" })[0].ok).toBe(false);
  });

  it("builds a country expression and keeps the previous ruleset when deploy fails", async () => {
    const expression = buildCloudflareExpression(ruleset({ countryBlocks: [{ id: "c", countryCode: "IN", enabled: true }] }));
    expect(expression).toContain("IN");
    const provider = new MockEdgeProvider();
    provider.simulated = false as unknown as true;
    const failing = {
      ...provider,
      simulated: false,
      async verify() { return [{ id: "zone", label: "Zone", ok: true, detail: "ok" }]; },
      async deploy() { throw new Error("provider down"); },
      async probe() { return { blockedBeforeOrigin: false, originUntouchedForAllowed: false, detail: "no" }; },
      async rollback() { provider.rolledBackTo.push("previous"); },
      async disconnect() { return undefined; },
    };
    const result = await runEdgeDeployment({
      provider: failing,
      expression,
      probeExpression: '(any(http.request.headers["x-tb-probe"][*] eq "0123456789abcdef0123456789abcdef"))',
      request: {
        shopDomain: "demo.myshopify.com",
        hostname: "store.example.com",
        ruleset: emptyRuleset("shop"),
        probeNonce: "0123456789abcdef0123456789abcdef",
        previousRulesetId: "previous",
      },
    });
    expect(result.protectionActive).toBe(false);
    expect(result.status).toBe("rolled_back");
    expect(provider.rolledBackTo).toContain("previous");
  });
});

describe("rate limit and plans", () => {
  it("counts requests inside the window", async () => {
    const store = new MemoryRateLimitStore();
    const first = await snapshotRates(store, "visitor", 1_000);
    const second = await snapshotRates(store, "visitor", 1_500);
    expect(first.perSecond).toBe(1);
    expect(second.perSecond).toBe(2);
  });

  it("enforces plan limits", () => {
    expect(withinLimit(5, 4)).toBe(true);
    expect(withinLimit(5, 5)).toBe(false);
    expect(usageViolations("STARTER", { countryBlocks: 6, ipBlocks: 1, asnBlocks: 1, customRules: 1 })).toEqual([
      "countryBlocks",
      "asnBlocks",
      "customRules",
    ]);
  });
});

describe("live decision path", () => {
  it("uses MaxMind country data and ignores a browser-supplied country", async () => {
    const records: string[] = [];
    const shop: ShopRuntime = {
      id: "shop",
      domain: "demo.myshopify.com",
      ipSalt: "salt",
      ruleset: ruleset({ countryBlocks: [{ id: "c1", countryCode: "IN", enabled: true }] }),
      blockedPage: DEFAULT_BLOCKED_PAGE,
      customCrawlers: [],
      autoBlock: false,
      autoBlockMinutes: 60,
    };
    const deps: FirewallDeps = {
      loadShop: async () => shop,
      geoip: new MapGeoIp({ "203.0.113.10": { countryCode: "IN", continentCode: "AS" } }),
      intel: new ListIntelligence(),
      rates: new MemoryRateLimitStore(),
      dns: { async reverse() { return []; }, async resolve() { return []; } },
      signingSecret: "secret",
      sink: { record(event) { records.push(event.reason); if (event.reason === "explode") throw new Error("analytics down"); } },
    };
    const decision = await assess(deps, {
      shop: shop.domain,
      ip: "203.0.113.10",
      path: "/",
      userAgent: "Mozilla/5.0",
      clientCountry: "US",
    }, shop, true);
    expect(decision.action).toBe("block");
    expect(decision.reason).toBe("country_blocked");
    expect(decision.preStorefront).toBe(false);
    expect(decision.summary).toBe(NATIVE_PROTECTION_SUMMARY);
    expect(decision.blockedPageHtml).toContain("Access Restricted");
    deps.sink.record = () => { throw new Error("analytics down"); };
    const still = await assess(deps, { shop: shop.domain, ip: "203.0.113.10", path: "/", userAgent: "Mozilla/5.0" }, shop, true);
    expect(still.action).toBe("block");
    expect(records[0]).toBe("country_blocked");
  });
});
