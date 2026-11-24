import { loadLocalEnv } from "../load-env.js";
import { AnalyticsDaily, BlockEvent, CountryBlock, Shop, TrafficSession } from "../models/index.js";
import { connectMongo } from "../db.js";
import { getConfig } from "../config.js";
import { randomId } from "../lib/crypto.js";

loadLocalEnv();
const config = getConfig();
if (config.nodeEnv === "production") {
  throw new Error("Demo seed refuses to run in production");
}

await connectMongo(config.mongoUri);
const domain = "demo-traffic-blocker.myshopify.com";
let shop = await Shop.findOne({ shopDomain: domain });
if (!shop) {
  shop = await Shop.create({ shopDomain: domain, ipSalt: randomId(16), installed: true, demo: true, plan: "GROWTH" });
}
shop.demo = true;
await shop.save();
await CountryBlock.updateOne({ shopId: shop._id, countryCode: "IN" }, { $set: { enabled: true, mode: "permanent", blockedCount: 12 } }, { upsert: true });
const today = new Date().toISOString().slice(0, 10);
await AnalyticsDaily.updateOne(
  { shopId: shop._id, date: today },
  { $set: { observedRequests: 40, allowedRequests: 28, blockedRequests: 12, botRequests: 4, cleanSessions: 9, uniqueBlockedVisitors: 7 } },
  { upsert: true },
);
await BlockEvent.updateOne(
  { shopId: shop._id, requestId: "demo-block-1" },
  {
    $setOnInsert: {
      action: "block",
      reason: "country_blocked",
      layer: "country_block",
      classification: "human",
      countryCode: "IN",
      ipHash: "demo",
      enforcementMode: "shopify_native",
      preStorefront: false,
      occurredAt: new Date(),
    },
  },
  { upsert: true },
);
await TrafficSession.updateOne(
  { shopId: shop._id, sessionKey: "demo-session" },
  { $setOnInsert: { approved: true, classification: "human", enforcementMode: "shopify_native", startedAt: new Date(), lastSeenAt: new Date() } },
  { upsert: true },
);
console.log(`Demo shop ready at ${domain}. The admin shows a demo banner for this shop.`);
process.exit(0);
