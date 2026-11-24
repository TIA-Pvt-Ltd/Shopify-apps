import type { Redis } from "ioredis";
import type { CompiledRuleset } from "../engines/rules.js";

export interface RulesetCache {
  get(shopId: string): Promise<CompiledRuleset | null>;
  set(shopId: string, ruleset: CompiledRuleset): Promise<void>;
  invalidate(shopId: string): Promise<void>;
  /** Starts a compile. A slower compile must not overwrite a newer one. */
  begin(shopId: string): Promise<number>;
  current(shopId: string): Promise<number>;
}

export class MemoryRulesetCache implements RulesetCache {
  private readonly values = new Map<string, CompiledRuleset>();
  private readonly generation = new Map<string, number>();
  async get(shopId: string): Promise<CompiledRuleset | null> {
    return this.values.get(shopId) ?? null;
  }
  async set(shopId: string, ruleset: CompiledRuleset): Promise<void> {
    this.values.set(shopId, ruleset);
  }
  async invalidate(shopId: string): Promise<void> {
    this.values.delete(shopId);
  }
  async begin(shopId: string): Promise<number> {
    const next = (this.generation.get(shopId) ?? 0) + 1;
    this.generation.set(shopId, next);
    return next;
  }
  async current(shopId: string): Promise<number> {
    return this.generation.get(shopId) ?? 0;
  }
}

export function createRulesetCache(redis: Redis | null): RulesetCache {
  if (!redis) return new MemoryRulesetCache();
  return {
    async get(shopId) {
      const raw = await redis.get(`tb:rules:${shopId}`);
      return raw ? (JSON.parse(raw) as CompiledRuleset) : null;
    },
    async set(shopId, ruleset) {
      await redis.set(`tb:rules:${shopId}`, JSON.stringify(ruleset), "EX", 120);
    },
    async invalidate(shopId) {
      await redis.del(`tb:rules:${shopId}`);
    },
    async begin(shopId) {
      return redis.incr(`tb:rules-gen:${shopId}`);
    },
    async current(shopId) {
      return Number((await redis.get(`tb:rules-gen:${shopId}`)) ?? 0);
    },
  };
}
