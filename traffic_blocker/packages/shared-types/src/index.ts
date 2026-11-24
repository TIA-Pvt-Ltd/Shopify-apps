export const API_VERSION = "2026-10";

export const ACTIONS = ["allow", "block", "challenge", "monitor", "rate_limit"] as const;
export type Action = (typeof ACTIONS)[number];

export const ENFORCEMENT_MODES = ["shopify_native", "edge"] as const;
export type EnforcementMode = (typeof ENFORCEMENT_MODES)[number];

export const EDGE_PROVIDERS = ["cloudflare", "mock"] as const;
export type EdgeProviderName = (typeof EDGE_PROVIDERS)[number];

export const CLASSIFICATIONS = ["human", "suspicious", "bot", "verified_crawler"] as const;
export type TrafficClassification = (typeof CLASSIFICATIONS)[number];

/**
 * Documented evaluation order. Earlier layers win.
 * allowlist_override runs only when the shop explicitly enables it.
 * verified_crawler runs only when that crawler is configured as allow.
 * Custom rules with the same priority use the more restrictive action.
 */
export const RULE_PRECEDENCE = [
  "allowlist_override",
  "ip_block",
  "custom_rule",
  "verified_crawler",
  "asn_block",
  "country_block",
  "bot_policy",
  "vpn_proxy_policy",
  "rate_limit",
  "default",
] as const;
export type PrecedenceLayer = (typeof RULE_PRECEDENCE)[number];

/** Index increases with restrictiveness. Used only as a same-priority tie break. */
export const ACTION_RESTRICTIVENESS: readonly Action[] = [
  "allow",
  "monitor",
  "rate_limit",
  "challenge",
  "block",
];

export type PlanId = "STARTER" | "GROWTH" | "ADVANCED";
export type BillingInterval = "EVERY_30_DAYS" | "ANNUAL";

export interface PlanLimits {
  countryBlocks: number | null;
  ipBlocks: number | null;
  asnBlocks: number | null;
  customRules: number | null;
  analyticsRetentionDays: number;
  botProtection: "basic" | "advanced";
  edge: boolean;
  notifications: boolean;
  scheduledRules: boolean;
}

export interface ProtectionStatus {
  mode: EnforcementMode;
  native: {
    /** Always false. Theme JavaScript cannot stop the request before Shopify. */
    preStorefront: false;
    clientSide: true;
    /** Traffic Blocker approved-session metrics exclude denied visitors. */
    excludesApprovedSessions: true;
    /** This app cannot remove a hit from Shopify's own analytics. */
    controlsShopifyAnalytics: false;
    failModeGuaranteed: false;
    summary: string;
  };
  edge: {
    provider: EdgeProviderName | null;
    status:
      | "not_connected"
      | "pending"
      | "validating"
      | "active"
      | "failed"
      | "rolled_back"
      | "simulated"
      | "verification_inconclusive";
    /** True only after a live probe proves a matching request was rejected before Shopify. */
    protectionActive: boolean;
    simulated: boolean;
    lastVerifiedAt: string | null;
    summary: string;
  };
}

export const NATIVE_PROTECTION_SUMMARY =
  "Shopify-native mode runs in the theme after Shopify has already received the request. A blocked visitor is stopped before the browser sends a pageview to Shopify Analytics, GA4, or Meta Pixel. An allowed visitor continues into the store, and those tools then receive the pageview. This is not pre-storefront protection and it does not delete the request Shopify already accepted.";

export const SIMULATED_EDGE_SUMMARY =
  "The mock edge adapter simulates deployment only. It does not reject requests before they reach Shopify and it is not active protection.";

export interface DecisionResult {
  action: Action;
  reason: string;
  layer: PrecedenceLayer;
  ruleId?: string;
  classification: TrafficClassification;
  signals: string[];
  conflict: boolean;
  enforcementMode: EnforcementMode;
  preStorefront: boolean;
  requestId: string;
}

export interface VisitorContext {
  ip: string;
  countryCode: string | null;
  continentCode: string | null;
  asn: number | null;
  asnOrg: string | null;
  isp: string | null;
  vpn: boolean;
  proxy: boolean;
  tor: boolean;
  datacenter: boolean;
  userAgent: string;
  browser: string;
  device: string;
  os: string;
  path: string;
  referrer: string;
  requestRatePerMinute: number;
  webdriver: boolean;
  verifiedCrawler: string | null;
  now: string;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export interface ApiErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorBody;

export type BlockedPageMode = "generated" | "blank" | "custom" | "redirect";

export interface BlockedPageContent {
  mode?: BlockedPageMode;
  customHtml?: string;
  logoUrl?: string;
  imageUrl?: string;
  heading: string;
  description: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: "system" | "serif" | "mono";
  contactEmail?: string;
  supportUrl?: string;
  redirectUrl?: string;
  autoRedirect: boolean;
  countryMessages: Array<{ countryCode: string; heading: string; description: string }>;
}

export const DEFAULT_BLOCKED_PAGE: BlockedPageContent = {
  mode: "generated",
  heading: "Access Restricted",
  description: "Sorry, this store is not available in your region.",
  backgroundColor: "#0f172a",
  textColor: "#f8fafc",
  fontFamily: "system",
  autoRedirect: false,
  countryMessages: [],
};

export interface MetricSnapshot {
  observedRequests: number;
  allowedRequests: number;
  blockedRequests: number;
  uniqueBlockedVisitors: number;
  detectedBots: number;
  cleanSessions: number;
  activeRules: number;
  countriesBlocked: number;
}

export interface TimeSeriesPoint {
  date: string;
  observed: number;
  allowed: number;
  blocked: number;
  bots: number;
}

export interface BreakdownRow {
  key: string;
  label: string;
  count: number;
}
