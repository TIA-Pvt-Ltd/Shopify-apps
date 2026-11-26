import type { Action, PrecedenceLayer, TrafficClassification } from "@traffic-blocker/shared-types";
import { ACTION_RESTRICTIVENESS } from "@traffic-blocker/shared-types";
import { ipInCidr } from "../lib/ip.js";

export interface ScheduleWindow {
  timezone: string;
  days: number[];
  startHour: number;
  endHour: number;
}

export interface TimedRule {
  id: string;
  enabled: boolean;
  expiresAt?: string | null;
  schedule?: ScheduleWindow | null;
}

export interface CompiledCountryBlock extends TimedRule {
  countryCode: string;
}

export interface CompiledIpRule extends TimedRule {
  cidr: string;
}

export interface CompiledAsnBlock extends TimedRule {
  asn: number;
}

export interface CompiledCondition {
  field: string;
  operator: string;
  value: string | number | boolean | string[];
}

export interface CompiledCustomRule extends TimedRule {
  name: string;
  priority: number;
  combinator: "and" | "or";
  conditions: CompiledCondition[];
  action: Action;
}

export interface CompiledRuleset {
  version: number;
  shopId: string;
  allowlistOverride: boolean;
  failMode: "open" | "closed";
  enforcementMode: "shopify_native" | "edge";
  edgeProtectionActive: boolean;
  countryBlocks: CompiledCountryBlock[];
  ipBlocks: CompiledIpRule[];
  ipAllows: CompiledIpRule[];
  asnBlocks: CompiledAsnBlock[];
  customRules: CompiledCustomRule[];
  allowVerifiedSearchCrawlers: boolean;
  allowVerifiedAiCrawlers: boolean;
  customCrawlerActions: Record<string, "allow" | "block" | "monitor">;
  unknownBotAction: Action;
  maliciousBotAction: Action;
  datacenterAction: Action;
  vpnAction: Action;
  proxyAction: Action;
  torAction: Action;
  rateLimit: {
    enabled: boolean;
    requestsPerSecond: number;
    requestsPerMinute: number;
    requestsPerHour: number;
    blockMinutes: number;
    exemptIps: string[];
    exemptPaths: string[];
  };
}

export interface EvaluationInput {
  ip: string;
  countryCode: string | null;
  continentCode: string | null;
  asn: number | null;
  isp: string | null;
  vpn: boolean;
  proxy: boolean;
  tor: boolean;
  datacenter: boolean;
  browser: string;
  device: string;
  path: string;
  requestRatePerMinute: number;
  requestRatePerSecond: number;
  requestRatePerHour: number;
  classification: TrafficClassification;
  malicious: boolean;
  verifiedCrawler: { name: string; kind: "search" | "ai" | "custom" } | null;
  behavior: string;
  now: Date;
}

export interface Evaluation {
  action: Action;
  reason: string;
  layer: PrecedenceLayer;
  ruleId?: string;
  conflict: boolean;
  conflictingRuleIds?: string[];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function isRuleActive(rule: TimedRule, now: Date): boolean {
  if (!rule.enabled) return false;
  if (rule.expiresAt && new Date(rule.expiresAt).getTime() <= now.getTime()) return false;
  if (!rule.schedule) return true;
  let weekday = "";
  let hour = -1;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: rule.schedule.timezone,
      weekday: "short",
      hour: "numeric",
      hourCycle: "h23",
    }).formatToParts(now);
    weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
    hour = Number(parts.find((part) => part.type === "hour")?.value);
  } catch {
    return false;
  }
  const day = WEEKDAYS.indexOf(weekday);
  if (!rule.schedule.days.includes(day)) return false;
  const { startHour, endHour } = rule.schedule;
  if (startHour === endHour) return true;
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
}

function fieldValue(input: EvaluationInput, field: string): string | number | boolean | null {
  switch (field) {
    case "country":
      return input.countryCode;
    case "continent":
      return input.continentCode;
    case "ip":
      return input.ip;
    case "asn":
      return input.asn;
    case "isp":
      return input.isp ?? "";
    case "vpn":
      return input.vpn;
    case "proxy":
      return input.proxy;
    case "tor":
      return input.tor;
    case "bot":
      return input.classification === "bot";
    case "browser":
      return input.browser;
    case "device":
      return input.device;
    case "path":
      return input.path;
    case "requestRate":
      return input.requestRatePerMinute;
    case "behavior":
      return input.behavior;
    case "hour":
      return hourInUtc(input.now);
    default:
      return null;
  }
}

function hourInUtc(now: Date): number {
  return now.getUTCHours();
}

