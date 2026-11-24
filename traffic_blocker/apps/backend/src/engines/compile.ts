import type { Action } from "@traffic-blocker/shared-types";
import type { CompiledCustomRule, CompiledRuleset, ScheduleWindow } from "./rules.js";
import { emptyRuleset } from "./rules.js";

export interface CompileInput {
  shopId: string;
  version: number;
  allowlistOverride: boolean;
  failMode: "open" | "closed";
  enforcementMode: "shopify_native" | "edge";
  edgeProtectionActive: boolean;
  countries: Array<{ id: string; countryCode: string; enabled: boolean; expiresAt?: Date | string | null; schedule?: ScheduleWindow | null }>;
  ipBlocks: Array<{ id: string; cidr: string; enabled: boolean; expiresAt?: Date | string | null }>;
  ipAllows: Array<{ id: string; cidr: string; enabled: boolean; expiresAt?: Date | string | null }>;
  asns: Array<{ id: string; asn: number; enabled: boolean; expiresAt?: Date | string | null }>;
  customRules: CompiledCustomRule[];
  bot: {
    allowVerifiedSearchCrawlers: boolean;
    allowVerifiedAiCrawlers: boolean;
    customCrawlerActions: Record<string, "allow" | "block" | "monitor">;
    unknownBotAction: Action;
    maliciousBotAction: Action;
    datacenterAction: Action;
  };
  vpn: { vpnAction: Action; proxyAction: Action; torAction: Action };
  rateLimit: CompiledRuleset["rateLimit"];
}

function iso(value?: Date | string | null): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

export function compileRuleset(input: CompileInput): CompiledRuleset {
  const base = emptyRuleset(input.shopId);
  return {
    ...base,
    version: input.version,
    allowlistOverride: input.allowlistOverride,
    failMode: input.failMode,
    enforcementMode: input.enforcementMode,
    edgeProtectionActive: input.edgeProtectionActive,
    countryBlocks: input.countries.map((rule) => ({
      id: rule.id,
      countryCode: rule.countryCode.toUpperCase(),
      enabled: rule.enabled,
      expiresAt: iso(rule.expiresAt),
      schedule: rule.schedule ?? undefined,
    })),
    ipBlocks: input.ipBlocks.map((rule) => ({
      id: rule.id,
      cidr: rule.cidr,
      enabled: rule.enabled,
      expiresAt: iso(rule.expiresAt),
    })),
    ipAllows: input.ipAllows.map((rule) => ({
      id: rule.id,
      cidr: rule.cidr,
      enabled: rule.enabled,
      expiresAt: iso(rule.expiresAt),
    })),
    asnBlocks: input.asns.map((rule) => ({
      id: rule.id,
      asn: rule.asn,
      enabled: rule.enabled,
      expiresAt: iso(rule.expiresAt),
    })),
    customRules: [...input.customRules].sort((left, right) => left.priority - right.priority),
    allowVerifiedSearchCrawlers: input.bot.allowVerifiedSearchCrawlers,
    allowVerifiedAiCrawlers: input.bot.allowVerifiedAiCrawlers,
    customCrawlerActions: input.bot.customCrawlerActions,
    unknownBotAction: input.bot.unknownBotAction,
    maliciousBotAction: input.bot.maliciousBotAction,
    datacenterAction: input.bot.datacenterAction,
    vpnAction: input.vpn.vpnAction,
    proxyAction: input.vpn.proxyAction,
    torAction: input.vpn.torAction,
    rateLimit: input.rateLimit,
  };
}

export function activeRuleCount(ruleset: CompiledRuleset): number {
  return (
    ruleset.countryBlocks.filter((rule) => rule.enabled).length +
    ruleset.ipBlocks.filter((rule) => rule.enabled).length +
    ruleset.asnBlocks.filter((rule) => rule.enabled).length +
    ruleset.customRules.filter((rule) => rule.enabled).length
  );
}
