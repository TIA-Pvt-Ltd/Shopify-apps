import ipaddr from "ipaddr.js";

export class IpValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IpValidationError";
  }
}

export interface ParsedNetwork {
  cidr: string;
  version: 4 | 6;
  singleHost: boolean;
}

export function normalizeIp(value: string): string | null {
  try {
    const parsed = ipaddr.parse(value.trim());
    if (parsed.kind() === "ipv6") {
      const address = parsed as ipaddr.IPv6;
      if (address.isIPv4MappedAddress()) return address.toIPv4Address().toString();
    }
    return parsed.toNormalizedString();
  } catch {
    return null;
  }
}

export function parseNetwork(value: string): ParsedNetwork {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes(" ")) {
    throw new IpValidationError("Enter a single IP address or CIDR range");
  }
  try {
    if (trimmed.includes("/")) {
      const [address, prefix] = ipaddr.parseCIDR(trimmed);
      const maxPrefix = address.kind() === "ipv4" ? 32 : 128;
      if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
        throw new IpValidationError("CIDR prefix is out of range");
      }
      const version = address.kind() === "ipv4" ? 4 : 6;
      return {
        cidr: `${address.toNormalizedString()}/${prefix}`,
        version,
        singleHost: prefix === maxPrefix,
      };
    }
    const address = ipaddr.parse(trimmed);
    if (address.kind() === "ipv6") {
      const v6 = address as ipaddr.IPv6;
      if (v6.isIPv4MappedAddress()) {
        return { cidr: `${v6.toIPv4Address().toString()}/32`, version: 4, singleHost: true };
      }
    }
    const version = address.kind() === "ipv4" ? 4 : 6;
    const prefix = version === 4 ? 32 : 128;
    return { cidr: `${address.toNormalizedString()}/${prefix}`, version, singleHost: true };
  } catch (error) {
    if (error instanceof IpValidationError) throw error;
    throw new IpValidationError("Invalid IP address or CIDR range");
  }
}

export function ipInCidr(ip: string, cidr: string): boolean {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;
  try {
    const address = ipaddr.parse(normalized);
    const range = ipaddr.parseCIDR(cidr);
    if (address.kind() !== range[0].kind()) return false;
    return address.match(range);
  } catch {
    return false;
  }
}

/** First valid address in X-Forwarded-For. Used only after Shopify's proxy signature checks out. */
export function firstForwardedIp(forwardedFor: string | null | undefined): string | null {
  if (!forwardedFor) return null;
  for (const part of forwardedFor.split(",")) {
    const ip = normalizeIp(part);
    if (ip) return ip;
  }
  return null;
}

export function ipInAnyCidr(ip: string, cidrs: readonly string[]): boolean {
  return cidrs.some((cidr) => ipInCidr(ip, cidr));
}

/**
 * The socket address is the client unless it belongs to an explicitly trusted proxy.
 * Forwarded headers from any other address are ignored.
 * When the socket is trusted, the client is the nearest address in X-Forwarded-For
 * that is not itself a trusted proxy, walking from the right.
 */
export function extractClientIp(input: {
  remoteAddress: string | undefined;
  forwardedFor?: string | null;
  cfConnectingIp?: string | null;
  trustedProxyCidrs: readonly string[];
}): string {
  const remote = normalizeIp(input.remoteAddress ?? "") ?? "0.0.0.0";
  const trusted = input.trustedProxyCidrs.length > 0 && ipInAnyCidr(remote, input.trustedProxyCidrs);
  if (!trusted) return remote;

  const cf = input.cfConnectingIp ? normalizeIp(input.cfConnectingIp) : null;
  if (cf) return cf;

  if (!input.forwardedFor) return remote;
  const parts = input.forwardedFor
    .split(",")
    .map((part) => normalizeIp(part))
    .filter((part): part is string => Boolean(part));
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const candidate = parts[index];
    if (!ipInAnyCidr(candidate, input.trustedProxyCidrs)) return candidate;
  }
  return remote;
}