function asList(value: CompiledCondition["value"]): string[] {
  if (Array.isArray(value)) return value.map((entry) => entry.toLowerCase());
  return String(value)
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function conditionMatches(condition: CompiledCondition, input: EvaluationInput): boolean {
  const current = fieldValue(input, condition.field);
  if (condition.operator === "cidr") {
    return condition.field === "ip" && typeof condition.value === "string" && current != null && ipInCidr(String(current), condition.value);
  }
  if (condition.operator === "in" || condition.operator === "not_in") {
    const hit = current != null && asList(condition.value).includes(String(current).toLowerCase());
    return condition.operator === "in" ? hit : !hit;
  }
  if (condition.operator === "contains" || condition.operator === "not_contains") {
    const hit = String(current ?? "").toLowerCase().includes(String(condition.value).toLowerCase());
    return condition.operator === "contains" ? hit : !hit;
  }
  if (condition.operator === "gt" || condition.operator === "lt") {
    const left = Number(current);
    const right = Number(condition.value);
    if (Number.isNaN(left) || Number.isNaN(right)) return false;
    return condition.operator === "gt" ? left > right : left < right;
  }
  const same = String(current).toLowerCase() === String(condition.value).toLowerCase();
  return condition.operator === "neq" ? !same : same;
}

function ruleMatches(rule: CompiledCustomRule, input: EvaluationInput): boolean {
  if (rule.conditions.length === 0) return false;
  const results = rule.conditions.map((condition) => conditionMatches(condition, input));
  return rule.combinator === "or" ? results.some(Boolean) : results.every(Boolean);
}

function moreRestrictive(left: Action, right: Action): Action {
  return ACTION_RESTRICTIVENESS.indexOf(left) >= ACTION_RESTRICTIVENESS.indexOf(right) ? left : right;
}

function crawlerAction(ruleset: CompiledRuleset, crawler: NonNullable<EvaluationInput["verifiedCrawler"]>): Action | null {
  if (crawler.kind === "custom") return ruleset.customCrawlerActions[crawler.name] ?? null;
  if (crawler.kind === "search") return ruleset.allowVerifiedSearchCrawlers ? "allow" : null;
  if (crawler.kind === "ai") return ruleset.allowVerifiedAiCrawlers ? "allow" : "block";
  return null;
}

function allowlisted(ruleset: CompiledRuleset, input: EvaluationInput): CompiledIpRule | undefined {
  return ruleset.ipAllows.find((rule) => isRuleActive(rule, input.now) && ipInCidr(input.ip, rule.cidr));
}

/**
 * Precedence, first match wins:
 * 1. Custom rules. Lower priority number wins. Same priority uses the more restrictive action and reports a conflict.
 * 2. Allowlist bypass when allowlistOverride is enabled. This skips IP, ASN, country, bot, VPN/proxy, and rate-limit denials.
 * 3. Explicit IP block.
 * 4. Verified crawler policy. User-Agent matches never reach this layer unless DNS or a published CIDR verified the crawler.
 * 5. ASN block.
 * 6. Country block.
 * 7. Bot policy. VPN usage is not a bot signal.
 * 8. Network policy by specificity: Tor → VPN → Proxy → Datacenter.
 *    Overlapping signals (VPN exits that are also hosting ASNs) use the more
 *    specific configured action, so VPN Challenge is not swallowed by Datacenter Block.
 * 9. Rate limit, after exempt IPs and paths.
 * 10. Default allow.
 */
export function evaluate(ruleset: CompiledRuleset, input: EvaluationInput): Evaluation {
  const custom = ruleset.customRules.filter((rule) => isRuleActive(rule, input.now) && ruleMatches(rule, input));
  if (custom.length > 0) {
    const priority = Math.min(...custom.map((rule) => rule.priority));
    const group = custom.filter((rule) => rule.priority === priority);
    const chosen = group.reduce((best, rule) => (moreRestrictive(rule.action, best.action) === rule.action ? rule : best));
    const actions = new Set(group.map((rule) => rule.action));
    return {
      action: chosen.action,
      reason: `custom_rule:${chosen.name}`,
      layer: "custom_rule",
      ruleId: chosen.id,
      conflict: actions.size > 1,
      conflictingRuleIds: actions.size > 1 ? group.map((rule) => rule.id) : undefined,
    };
  }

  const allow = allowlisted(ruleset, input);
  if (allow && ruleset.allowlistOverride) {
    return { action: "allow", reason: "allowlist", layer: "allowlist_override", ruleId: allow.id, conflict: false };
  }

  const ipBlock = ruleset.ipBlocks.find((rule) => isRuleActive(rule, input.now) && ipInCidr(input.ip, rule.cidr));
  if (ipBlock) {
    return { action: "block", reason: "ip_blocked", layer: "ip_block", ruleId: ipBlock.id, conflict: false };
  }

  if (input.verifiedCrawler) {
    const action = crawlerAction(ruleset, input.verifiedCrawler);
    if (action === "allow" || action === "block" || action === "monitor") {
      return {
        action,
        reason: `verified_crawler:${input.verifiedCrawler.name}`,
        layer: "verified_crawler",
        conflict: false,
      };
    }
  }

  if (input.asn != null) {
    const asnBlock = ruleset.asnBlocks.find((rule) => isRuleActive(rule, input.now) && rule.asn === input.asn);
    if (asnBlock) {
      return { action: "block", reason: "asn_blocked", layer: "asn_block", ruleId: asnBlock.id, conflict: false };
    }
  }

  if (input.countryCode) {
    const country = ruleset.countryBlocks.find(
      (rule) => isRuleActive(rule, input.now) && rule.countryCode === input.countryCode,
    );
    if (country) {
      return { action: "block", reason: "country_blocked", layer: "country_block", ruleId: country.id, conflict: false };
    }
  }

  if (input.classification === "bot") {
    const action = input.malicious ? ruleset.maliciousBotAction : ruleset.unknownBotAction;
    if (action !== "allow") {
      return {
        action,
        reason: input.malicious ? "malicious_bot" : "bot_detected",
        layer: "bot_policy",
        conflict: false,
      };
    }
  }

  const network = networkPolicy(ruleset, input);
  if (network) return network;

  if (ruleset.rateLimit.enabled && !rateExempt(ruleset, input)) {
    const limited =
      input.requestRatePerSecond > ruleset.rateLimit.requestsPerSecond ||
      input.requestRatePerMinute > ruleset.rateLimit.requestsPerMinute ||
      input.requestRatePerHour > ruleset.rateLimit.requestsPerHour;
    if (limited) {
      return { action: "rate_limit", reason: "rate_limited", layer: "rate_limit", conflict: false };
    }
  }

  return { action: "allow", reason: "default_allow", layer: "default", conflict: false };
}

function networkPolicy(ruleset: CompiledRuleset, input: EvaluationInput): Evaluation | null {
  // Most-specific network identity first. Commercial VPN/proxy/Tor exits often also
  // look like hosting ASNs; merchants configure those rows separately and expect the
  // specific signal to win (e.g. VPN Challenge over Datacenter Block).
  const checks: Array<[boolean, Action, string]> = [
    [input.tor, ruleset.torAction, "tor_exit"],
    [input.vpn, ruleset.vpnAction, "vpn_detected"],
    [input.proxy, ruleset.proxyAction, "proxy_detected"],
    [input.datacenter, ruleset.datacenterAction, "datacenter_network"],
  ];
  for (const [matched, action, reason] of checks) {
    if (!matched || action === "allow") continue;
    return { action, reason, layer: "vpn_proxy_policy", conflict: false };
  }
  return null;
}

function rateExempt(ruleset: CompiledRuleset, input: EvaluationInput): boolean {
  if (ruleset.rateLimit.exemptPaths.some((path) => input.path === path || input.path.startsWith(`${path}/`))) return true;
  return ruleset.rateLimit.exemptIps.some((value) => {
    try {
      return ipInCidr(input.ip, value.includes("/") ? value : `${value}${value.includes(":") ? "/128" : "/32"}`);
    } catch {
      return false;
    }
  });
}

export interface RuleConflict {
  ruleIds: string[];
  reason: string;
}

export function findRuleConflicts(rules: CompiledCustomRule[]): RuleConflict[] {
  const conflicts: RuleConflict[] = [];
  const active = rules.filter((rule) => rule.enabled);
  for (let leftIndex = 0; leftIndex < active.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < active.length; rightIndex += 1) {
      const left = active[leftIndex];
      const right = active[rightIndex];
      if (left.priority !== right.priority || left.action === right.action) continue;
      const leftCountry = singleValue(left, "country", "eq");
      const rightCountry = singleValue(right, "country", "eq");
      if (leftCountry && leftCountry === rightCountry) {
        conflicts.push({
          ruleIds: [left.id, right.id],
          reason: `Rules at priority ${left.priority} both match ${leftCountry} and choose different actions`,
        });
      }
      const leftCidr = singleValue(left, "ip", "cidr");
      const rightCidr = singleValue(right, "ip", "cidr");
      if (leftCidr && rightCidr && (cidrOverlaps(leftCidr, rightCidr) || cidrOverlaps(rightCidr, leftCidr))) {
        conflicts.push({
          ruleIds: [left.id, right.id],
          reason: `Rules at priority ${left.priority} use overlapping CIDRs and choose different actions`,
        });
      }
    }
  }
  return conflicts;
}

