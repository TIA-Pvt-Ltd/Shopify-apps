export interface RateLimitStore {
  hit(key: string, windowMs: number, now?: number): Promise<number>;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, number[]>();

  async hit(key: string, windowMs: number, now = Date.now()): Promise<number> {
    const fresh = (this.buckets.get(key) ?? []).filter((timestamp) => timestamp > now - windowMs);
    fresh.push(now);
    this.buckets.set(key, fresh);
    return fresh.length;
  }
}

export interface RateSnapshot {
  perSecond: number;
  perMinute: number;
  perHour: number;
}

export async function snapshotRates(store: RateLimitStore, key: string, now = Date.now()): Promise<RateSnapshot> {
  const [perSecond, perMinute, perHour] = await Promise.all([
    store.hit(`${key}:s`, 1000, now),
    store.hit(`${key}:m`, 60_000, now),
    store.hit(`${key}:h`, 3_600_000, now),
  ]);
  return { perSecond, perMinute, perHour };
}
