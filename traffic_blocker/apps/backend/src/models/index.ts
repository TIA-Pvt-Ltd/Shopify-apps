import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";
import { DEFAULT_BLOCKED_PAGE } from "@traffic-blocker/shared-types";

const scheduleSchema = new Schema(
  {
    timezone: { type: String, default: "UTC" },
    days: { type: [Number], default: [] },
    startHour: { type: Number, default: 0 },
    endHour: { type: Number, default: 24 },
  },
  { _id: false },
);

const shopSchema = new Schema(
  {
    shopDomain: { type: String, required: true, unique: true, lowercase: true, index: true },
    accessTokenEncrypted: { type: String, default: "" },
    scopes: { type: String, default: "" },
    email: { type: String, default: "" },
    installed: { type: Boolean, default: true, index: true },
    uninstalledAt: Date,
    redactedAt: Date,
    ipSalt: { type: String, required: true },
    demo: { type: Boolean, default: false },
    plan: { type: String, enum: ["STARTER", "GROWTH", "ADVANCED"], default: "STARTER" },
    settings: {
      enforcementMode: { type: String, enum: ["shopify_native", "edge"], default: "shopify_native" },
      failMode: { type: String, enum: ["open", "closed"], default: "open" },
      allowlistOverride: { type: Boolean, default: true },
      timezone: { type: String, default: "UTC" },
      notifications: {
        countryBlock: { type: Boolean, default: true },
        attack: { type: Boolean, default: true },
        bot: { type: Boolean, default: true },
        edgeFailure: { type: Boolean, default: true },
        email: { type: Boolean, default: false },
        dailyReport: { type: Boolean, default: false },
        weeklyReport: { type: Boolean, default: false },
        emailAddress: { type: String, default: "" },
      },
      bot: {
        unknownBotAction: { type: String, default: "monitor" },
        maliciousBotAction: { type: String, default: "block" },
        datacenterAction: { type: String, default: "monitor" },
        allowVerifiedSearchCrawlers: { type: Boolean, default: true },
        allowVerifiedAiCrawlers: { type: Boolean, default: false },
        autoBlock: { type: Boolean, default: false },
        autoBlockMinutes: { type: Number, default: 60 },
        customCrawlers: { type: [Schema.Types.Mixed], default: [] },
      },
      vpn: {
        vpnAction: { type: String, default: "monitor" },
        proxyAction: { type: String, default: "monitor" },
        torAction: { type: String, default: "challenge" },
      },
      rateLimit: {
        enabled: { type: Boolean, default: true },
        requestsPerSecond: { type: Number, default: 10 },
        requestsPerMinute: { type: Number, default: 120 },
        requestsPerHour: { type: Number, default: 2000 },
        blockMinutes: { type: Number, default: 15 },
        exemptIps: { type: [String], default: [] },
        exemptPaths: { type: [String], default: [] },
      },
      blockedPage: { type: Schema.Types.Mixed, default: () => ({ ...DEFAULT_BLOCKED_PAGE }) },
    },
  },
  { timestamps: true },
);

const countryBlockSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true, index: true },
    countryCode: { type: String, required: true, uppercase: true },
    mode: { type: String, enum: ["permanent", "temporary", "scheduled"], default: "permanent" },
    enabled: { type: Boolean, default: true },
    expiresAt: Date,
    schedule: scheduleSchema,
    reason: { type: String, default: "" },
    blockedCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);
countryBlockSchema.index({ shopId: 1, countryCode: 1 }, { unique: true });
countryBlockSchema.index({ expiresAt: 1 });

const ipBlockSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true, index: true },
    cidr: { type: String, required: true },
    version: { type: Number, enum: [4, 6], required: true },
    mode: { type: String, enum: ["permanent", "temporary", "scheduled"], default: "permanent" },
    enabled: { type: Boolean, default: true },
    automatic: { type: Boolean, default: false },
    expiresAt: Date,
    reason: { type: String, default: "" },
    blockedCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);
ipBlockSchema.index({ shopId: 1, cidr: 1 }, { unique: true });

const asnBlockSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true, index: true },
    asn: { type: Number, required: true },
    organization: { type: String, default: "" },
    mode: { type: String, enum: ["permanent", "temporary", "scheduled"], default: "permanent" },
    enabled: { type: Boolean, default: true },
    expiresAt: Date,
    reason: { type: String, default: "" },
    blockedCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);
asnBlockSchema.index({ shopId: 1, asn: 1 }, { unique: true });

const customRuleSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    priority: { type: Number, default: 100, index: true },
    enabled: { type: Boolean, default: true },
    combinator: { type: String, enum: ["and", "or"], default: "and" },
    conditions: { type: [Schema.Types.Mixed], required: true },
    action: { type: String, required: true },
    expiresAt: Date,
    schedule: scheduleSchema,
    matchCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);
customRuleSchema.index({ shopId: 1, priority: 1 });

const blockEventSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true, index: true },
    requestId: { type: String, required: true },
    action: { type: String, required: true },
    reason: { type: String, required: true },
    layer: { type: String, required: true },
    ruleId: String,
    classification: { type: String, required: true },
    countryCode: String,
    asn: Number,
    asnOrg: String,
    ipHash: { type: String, required: true },
    ipEncrypted: String,
    browser: String,
    device: String,
    os: String,
    path: String,
    referrer: String,
    source: String,
    enforcementMode: { type: String, required: true },
    preStorefront: { type: Boolean, required: true },
    occurredAt: { type: Date, required: true },
  },
  { timestamps: true },
);
blockEventSchema.index({ shopId: 1, requestId: 1 }, { unique: true });
blockEventSchema.index({ shopId: 1, occurredAt: -1 });
blockEventSchema.index({ shopId: 1, countryCode: 1, occurredAt: -1 });
blockEventSchema.index({ occurredAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 400 });

const trafficSessionSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true, index: true },
    sessionKey: { type: String, required: true },
    approved: { type: Boolean, default: true },
    classification: { type: String, required: true },
    countryCode: String,
    browser: String,
    device: String,
    source: String,
    enforcementMode: { type: String, required: true },
    requestCount: { type: Number, default: 1 },
    eventIds: { type: [String], default: [] },
    startedAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
  },
  { timestamps: true },
);
trafficSessionSchema.index({ shopId: 1, sessionKey: 1 }, { unique: true });
trafficSessionSchema.index({ shopId: 1, startedAt: -1 });
trafficSessionSchema.index({ shopId: 1, approved: 1, startedAt: -1 });

const analyticsDailySchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
    date: { type: String, required: true },
    observedRequests: { type: Number, default: 0 },
    allowedRequests: { type: Number, default: 0 },
    blockedRequests: { type: Number, default: 0 },
    botRequests: { type: Number, default: 0 },
    cleanSessions: { type: Number, default: 0 },
    uniqueBlockedVisitors: { type: Number, default: 0 },
    countryCounts: { type: Map, of: Number, default: {} },
    reasonCounts: { type: Map, of: Number, default: {} },
    deviceCounts: { type: Map, of: Number, default: {} },
    browserCounts: { type: Map, of: Number, default: {} },
    sourceCounts: { type: Map, of: Number, default: {} },
    hourCounts: { type: Map, of: Number, default: {} },
    classificationCounts: { type: Map, of: Number, default: {} },
  },
  { timestamps: true },
);
analyticsDailySchema.index({ shopId: 1, date: 1 }, { unique: true });

const botDetectionSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true, index: true },
    ipHash: { type: String, required: true },
    classification: { type: String, required: true },
    signals: { type: [String], default: [] },
    action: { type: String, required: true },
    userAgentHash: String,
    occurredAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
botDetectionSchema.index({ shopId: 1, occurredAt: -1 });
botDetectionSchema.index({ occurredAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

const threatIpSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", default: null },
    cidr: { type: String, required: true },
    source: { type: String, required: true },
    reason: { type: String, default: "" },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);
threatIpSchema.index({ shopId: 1, cidr: 1 });

const whitelistSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true, index: true },
    type: { type: String, enum: ["ip", "asn", "path", "crawler"], required: true },
    value: { type: String, required: true },
    note: { type: String, default: "" },
    enabled: { type: Boolean, default: true },
    expiresAt: Date,
  },
  { timestamps: true },
);
whitelistSchema.index({ shopId: 1, type: 1, value: 1 }, { unique: true });

const notificationSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true, index: true },
    type: { type: String, required: true },
    severity: { type: String, enum: ["info", "warning", "critical"], default: "info" },
    title: { type: String, required: true },
    body: { type: String, required: true },
    read: { type: Boolean, default: false, index: true },
    emailStatus: { type: String, enum: ["not_requested", "sent", "skipped", "failed"], default: "not_requested" },
  },
  { timestamps: true },
);
notificationSchema.index({ shopId: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

const billingSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true, unique: true },
    plan: { type: String, enum: ["STARTER", "GROWTH", "ADVANCED"], default: "STARTER" },
    interval: { type: String, enum: ["EVERY_30_DAYS", "ANNUAL"], default: "EVERY_30_DAYS" },
    status: { type: String, default: "trial" },
    subscriptionId: { type: String, default: "" },
    confirmationUrl: { type: String, default: "" },
    trialEndsAt: Date,
    currentPeriodEnd: Date,
    test: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const edgeIntegrationSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true, index: true },
    provider: { type: String, enum: ["cloudflare", "mock"], required: true },
    hostname: { type: String, default: "" },
    zoneId: { type: String, default: "" },
    apiTokenEncrypted: { type: String, default: "" },
    status: {
      type: String,
      enum: ["not_connected", "pending", "validating", "active", "failed", "rolled_back", "simulated", "verification_inconclusive"],
      default: "pending",
    },
    protectionActive: { type: Boolean, default: false },
    simulated: { type: Boolean, default: false },
    rulesetId: { type: String, default: "" },
    previousRulesetId: { type: String, default: "" },
    configSignature: { type: String, default: "" },
    lastVerifiedAt: Date,
    lastMessage: { type: String, default: "" },
    checks: { type: [Schema.Types.Mixed], default: [] },
    version: { type: Number, default: 0 },
  },
  { timestamps: true },
);
edgeIntegrationSchema.index({ shopId: 1, provider: 1 }, { unique: true });

const configVersionSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true, index: true },
    version: { type: Number, required: true },
    signature: { type: String, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);
configVersionSchema.index({ shopId: 1, version: 1 }, { unique: true });

const auditLogSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true, index: true },
    actor: { type: String, default: "merchant" },
    action: { type: String, required: true },
    resource: { type: String, required: true },
    resourceId: String,
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);
auditLogSchema.index({ shopId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 });

export const Shop = mongoose.model("Shop", shopSchema);
export const CountryBlock = mongoose.model("CountryBlock", countryBlockSchema);
export const IPBlock = mongoose.model("IPBlock", ipBlockSchema);
export const ASNBlock = mongoose.model("ASNBlock", asnBlockSchema);
export const CustomRule = mongoose.model("CustomRule", customRuleSchema);
export const BlockEvent = mongoose.model("BlockEvent", blockEventSchema);
export const TrafficSession = mongoose.model("TrafficSession", trafficSessionSchema);
export const AnalyticsDaily = mongoose.model("AnalyticsDaily", analyticsDailySchema);
export const BotDetection = mongoose.model("BotDetection", botDetectionSchema);
export const ThreatIP = mongoose.model("ThreatIP", threatIpSchema);
export const Whitelist = mongoose.model("Whitelist", whitelistSchema);
export const Notification = mongoose.model("Notification", notificationSchema);
export const Billing = mongoose.model("Billing", billingSchema);
export const EdgeIntegration = mongoose.model("EdgeIntegration", edgeIntegrationSchema);
export const ConfigVersion = mongoose.model("ConfigVersion", configVersionSchema);
export const AuditLog = mongoose.model("AuditLog", auditLogSchema);

type ShopShape = InferSchemaType<typeof shopSchema>;
export type ShopDoc = HydratedDocument<ShopShape> & {
  settings: NonNullable<ShopShape["settings"]>;
};
