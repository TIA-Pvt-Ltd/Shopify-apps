import type { BillingInterval, PlanId, PlanLimits } from "@traffic-blocker/shared-types";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  trialDays: number;
  limits: PlanLimits;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  STARTER: {
    id: "STARTER",
    name: "Starter",
    description: "Country and IP controls with basic analytics and bot protection.",
    monthlyPrice: 9,
    annualPrice: 90,
    trialDays: 7,
    limits: {
      countryBlocks: 5,
      ipBlocks: 25,
      asnBlocks: 0,
      customRules: 0,
      analyticsRetentionDays: 7,
      botProtection: "basic",
      edge: false,
      notifications: false,
      scheduledRules: false,
    },
  },
  GROWTH: {
    id: "GROWTH",
    name: "Growth",
    description: "Unlimited country rules, ASN controls, custom rules, and advanced analytics.",
    monthlyPrice: 29,
    annualPrice: 290,
    trialDays: 7,
    limits: {
      countryBlocks: null,
      ipBlocks: null,
      asnBlocks: 50,
      customRules: 25,
      analyticsRetentionDays: 90,
      botProtection: "advanced",
      edge: false,
      notifications: true,
      scheduledRules: true,
    },
  },
  ADVANCED: {
    id: "ADVANCED",
    name: "Advanced",
    description: "Full rules engine, edge enforcement, reports, and higher retention.",
    monthlyPrice: 79,
    annualPrice: 790,
    trialDays: 14,
    limits: {
      countryBlocks: null,
      ipBlocks: null,
      asnBlocks: null,
      customRules: null,
      analyticsRetentionDays: 365,
      botProtection: "advanced",
      edge: true,
      notifications: true,
      scheduledRules: true,
    },
  },
};

export function planPrice(plan: PlanId, interval: BillingInterval): number {
  return interval === "ANNUAL" ? PLANS[plan].annualPrice : PLANS[plan].monthlyPrice;
}

export function withinLimit(limit: number | null, used: number): boolean {
  return limit === null || used < limit;
}

export interface UsageCounts {
  countryBlocks: number;
  ipBlocks: number;
  asnBlocks: number;
  customRules: number;
}

export function usageViolations(plan: PlanId, usage: UsageCounts): string[] {
  const limits = PLANS[plan].limits;
  const violations: string[] = [];
  if (!withinLimit(limits.countryBlocks, usage.countryBlocks)) violations.push("countryBlocks");
  if (!withinLimit(limits.ipBlocks, usage.ipBlocks)) violations.push("ipBlocks");
  if (!withinLimit(limits.asnBlocks, usage.asnBlocks)) violations.push("asnBlocks");
  if (!withinLimit(limits.customRules, usage.customRules)) violations.push("customRules");
  return violations;
}
