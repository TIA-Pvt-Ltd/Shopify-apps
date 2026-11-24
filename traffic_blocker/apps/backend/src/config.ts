import { randomBytes } from "node:crypto";

export interface AppConfig {
  nodeEnv: string;
  port: number;
  appUrl: string;
  adminOrigin: string;
  logLevel: string;
  shopifyApiKey: string;
  shopifyApiSecret: string;
  shopifyApiVersion: string;
  shopifyScopes: string[];
  shopifyBillingTest: boolean;
  allowDevAuth: boolean;
  devShopDomain: string;
  mongoUri: string;
  redisUrl: string;
  encryptionKey: string;
  signingSecret: string;
  trustedProxyCidrs: string[];
  geoIpCityDb: string;
  geoIpAsnDb: string;
  vpnCidrFile: string;
  proxyCidrFile: string;
  torCidrFile: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  smtpFrom: string;
  cloudflareApiBase: string;
}

function ephemeralKey(): string {
  return randomBytes(32).toString("hex");
}

export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? "development";
  const allowDevAuth = env.ALLOW_DEV_AUTH === "true";
  if (nodeEnv === "production" && allowDevAuth) {
    throw new Error("ALLOW_DEV_AUTH cannot be enabled in production");
  }
  const encryptionKey = env.CREDENTIALS_ENCRYPTION_KEY || (nodeEnv === "production" ? "" : ephemeralKey());
  const signingSecret = env.SIGNING_SECRET || env.SHOPIFY_API_SECRET || (nodeEnv === "production" ? "" : ephemeralKey());
  if (nodeEnv === "production" && (!env.SHOPIFY_API_KEY || !env.SHOPIFY_API_SECRET || !env.MONGODB_URI || !encryptionKey || !signingSecret)) {
    throw new Error("Production requires Shopify credentials, MONGODB_URI, CREDENTIALS_ENCRYPTION_KEY, and SIGNING_SECRET");
  }
  if (encryptionKey && Buffer.from(encryptionKey, "hex").length !== 32) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY must be 64 hex characters");
  }
  return {
    nodeEnv,
    port: Number(env.PORT ?? 3000),
    appUrl: env.APP_URL ?? "http://localhost:3000",
    adminOrigin: env.ADMIN_ORIGIN ?? "http://localhost:5173",
    logLevel: env.LOG_LEVEL ?? (nodeEnv === "test" ? "silent" : "info"),
    shopifyApiKey: env.SHOPIFY_API_KEY ?? "dev-api-key",
    shopifyApiSecret: env.SHOPIFY_API_SECRET ?? "dev-api-secret",
    shopifyApiVersion: env.SHOPIFY_API_VERSION ?? "2026-10",
    shopifyScopes: (env.SHOPIFY_SCOPES ?? "read_themes,write_themes").split(",").map((scope) => scope.trim()).filter(Boolean),
    shopifyBillingTest: env.SHOPIFY_BILLING_TEST !== "false",
    allowDevAuth,
    devShopDomain: env.DEV_SHOP_DOMAIN ?? "dev-shop.myshopify.com",
    mongoUri: env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/traffic_blocker",
    redisUrl: env.REDIS_URL ?? "redis://127.0.0.1:6379",
    encryptionKey,
    signingSecret,
    trustedProxyCidrs: (env.TRUSTED_PROXY_CIDRS ?? "").split(",").map((cidr) => cidr.trim()).filter(Boolean),
    geoIpCityDb: env.GEOIP_CITY_DB ?? "",
    geoIpAsnDb: env.GEOIP_ASN_DB ?? "",
    vpnCidrFile: env.VPN_CIDR_FILE ?? "",
    proxyCidrFile: env.PROXY_CIDR_FILE ?? "",
    torCidrFile: env.TOR_CIDR_FILE ?? "",
    smtpHost: env.SMTP_HOST ?? "",
    smtpPort: Number(env.SMTP_PORT ?? 587),
    smtpUser: env.SMTP_USER ?? "",
    smtpPassword: env.SMTP_PASSWORD ?? "",
    smtpFrom: env.SMTP_FROM ?? "Traffic Blocker <noreply@example.com>",
    cloudflareApiBase: env.CLOUDFLARE_API_BASE ?? "https://api.cloudflare.com/client/v4",
  };
}
