import type { Action, TrafficClassification } from "@traffic-blocker/shared-types";

export interface DateRange {
  from: Date;
  to: Date;
}

export type DatePreset = "24h" | "7d" | "30d" | "90d" | "custom";

export function resolveDateRange(preset: DatePreset, now = new Date(), custom?: { from?: string; to?: string }): DateRange {
  if (preset === "custom") {
    const from = custom?.from ? new Date(custom.from) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const to = custom?.to ? new Date(custom.to) : now;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw new Error("Invalid custom date range");
    }
    return { from, to };
  }
  const hours = preset === "24h" ? 24 : preset === "7d" ? 24 * 7 : preset === "30d" ? 24 * 30 : 24 * 90;
  return { from: new Date(now.getTime() - hours * 60 * 60 * 1000), to: now };
}

export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function eachDay(range: DateRange): string[] {
  const days: string[] = [];
  const cursor = new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), range.from.getUTCDate()));
  const end = new Date(Date.UTC(range.to.getUTCFullYear(), range.to.getUTCMonth(), range.to.getUTCDate()));
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/**
 * Metric mapping. These counters are not interchangeable.
 * allowedRequests includes monitor (access continued, security event recorded).
 * blockedRequests includes hard blocks and rate-limit denials.
 * detectedBots overlaps other counters; a bot can be allowed or blocked.
 * cleanSessions counts approved human or verified-crawler sessions only.
 */
export function contributesToAllowed(action: Action): boolean {
  return action === "allow" || action === "monitor";
}

export function contributesToBlocked(action: Action): boolean {
  return action === "block" || action === "rate_limit";
}

export function isApprovedSession(action: Action, classification: TrafficClassification): boolean {
  return contributesToAllowed(action) && (classification === "human" || classification === "verified_crawler");
}

export function isBotClassification(classification: TrafficClassification): boolean {
  return classification === "bot";
}

export type TrafficSource = "direct" | "search" | "social" | "email" | "referral";

const SEARCH_HOSTS = ["google.", "bing.", "yahoo.", "duckduckgo.", "baidu.", "yandex."];
const SOCIAL_HOSTS = ["facebook.", "instagram.", "t.co", "twitter.", "x.com", "linkedin.", "pinterest.", "tiktok.", "reddit."];

export function classifySource(referrer: string): TrafficSource {
  if (!referrer) return "direct";
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    if (SEARCH_HOSTS.some((entry) => host.includes(entry))) return "search";
    if (SOCIAL_HOSTS.some((entry) => host === entry || host.endsWith(`.${entry}`) || host.includes(entry))) return "social";
    if (host.includes("mail.") || host.includes("outlook.") || host.includes("gmail.")) return "email";
    return "referral";
  } catch {
    return "referral";
  }
}

export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const encode = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? "" : String(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  return [headers.map(encode).join(","), ...rows.map((row) => row.map(encode).join(","))].join("\n");
}

export function retentionCutoff(retentionDays: number, now = new Date()): Date {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}
