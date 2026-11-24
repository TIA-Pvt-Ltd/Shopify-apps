import { z } from "zod";
import { isCountryCode, CONTINENTS } from "@traffic-blocker/country-data";
import { ACTIONS } from "@traffic-blocker/shared-types";

const countryCode = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine(isCountryCode, "Unknown ISO 3166-1 alpha-2 country code");

export const scheduleSchema = z.object({
  timezone: z.string().min(1).max(80).default("UTC"),
  days: z.array(z.number().int().min(0).max(6)).min(1),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(1).max(24),
});

export const restrictionModeSchema = z.enum(["permanent", "temporary", "scheduled"]);

export const blockCountriesSchema = z.object({
  countryCodes: z.array(countryCode).min(1).max(300),
  mode: restrictionModeSchema.default("permanent"),
  expiresAt: z.string().datetime().optional(),
  schedule: scheduleSchema.optional(),
  enabled: z.boolean().default(true),
  reason: z.string().trim().max(240).optional(),
});

export const allowCountriesSchema = z.object({
  countryCodes: z.array(countryCode).min(1).max(300),
});

export const bulkCountrySchema = z.object({
  action: z.enum(["block", "allow"]),
  countryCodes: z.array(countryCode).max(300).optional(),
  continent: z.enum(["AF", "AN", "AS", "EU", "NA", "OC", "SA"]).optional(),
  mode: restrictionModeSchema.default("permanent"),
  expiresAt: z.string().datetime().optional(),
  schedule: scheduleSchema.optional(),
  enabled: z.boolean().default(true),
}).refine((value) => (value.countryCodes && value.countryCodes.length > 0) || value.continent, {
  message: "Provide countryCodes or a continent",
});

export const updateCountryRuleSchema = z.object({
  enabled: z.boolean().optional(),
  mode: restrictionModeSchema.optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  schedule: scheduleSchema.nullable().optional(),
  reason: z.string().trim().max(240).optional(),
});

export const ipEntrySchema = z.object({
  value: z.string().trim().min(2).max(80),
  mode: restrictionModeSchema.default("permanent"),
  expiresAt: z.string().datetime().optional(),
  reason: z.string().trim().max(240).optional(),
  enabled: z.boolean().default(true),
});

export const importIpsSchema = z.object({
  entries: z.array(ipEntrySchema).min(1).max(1000),
  list: z.enum(["block", "allow"]).default("block"),
});

export const asnRuleSchema = z.object({
  asn: z.number().int().positive().max(4_294_967_295),
  organization: z.string().trim().max(180).optional(),
  mode: restrictionModeSchema.default("permanent"),
  expiresAt: z.string().datetime().optional(),
  enabled: z.boolean().default(true),
  reason: z.string().trim().max(240).optional(),
});

export const conditionSchema = z.object({
  field: z.enum([
    "country",
    "continent",
    "ip",
    "asn",
    "isp",
    "vpn",
    "proxy",
    "tor",
    "bot",
    "browser",
    "device",
    "path",
    "requestRate",
    "behavior",
    "hour",
  ]),
  operator: z.enum(["eq", "neq", "contains", "not_contains", "gt", "lt", "in", "not_in", "cidr"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
});

export const customRuleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400).optional(),
  priority: z.number().int().min(1).max(10000).default(100),
  enabled: z.boolean().default(true),
  combinator: z.enum(["and", "or"]).default("and"),
  conditions: z.array(conditionSchema).min(1).max(25),
  action: z.enum(ACTIONS),
  expiresAt: z.string().datetime().optional(),
  schedule: scheduleSchema.optional(),
});

export const simulateRuleSchema = z.object({
  countryCode: z.string().trim().length(2).optional(),
  continentCode: z.enum(["AF", "AN", "AS", "EU", "NA", "OC", "SA"]).optional(),
  ip: z.string().trim().min(2).max(80),
  asn: z.number().int().nonnegative().optional(),
  isp: z.string().max(180).optional(),
  vpn: z.boolean().optional(),
  proxy: z.boolean().optional(),
  tor: z.boolean().optional(),
  datacenter: z.boolean().optional(),
  userAgent: z.string().max(500).optional(),
  browser: z.string().max(80).optional(),
  device: z.string().max(80).optional(),
  os: z.string().max(80).optional(),
  path: z.string().max(500).optional(),
  referrer: z.string().max(500).optional(),
  requestRatePerMinute: z.number().nonnegative().optional(),
  webdriver: z.boolean().optional(),
  at: z.string().datetime().optional(),
});

const hexColor = z.string().regex(/^#([0-9a-fA-F]{6})$/, "Use a 6-digit hex color");
const httpsUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => value.startsWith("https://"), "URL must use https");

