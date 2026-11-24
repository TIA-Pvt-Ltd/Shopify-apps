import { ipInCidr, normalizeIp } from "../lib/ip.js";

export interface CrawlerDefinition {
  name: string;
  kind: "search" | "ai" | "custom";
  userAgentPattern: RegExp;
  dnsSuffixes: string[];
  cidrs: string[];
}

export interface DnsVerifier {
  reverse(ip: string): Promise<string[]>;
  resolve(hostname: string): Promise<string[]>;
}

/**
 * Published reverse-DNS suffixes are required before a search crawler is trusted.
 * A matching user-agent with no successful reverse and forward DNS check is never verified.
 */
export const SEARCH_CRAWLERS: readonly CrawlerDefinition[] = [
  { name: "Googlebot", kind: "search", userAgentPattern: /googlebot/i, dnsSuffixes: [".googlebot.com", ".google.com"], cidrs: [] },
  { name: "Bingbot", kind: "search", userAgentPattern: /bingbot/i, dnsSuffixes: [".search.msn.com"], cidrs: [] },
  { name: "Applebot", kind: "search", userAgentPattern: /applebot/i, dnsSuffixes: [".applebot.apple.com"], cidrs: [] },
];

export const AI_CRAWLERS: readonly CrawlerDefinition[] = [
  { name: "GPTBot", kind: "ai", userAgentPattern: /gptbot/i, dnsSuffixes: [], cidrs: [] },
  { name: "ClaudeBot", kind: "ai", userAgentPattern: /claudebot/i, dnsSuffixes: [], cidrs: [] },
  { name: "Google-Extended", kind: "ai", userAgentPattern: /google-extended/i, dnsSuffixes: [".googlebot.com", ".google.com"], cidrs: [] },
];

const MALICIOUS_UA = [/sqlmap/i, /nikto/i, /masscan/i, /zgrab/i, /dirbuster/i, /gobuster/i, /phantomjs/i];
const AUTOMATION_UA = [/headlesschrome/i, /puppeteer/i, /playwright/i, /selenium/i, /python-requests/i, /scrapy/i, /curl\//i, /wget\//i, /aiohttp/i];
const SCRAPER_UA = [/semrush/i, /ahrefsbot/i, /dotbot/i, /petalbot/i, /bytespider/i];

export interface BotClassification {
  classification: "human" | "suspicious" | "bot" | "verified_crawler";
  malicious: boolean;
  signals: string[];
  verifiedCrawler: { name: string; kind: "search" | "ai" | "custom" } | null;
}

export async function verifyCrawler(
  ip: string,
  userAgent: string,
  custom: CrawlerDefinition[],
  dns: DnsVerifier,
): Promise<{ name: string; kind: "search" | "ai" | "custom" } | null> {
  const normalized = normalizeIp(ip);
  if (!normalized) return null;
  const candidates = [...custom, ...SEARCH_CRAWLERS, ...AI_CRAWLERS].filter((crawler) => crawler.userAgentPattern.test(userAgent));
  for (const crawler of candidates) {
    if (crawler.cidrs.some((cidr) => ipInCidr(normalized, cidr))) {
      return { name: crawler.name, kind: crawler.kind };
    }
    if (crawler.dnsSuffixes.length === 0) continue;
    let hostnames: string[] = [];
    try {
      hostnames = await dns.reverse(normalized);
    } catch {
      continue;
    }
    const hostname = hostnames.find((value) => crawler.dnsSuffixes.some((suffix) => value.toLowerCase().endsWith(suffix)));
    if (!hostname) continue;
    try {
      const forward = await dns.resolve(hostname);
      if (forward.some((resolved) => normalizeIp(resolved) === normalized)) {
        return { name: crawler.name, kind: crawler.kind };
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function classifyBot(input: {
  userAgent: string;
  webdriver: boolean;
  datacenter: boolean;
  tor: boolean;
  requestRatePerMinute: number;
  verifiedCrawler: { name: string; kind: "search" | "ai" | "custom" } | null;
}): BotClassification {
  if (input.verifiedCrawler) {
    return {
      classification: "verified_crawler",
      malicious: false,
      signals: [`verified:${input.verifiedCrawler.name}`],
      verifiedCrawler: input.verifiedCrawler,
    };
  }
  const signals: string[] = [];
  let score = 0;
  const ua = input.userAgent || "";
  if (!ua.trim()) {
    score += 20;
    signals.push("missing_user_agent");
  }
  if (MALICIOUS_UA.some((pattern) => pattern.test(ua))) {
    score += 80;
    signals.push("known_malicious_ua");
  } else if (AUTOMATION_UA.some((pattern) => pattern.test(ua))) {
    score += 40;
    signals.push("automation_ua");
  } else if (SCRAPER_UA.some((pattern) => pattern.test(ua))) {
    score += 35;
    signals.push("known_scraper_ua");
  }
  if (input.webdriver) {
    score += 30;
    signals.push("webdriver");
  }
  if (input.datacenter) {
    score += 15;
    signals.push("datacenter_asn");
  }
  if (input.tor) {
    score += 10;
    signals.push("tor");
  }
  if (input.requestRatePerMinute > 60) {
    score += 25;
    signals.push("high_request_rate");
  }
  const malicious = signals.includes("known_malicious_ua");
  const classification = score >= 70 ? "bot" : score >= 30 ? "suspicious" : "human";
  return { classification, malicious, signals, verifiedCrawler: null };
}
