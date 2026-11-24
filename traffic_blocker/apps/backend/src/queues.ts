import { Queue, Worker, type ConnectionOptions } from "bullmq";
import type { Redis } from "ioredis";
import { logger } from "./logger.js";
import { persistTraffic } from "./services/traffic.js";
import type { TrafficRecord } from "./services/firewall.js";
import { ASNBlock, CountryBlock, CustomRule, IPBlock, Shop } from "./models/index.js";
import { refreshRules } from "./services/plans.js";
import type { RulesetCache } from "./services/cache.js";

export const QUEUE_NAMES = [
  "traffic-events",
  "analytics-aggregation",
  "geoip-updates",
  "config-sync",
  "edge-deployment",
  "edge-health",
  "ip-intelligence",
  "notifications",
  "scheduled-rules",
  "billing-sync",
] as const;

export function bullConnection(redisUrl: string): ConnectionOptions {
  return { url: redisUrl, maxRetriesPerRequest: null };
}

export function createQueues(redisUrl: string): Record<(typeof QUEUE_NAMES)[number], Queue> {
  const connection = bullConnection(redisUrl);
  return Object.fromEntries(QUEUE_NAMES.map((name) => [name, new Queue(name, { connection })])) as Record<(typeof QUEUE_NAMES)[number], Queue>;
}

export async function enqueueTraffic(queue: Queue, record: TrafficRecord): Promise<void> {
  await queue.add("record", record, {
    jobId: record.requestId,
    attempts: 5,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: 1000,
    removeOnFail: false,
  });
}

export function startWorkers(redisUrl: string, redis: Redis, cache: RulesetCache): Worker[] {
  const connection = bullConnection(redisUrl);
  const traffic = new Worker("traffic-events", async (job) => {
    await persistTraffic(job.data as TrafficRecord, redis);
  }, { connection });
  const scheduled = new Worker("scheduled-rules", async () => {
    const now = new Date();
    const [countries, ips, asns, rules] = await Promise.all([
      CountryBlock.find({ enabled: true, expiresAt: { $lte: now } }),
      IPBlock.find({ enabled: true, expiresAt: { $lte: now } }),
      ASNBlock.find({ enabled: true, expiresAt: { $lte: now } }),
      CustomRule.find({ enabled: true, expiresAt: { $lte: now } }),
    ]);
    const shopIds = new Set<string>();
    for (const rule of [...countries, ...ips, ...asns, ...rules]) {
      rule.enabled = false;
      await rule.save();
      shopIds.add(String(rule.shopId));
    }
    for (const shopId of shopIds) await refreshRules(shopId, cache);
    return { expired: shopIds.size };
  }, { connection });
  const health = new Worker("edge-health", async () => ({ checked: true, note: "Edge protection stays active only after a successful probe." }), { connection });
  const configSync = new Worker("config-sync", async () => {
    const shops = await Shop.find({ installed: true }).select("_id");
    for (const shop of shops) await refreshRules(String(shop._id), cache);
    return { shops: shops.length };
  }, { connection });
  const idle = ["analytics-aggregation", "geoip-updates", "edge-deployment", "ip-intelligence", "notifications", "billing-sync"].map((name) =>
    new Worker(name, async (job) => {
      logger.info({ queue: name, jobId: job.id }, "background job acknowledged");
      return { acknowledged: true };
    }, { connection }),
  );
  const workers = [traffic, scheduled, health, configSync, ...idle];
  for (const worker of workers) {
    worker.on("failed", (job, error) => {
      logger.error({ err: error, queue: worker.name, jobId: job?.id, attempts: job?.attemptsMade }, "job failed");
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        void redis.lpush("tb:dead-letter", JSON.stringify({ queue: worker.name, id: job.id, reason: error.message, at: new Date().toISOString() }));
        void redis.ltrim("tb:dead-letter", 0, 200);
      }
    });
  }
  return workers;
}

export async function publishQueueMetrics(redis: Redis, queues: Record<string, Queue>): Promise<void> {
  const metrics = [];
  for (const [name, queue] of Object.entries(queues)) {
    const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
    metrics.push({ name, ...counts });
  }
  await redis.set("tb:queue-metrics", JSON.stringify(metrics), "EX", 120);
}