export const blockedPageSchema = z.object({
  mode: z.enum(["generated", "blank", "custom", "redirect"]).default("generated"),
  customHtml: z.string().max(20000).optional().or(z.literal("")),
  logoUrl: httpsUrl.optional().or(z.literal("")),
  imageUrl: httpsUrl.optional().or(z.literal("")),
  heading: z.string().trim().min(1).max(140),
  description: z.string().trim().min(1).max(800),
  backgroundColor: hexColor,
  textColor: hexColor,
  fontFamily: z.enum(["system", "serif", "mono"]),
  contactEmail: z.string().email().optional().or(z.literal("")),
  supportUrl: httpsUrl.optional().or(z.literal("")),
  redirectUrl: httpsUrl.optional().or(z.literal("")),
  autoRedirect: z.boolean().default(false),
  countryMessages: z
    .array(
      z.object({
        countryCode,
        heading: z.string().trim().min(1).max(140),
        description: z.string().trim().min(1).max(800),
      }),
    )
    .max(50),
});

export const botSettingsSchema = z.object({
  unknownBotAction: z.enum(ACTIONS).default("monitor"),
  maliciousBotAction: z.enum(ACTIONS).default("block"),
  datacenterAction: z.enum(["allow", "monitor", "challenge", "block"]).default("monitor"),
  allowVerifiedSearchCrawlers: z.boolean().default(true),
  allowVerifiedAiCrawlers: z.boolean().default(false),
  customCrawlers: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        action: z.enum(["allow", "block", "monitor"]),
        dnsSuffixes: z.array(z.string().trim().min(3).max(120)).max(10).default([]),
        cidrs: z.array(z.string().trim().min(3).max(80)).max(50).default([]),
      }),
    )
    .max(30)
    .default([]),
  autoBlock: z.boolean().default(false),
  autoBlockMinutes: z.number().int().min(1).max(10080).default(60),
});

export const vpnSettingsSchema = z.object({
  vpnAction: z.enum(["allow", "monitor", "challenge", "block"]).default("monitor"),
  proxyAction: z.enum(["allow", "monitor", "challenge", "block"]).default("monitor"),
  torAction: z.enum(["allow", "monitor", "challenge", "block"]).default("challenge"),
});

export const rateLimitSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  requestsPerSecond: z.number().int().min(1).max(1000).default(10),
  requestsPerMinute: z.number().int().min(1).max(20000).default(120),
  requestsPerHour: z.number().int().min(1).max(200000).default(2000),
  blockMinutes: z.number().int().min(1).max(1440).default(15),
  exemptIps: z.array(z.string()).max(200).default([]),
  exemptPaths: z.array(z.string().startsWith("/")).max(50).default([]),
});

export const shopSettingsSchema = z.object({
  enforcementMode: z.enum(["shopify_native", "edge"]).default("shopify_native"),
  failMode: z.enum(["open", "closed"]).default("open"),
  allowlistOverride: z.boolean().default(true),
  timezone: z.string().min(1).max(80).default("UTC"),
  notifyOnCountryBlock: z.boolean().default(true),
  notifyOnAttack: z.boolean().default(true),
  notifyOnBot: z.boolean().default(true),
  notifyOnEdgeFailure: z.boolean().default(true),
  emailNotifications: z.boolean().default(false),
  dailyReport: z.boolean().default(false),
  weeklyReport: z.boolean().default(false),
  notificationEmail: z.string().email().optional().or(z.literal("")),
  bot: botSettingsSchema.optional(),
  vpn: vpnSettingsSchema.optional(),
  rateLimit: rateLimitSettingsSchema.optional(),
});

export const edgeConnectSchema = z.object({
  provider: z.enum(["cloudflare", "mock"]),
  zoneId: z.string().trim().min(8).max(64).optional(),
  apiToken: z.string().trim().min(10).max(400).optional(),
  hostname: z.string().trim().min(3).max(253),
});

export const dnsApplySchema = z.object({
  approved: z.literal(true),
  recordType: z.enum(["A", "AAAA", "CNAME"]),
  name: z.string().trim().min(1).max(253),
  content: z.string().trim().min(1).max(253),
});

export const billingSubscribeSchema = z.object({
  plan: z.enum(["STARTER", "GROWTH", "ADVANCED"]),
  interval: z.enum(["EVERY_30_DAYS", "ANNUAL"]),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(120).optional(),
});

export const pixelEventSchema = z.object({
  shop: z.string().trim().toLowerCase(),
  eventId: z.string().trim().min(4).max(120),
  name: z.string().trim().min(1).max(80),
  timestamp: z.string().max(40).optional(),
  path: z.string().max(500).optional(),
});

export const decideRequestSchema = z.object({
  shop: z.string().trim().toLowerCase(),
  path: z.string().max(500).default("/"),
  userAgent: z.string().max(500).default(""),
  language: z.string().max(40).optional(),
  webdriver: z.boolean().optional(),
  referrer: z.string().max(500).optional(),
  clearance: z.string().max(500).optional(),
  /** Repeat check from an open page. The decision is fresh, but it is not a new visit. */
  watch: z.boolean().optional(),
});

export { CONTINENTS };
export type BlockCountriesInput = z.infer<typeof blockCountriesSchema>;
export type CustomRuleInput = z.infer<typeof customRuleSchema>;
export type SimulateInput = z.infer<typeof simulateRuleSchema>;
export type BlockedPageInput = z.infer<typeof blockedPageSchema>;
export type ShopSettingsInput = z.infer<typeof shopSettingsSchema>;
