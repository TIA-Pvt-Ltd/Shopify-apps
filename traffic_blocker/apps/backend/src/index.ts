import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { loadLocalEnv } from "./load-env.js";
import { getConfig } from "./config.js";
import { logger } from "./logger.js";
import { connectMongo, createRedis } from "./db.js";
import { createApp } from "./create-app.js";
import { createRulesetCache } from "./services/cache.js";
import { loadGeoIp } from "./engines/geoip.js";
import { ListIntelligence, loadCidrFile } from "./engines/intelligence.js";
import { MemoryRateLimitStore } from "./engines/rate-limit.js";
import { RedisRateLimitStore } from "./services/redis-rate-limit.js";
import { createQueues, enqueueTraffic, publishQueueMetrics } from "./queues.js";
import { verifySessionToken } from "./shopify/auth.js";
import { Shop } from "./models/index.js";

loadLocalEnv();
const config = getConfig();
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

function resolveDataPath(configured: string, bundled: string): string {
  if (configured) {
    const absolute = isAbsolute(configured) ? configured : resolve(repoRoot, configured);
    if (existsSync(absolute)) return absolute;
  }
  return existsSync(bundled) ? bundled : "";
}

async function main(): Promise<void> {
  await connectMongo(config.mongoUri);
  const redis = createRedis(config.redisUrl);
  let redisStarting = true;
  redis.on("error", (error) => {
    if (redisStarting) return;
    logger.error({ err: error }, "redis error");
  });
  try {
    await redis.connect();
    await redis.ping();
    logger.info("Redis connected");
  } catch (error) {
    if (config.nodeEnv === "production") throw error;
    logger.warn("Redis is unavailable. Analytics will be written inline and queues are disabled.");
    redis.disconnect();
  } finally {
    redisStarting = false;
  }
  const redisReady = redis.status === "ready";
  const liveRedis = redisReady ? redis : null;
  const queues = liveRedis ? createQueues(config.redisUrl) : null;
  const bundledGeoDb = fileURLToPath(new URL("../../../data/country.mmdb", import.meta.url));
  const bundledAsnDb = fileURLToPath(new URL("../../../data/asn.mmdb", import.meta.url));
  const bundledVpnList = fileURLToPath(new URL("../../../data/vpn-ipv4.txt", import.meta.url));
  const bundledProxyList = fileURLToPath(new URL("../../../data/proxy-ipv4.txt", import.meta.url));
  const bundledTorList = fileURLToPath(new URL("../../../data/tor-ipv4.txt", import.meta.url));
  const geoip = await loadGeoIp(
    config.geoIpCityDb || (existsSync(bundledGeoDb) ? bundledGeoDb : ""),
    config.geoIpAsnDb || (existsSync(bundledAsnDb) ? bundledAsnDb : ""),
  );
  logger.info({
    configured: geoip.configured,
    country: Boolean(config.geoIpCityDb || existsSync(bundledGeoDb)),
    asn: Boolean(config.geoIpAsnDb || existsSync(bundledAsnDb)),
  }, "GeoIP ready");
  const vpnFile = resolveDataPath(config.vpnCidrFile, bundledVpnList);
  const proxyFile = resolveDataPath(config.proxyCidrFile, bundledProxyList);
  const torFile = resolveDataPath(config.torCidrFile, bundledTorList);
  const intel = new ListIntelligence(
    await loadCidrFile(vpnFile).catch(() => []),
    await loadCidrFile(proxyFile).catch(() => []),
    await loadCidrFile(torFile).catch(() => []),
  );
  logger.info({
    vpnRanges: vpnFile ? "configured" : "empty",
    proxyRanges: proxyFile ? "configured" : "empty",
    torRanges: torFile ? "configured" : "empty",
    vpnCidrs: intel.stats.vpnCidrs,
    proxyCidrs: intel.stats.proxyCidrs,
    torCidrs: intel.stats.torCidrs,
  }, "Intelligence feeds ready");
  const app = createApp({
    config,
    redis: liveRedis,
    cache: createRulesetCache(liveRedis),
    geoip,
    intel,
    rates: liveRedis ? new RedisRateLimitStore(liveRedis) : new MemoryRateLimitStore(),
    enqueueTraffic: queues ? (record) => enqueueTraffic(queues["traffic-events"], record) : undefined,
  });
  const server = createServer(app);
  const io = new Server(server, { cors: { origin: true } });
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string") {
      next(new Error("unauthorized"));
      return;
    }
    try {
      const claims = verifySessionToken(token, config.shopifyApiKey, config.shopifyApiSecret);
      void Shop.findOne({ shopDomain: claims.shop, installed: true }).then((shop) => {
        if (!shop) next(new Error("unauthorized"));
        else {
          socket.data.shopId = String(shop._id);
          next();
        }
      }).catch(() => next(new Error("unauthorized")));
    } catch {
      next(new Error("unauthorized"));
    }
  });
  io.on("connection", (socket) => {
    if (socket.data.shopId) socket.join(String(socket.data.shopId));
  });
  if (liveRedis) {
    const sub = liveRedis.duplicate();
    await sub.psubscribe("tb:live:*");
    sub.on("pmessage", (_pattern, channel, message) => {
      const shopId = channel.split(":")[2];
      io.to(shopId).emit("traffic", JSON.parse(message));
    });
    setInterval(() => {
      if (queues) void publishQueueMetrics(liveRedis, queues);
    }, 30_000).unref();
  }
  server.listen(config.port, () => logger.info({ port: config.port }, "Traffic Blocker API listening"));
}

main().catch((error) => {
  logger.error({ err: error }, "startup failed");
  process.exit(1);
});
