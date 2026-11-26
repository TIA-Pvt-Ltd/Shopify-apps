import { createHmac, randomBytes } from "node:crypto";
import { safeEqual } from "../lib/crypto.js";

export function sanitizeShopDomain(value: string | undefined): string | null {
  if (!value) return null;
  const shop = value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) return null;
  return shop;
}

export function createOauthState(): string {
  return randomBytes(16).toString("hex");
}

export function verifyOauthHmac(searchParams: URLSearchParams, secret: string): boolean {
  const provided = searchParams.get("hmac");
  if (!provided) return false;
  const message = [...searchParams.keys()]
    .filter((key) => key !== "hmac" && key !== "signature")
    .sort()
    .map((key) => `${key}=${searchParams.get(key) ?? ""}`)
    .join("&");
  const digest = createHmac("sha256", secret).update(message).digest("hex");
  return safeEqual(digest, provided);
}

/**
 * Shopify app-proxy signatures are the hex HMAC of the sorted query pairs
 * joined with no separator. Array values are comma-joined. The signature
 * parameter itself is excluded.
 */
export function verifyAppProxySignature(searchParams: URLSearchParams, secret: string): boolean {
  const signature = searchParams.get("signature");
  if (!signature || !secret) return false;
  const keys = [...new Set([...searchParams.keys()].filter((key) => key !== "signature"))].sort();
  const message = keys.map((key) => `${key}=${searchParams.getAll(key).join(",")}`).join("");
  const digest = createHmac("sha256", secret).update(message).digest("hex");
  return safeEqual(digest, signature);
}

export function verifyWebhookHmac(rawBody: Buffer, header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest("base64");
  return safeEqual(digest, header);
}

export interface SessionClaims {
  shop: string;
  sub: string;
}

export function createSessionToken(input: {
  apiKey: string;
  secret: string;
  shop: string;
  sub?: string;
  now?: number;
  ttlSeconds?: number;
}): string {
  const now = Math.floor((input.now ?? Date.now()) / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(
    JSON.stringify({
      iss: `https://${input.shop}/admin`,
      dest: `https://${input.shop}`,
      aud: input.apiKey,
      sub: input.sub ?? "1",
      exp: now + (input.ttlSeconds ?? 60),
      nbf: now,
      iat: now,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", input.secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

/**
 * Allow modest clock drift between Shopify's token issuer and the API host.
 * App Bridge also reuses near-expiry cached JWTs; Windows hosts commonly drift
 * 15–30s, which previously surfaced every request as "Invalid session token".
 */
const SESSION_CLOCK_TOLERANCE_MS = 90_000;

export function verifySessionToken(token: string, apiKey: string, secret: string, now = Date.now()): SessionClaims {
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) throw new Error("Malformed session token");
  const expected = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  if (!safeEqual(expected, signature)) throw new Error("Invalid session token");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
    aud?: string;
    dest?: string;
    sub?: string;
    exp?: number;
    nbf?: number;
  };
  if (payload.aud !== apiKey) throw new Error("Invalid session audience");
  if (!payload.exp || payload.exp * 1000 < now - SESSION_CLOCK_TOLERANCE_MS) throw new Error("Expired session token");
  if (payload.nbf && payload.nbf * 1000 > now + SESSION_CLOCK_TOLERANCE_MS) throw new Error("Session token is not active");
  const shop = sanitizeShopDomain(payload.dest);
  if (!shop || !payload.sub) throw new Error("Invalid session shop");
  return { shop, sub: payload.sub };
}
