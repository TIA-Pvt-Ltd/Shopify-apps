import type { Redis } from "ioredis";
import type { RateLimitStore } from "../engines/rate-limit.js";

export class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly redis: Redis) {}

  async hit(key: string, windowMs: number, now = Date.now()): Promise<number> {
    const redisKey = `tb:rl:${key}`;
    const member = `${now}:${Math.random().toString(16).slice(2)}`;
    const result = await this.redis
      .multi()
      .zremrangebyscore(redisKey, 0, now - windowMs)
      .zadd(redisKey, now, member)
      .zcard(redisKey)
      .pexpire(redisKey, windowMs)
      .exec();
    const count = result?.[2]?.[1];
    return typeof count === "number" ? count : 0;
  }
}
