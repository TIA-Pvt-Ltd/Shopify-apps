import { loadLocalEnv } from "./load-env.js";
import { getConfig } from "./config.js";
import { logger } from "./logger.js";
import { connectMongo, createRedis } from "./db.js";
import { createRulesetCache } from "./services/cache.js";
import { createQueues, publishQueueMetrics, startWorkers } from "./queues.js";

loadLocalEnv();
const config = getConfig();

async function main(): Promise<void> {
  await connectMongo(config.mongoUri);
  const redis = createRedis(config.redisUrl);
  redis.on("error", (error) => logger.error({ err: error }, "redis error"));
  await redis.connect();
  const cache = createRulesetCache(redis);
  const queues = createQueues(config.redisUrl);
  await queues["scheduled-rules"].add("expire", {}, { repeat: { every: 60_000 }, jobId: "expire-rules" });
  await queues["edge-health"].add("health", {}, { repeat: { every: 300_000 }, jobId: "edge-health" });
  await queues["config-sync"].add("sync", {}, { repeat: { every: 300_000 }, jobId: "config-sync" });
  startWorkers(config.redisUrl, redis, cache);
  setInterval(() => {
    void publishQueueMetrics(redis, queues);
  }, 30_000).unref();
  logger.info("Traffic Blocker workers started");
}

main().catch((error) => {
  logger.error({ err: error }, "worker startup failed");
  process.exit(1);
});