function singleValue(rule: CompiledCustomRule, field: string, operator: string): string | null {
  if (rule.conditions.length !== 1) return null;
  const [condition] = rule.conditions;
  if (condition.field !== field || condition.operator !== operator || typeof condition.value !== "string") return null;
  return condition.value;
}

function cidrOverlaps(left: string, right: string): boolean {
  const [address] = right.split("/");
  return ipInCidr(address, left);
}

export function emptyRuleset(shopId: string): CompiledRuleset {
  return {
    version: 0,
    shopId,
    allowlistOverride: true,
    failMode: "open",
    enforcementMode: "shopify_native",
    edgeProtectionActive: false,
    countryBlocks: [],
    ipBlocks: [],
    ipAllows: [],
    asnBlocks: [],
    customRules: [],
    allowVerifiedSearchCrawlers: true,
    allowVerifiedAiCrawlers: false,
    customCrawlerActions: {},
    unknownBotAction: "monitor",
    maliciousBotAction: "block",
    datacenterAction: "monitor",
    vpnAction: "monitor",
    proxyAction: "monitor",
    torAction: "challenge",
    rateLimit: {
      enabled: true,
      requestsPerSecond: 10,
      requestsPerMinute: 120,
      requestsPerHour: 2000,
      blockMinutes: 15,
      exemptIps: [],
      exemptPaths: [],
    },
  };
}
