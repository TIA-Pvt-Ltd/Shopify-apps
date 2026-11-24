import { createHmac, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual, createHash } from "node:crypto";

export function randomId(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function encryptSecret(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) throw new Error("CREDENTIALS_ENCRYPTION_KEY must be 32 bytes of hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}.${tag.toString("hex")}.${encrypted.toString("hex")}`;
}

export function decryptSecret(payload: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  const [ivHex, tagHex, dataHex] = payload.split(".");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Malformed encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}

export function hashIp(ip: string, salt: string): string {
  return sha256(`${salt}:${ip}`).slice(0, 32);
}

export interface ClearancePayload {
  shopId: string;
  ipHash: string;
  exp: number;
  kind: "nonce" | "clearance";
  notBefore?: number;
}

export function issueClearance(secret: string, payload: ClearancePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(secret, body)}`;
}

export function readClearance(secret: string, token: string, now = Date.now()): ClearancePayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature || !safeEqual(sign(secret, body), signature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ClearancePayload;
    if (!payload.shopId || !payload.ipHash || payload.exp < now || !payload.kind) return null;
    return payload;
  } catch {
    return null;
  }
}
