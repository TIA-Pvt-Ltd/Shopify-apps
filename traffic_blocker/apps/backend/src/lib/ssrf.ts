import { isIP } from "node:net";
import { promises as dns } from "node:dns";

const BLOCKED_HOSTS = new Set(["localhost", "localhost.localdomain", "metadata.google.internal"]);

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

export async function assertPublicHttpsUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SsrfError("URL is invalid");
  }
  if (url.protocol !== "https:") throw new SsrfError("URL must use https");
  if (url.username || url.password) throw new SsrfError("URL must not include credentials");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new SsrfError("URL host is not allowed");
  }
  if (isIP(host)) {
    if (isNonPublicIp(host)) throw new SsrfError("URL resolves to a non-public address");
    return url;
  }
  const records = [...(await resolveOrEmpty(host, "A")), ...(await resolveOrEmpty(host, "AAAA"))];
  if (records.length === 0) throw new SsrfError("URL host did not resolve");
  if (records.some((record) => isNonPublicIp(record))) {
    throw new SsrfError("URL resolves to a non-public address");
  }
  return url;
}

async function resolveOrEmpty(host: string, kind: "A" | "AAAA"): Promise<string[]> {
  try {
    return kind === "A" ? await dns.resolve4(host) : await dns.resolve6(host);
  } catch {
    return [];
  }
}

export function isNonPublicIp(value: string): boolean {
  const ip = value.toLowerCase();
  if (ip === "::1" || ip === "0.0.0.0") return true;
  if (ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("169.254.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80") || ip.startsWith("::ffff:127.") || ip.startsWith("::ffff:10.")) {
    return true;
  }
  return false;
}
