import mongoose from "mongoose";
import { Redis } from "ioredis";

const shopDomain = process.argv[2] ?? "test-swsiowz0.myshopify.com";
await mongoose.connect(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/traffic_blocker");
const shops = mongoose.connection.db.collection("shops");
const shop = await shops.findOne({ shopDomain });
if (!shop) {
  console.error("Shop not found");
  process.exit(1);
}
await shops.updateOne(
  { shopDomain },
  { $set: { "settings.vpn.vpnAction": "block", "settings.vpn.proxyAction": "block" } },
);
const redis = new Redis("redis://127.0.0.1:6379", { lazyConnect: true, maxRetriesPerRequest: 1 });
await redis.connect();
const removed = await redis.del(`tb:rules:${String(shop._id)}`);
await redis.quit();
await mongoose.disconnect();
console.log(`VPN and proxy actions set to block. Cleared ${removed} cached ruleset.`);
