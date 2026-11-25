import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { fileURLToPath } from "node:url";
import { decideRequestSchema, pixelEventSchema } from "@traffic-blocker/rule-schemas";
import { DEFAULT_BLOCKED_PAGE, type BlockedPageContent } from "@traffic-blocker/shared-types";
import { logger } from "./logger.js";
import { HttpError } from "./lib/errors.js";
import { sendData } from "./lib/http.js";
import { hashIp } from "./lib/crypto.js";
import { firstForwardedIp } from "./lib/ip.js";
import { renderBlockedPage } from "./engines/blocked-page.js";
import { MemoryRateLimitStore } from "./engines/rate-limit.js";
import { createOauthState, sanitizeShopDomain, verifyAppProxySignature, verifyOauthHmac, verifyWebhookHmac } from "./shopify/auth.js";
import { activateWebPixel, exchangeOfflineToken, registerWebhooks } from "./shopify/admin.js";
import { completeChallenge, decide, inspect } from "./services/firewall.js";
import { AuditLog, Shop, TrafficSession } from "./models/index.js";
import { deleteShopData, handleWebhook } from "./shopify/webhooks.js";
import {
  asyncRoute,
  authenticate,
  clientIp,
  firewallDeps,
  installShop,
  loadRuntime,
  sendError,
  type AppRuntime,
} from "./http/shared.js";
import { mountCountryRoutes } from "./routes/countries.js";
import { mountNetworkRoutes } from "./routes/network.js";
import { mountRuleRoutes } from "./routes/rules.js";
import { mountAnalyticsRoutes } from "./routes/analytics.js";
import { mountEdgeRoutes } from "./routes/edge.js";
import { mountBillingCallback, mountShopRoutes } from "./routes/billing.js";

const oauthStates = new Map<string, { shop: string; expires: number }>();

function jsonPayload(body: unknown): unknown {
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new HttpError(400, "BAD_REQUEST", "Decision body must be JSON");
  }
}

export function createApp(runtime: AppRuntime): express.Express {
  const { config } = runtime;
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: true, exposedHeaders: ["X-Shopify-Retry-Invalid-Session-Request"] }));
  app.use("/api/webhooks/shopify", express.raw({ type: "application/json" }));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.text({ type: "text/plain", limit: "1mb" }));

  const apiLimiter = new MemoryRateLimitStore();
  app.use("/api", (req, _res, next) => {
    apiLimiter.hit(`api:${req.ip ?? "unknown"}`, 60_000).then((count) => {
      if (count > 600) next(new HttpError(429, "RATE_LIMITED", "Too many API requests"));
      else next();
    }).catch(next);
  });

  app.get("/health", asyncRoute(async (_req, res) => {
    let redis: "up" | "down" | "not_configured" = runtime.redis ? "down" : "not_configured";
    if (runtime.redis) {
      try {
        await runtime.redis.ping();
        redis = "up";
      } catch {
        redis = "down";
      }
    }
    sendData(res, { status: "ok", apiVersion: config.shopifyApiVersion, redis, geoip: runtime.geoip.configured });
  }));

  app.get("/api/auth", asyncRoute(async (req, res) => {
    const shop = sanitizeShopDomain(String(req.query.shop ?? ""));
    if (!shop) throw new HttpError(400, "BAD_REQUEST", "A valid myshopify.com shop domain is required");
    const state = createOauthState();
    if (runtime.redis) await runtime.redis.set(`tb:oauth:${state}`, shop, "EX", 600);
    else oauthStates.set(state, { shop, expires: Date.now() + 600_000 });
    const url = new URL(`https://${shop}/admin/oauth/authorize`);
    url.searchParams.set("client_id", config.shopifyApiKey);
    url.searchParams.set("scope", config.shopifyScopes.join(","));
    url.searchParams.set("redirect_uri", `${config.appUrl}/api/auth/callback`);
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  }));

  app.get("/api/auth/callback", asyncRoute(async (req, res) => {
    const params = new URL(req.originalUrl, config.appUrl).searchParams;
    const shop = sanitizeShopDomain(params.get("shop") ?? "");
    const state = params.get("state") ?? "";
    const code = params.get("code") ?? "";
    if (!shop || !state || !code) throw new HttpError(400, "BAD_REQUEST", "OAuth callback is incomplete");
    if (!verifyOauthHmac(params, config.shopifyApiSecret)) throw new HttpError(401, "UNAUTHORIZED", "OAuth HMAC verification failed");
    const saved = runtime.redis ? await runtime.redis.get(`tb:oauth:${state}`) : oauthStates.get(state)?.shop;
    if (saved !== shop || (oauthStates.get(state)?.expires ?? Date.now() + 1) < Date.now() && !runtime.redis) {
      throw new HttpError(401, "UNAUTHORIZED", "OAuth state verification failed");
    }
    if (runtime.redis) await runtime.redis.del(`tb:oauth:${state}`);
    oauthStates.delete(state);
    const token = await exchangeOfflineToken(shop, code, config);
    const shopDoc = await installShop(shop, token.access_token, token.scope, config);
    await registerWebhooks(shop, token.access_token, config).catch((error) => logger.error({ err: error }, "webhook registration failed"));
    await activateWebPixel(shop, token.access_token, config).catch((error) => logger.error({ err: error }, "web pixel activation failed"));
    await AuditLog.create({ shopId: shopDoc._id, action: "install", resource: "shop", metadata: { shop } });
    const host = Buffer.from(`${shop}/admin`).toString("base64");
    res.redirect(`${config.appUrl}/?shop=${shop}&host=${host}`);
  }));

  app.post("/api/webhooks/shopify", asyncRoute(async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
    if (!verifyWebhookHmac(raw, req.header("x-shopify-hmac-sha256"), config.shopifyApiSecret)) {
      throw new HttpError(401, "UNAUTHORIZED", "Webhook HMAC verification failed");
    }
    const topic = req.header("x-shopify-topic") ?? "";
    const shopDomain = sanitizeShopDomain(req.header("x-shopify-shop-domain") ?? "");
    const payload = JSON.parse(raw.toString("utf8") || "{}") as Record<string, unknown>;
    if (shopDomain) await handleWebhook(shopDomain, topic, payload, runtime.cache);
    sendData(res, { received: true });
  }));

  async function runDecide(res: express.Response, shop: string, ip: string, payload: unknown): Promise<void> {
    const body = decideRequestSchema.parse(payload);
    const limited = await runtime.rates.hit(`decide:${shop}:${ip}`, 60_000);
    if (limited > 120) throw new HttpError(429, "RATE_LIMITED", "Decision rate limit exceeded");
    const decision = await decide(firewallDeps(runtime), {
      shop,
      ip,
      path: body.path,
      userAgent: body.userAgent,
      webdriver: body.webdriver,
      referrer: body.referrer,
      clearance: body.clearance,
      watch: body.watch === true,
    });
    if (!decision) throw new HttpError(404, "NOT_FOUND", "Shop is not installed");
    sendData(res, decision);
  }

  app.post("/api/v1/firewall/decide", asyncRoute(async (req, res) => {
    const body = decideRequestSchema.parse(jsonPayload(req.body));
    const shop = sanitizeShopDomain(body.shop);
    if (!shop) throw new HttpError(400, "BAD_REQUEST", "Shop domain is invalid");
    await runDecide(res, shop, clientIp(req, config), body);
  }));

  app.post("/apps/proxy/decide", asyncRoute(async (req, res) => {
    const params = new URLSearchParams(req.originalUrl.split("?")[1] ?? "");
    if (!verifyAppProxySignature(params, config.shopifyApiSecret)) {
      throw new HttpError(401, "UNAUTHORIZED", "App proxy signature is invalid");
    }
    const timestamp = Number(params.get("timestamp"));
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 600) {
      throw new HttpError(401, "UNAUTHORIZED", "App proxy request has expired");
    }
    const shop = sanitizeShopDomain(params.get("shop") ?? "");
    const ip = firstForwardedIp(req.header("x-forwarded-for"));
    if (!shop || !ip) throw new HttpError(400, "BAD_REQUEST", "App proxy request is missing the shop or client address");
    await runDecide(res, shop, ip, jsonPayload(req.body));
  }));

  app.post("/api/v1/firewall/challenge", asyncRoute(async (req, res) => {
    const payload = jsonPayload(req.body) as { nonce?: unknown };
    const body = decideRequestSchema.parse(payload);
    const nonce = String(payload?.nonce ?? "");
    const shop = sanitizeShopDomain(body.shop);
    if (!shop || !nonce) throw new HttpError(400, "BAD_REQUEST", "Shop and challenge nonce are required");
    const result = await completeChallenge(firewallDeps(runtime), {
      shop,
      ip: clientIp(req, config),
      path: body.path,
      userAgent: body.userAgent,
      webdriver: body.webdriver,
      referrer: body.referrer,
      nonce,
    });
    if (!result) throw new HttpError(400, "BAD_REQUEST", "Challenge is invalid");
    sendData(res, result);
  }));

  const embedScript = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../extensions/traffic-protection/assets/traffic-blocker.js");
  app.get("/storefront/embed.js", (_req, res) => {
    res.setHeader("cache-control", "no-cache");
    res.type("application/javascript");
    res.sendFile(embedScript);
  });

  app.get("/blocked-page/:shopDomain", asyncRoute(async (req, res) => {
    const shop = sanitizeShopDomain(req.params.shopDomain);
    const doc = shop ? await Shop.findOne({ shopDomain: shop, installed: true }) : null;
    const page = (doc?.settings?.blockedPage as BlockedPageContent | undefined) ?? DEFAULT_BLOCKED_PAGE;
    const country = typeof req.query.country === "string" ? req.query.country : null;
    res.setHeader("cache-control", "public, max-age=60");
    res.type("html").send(renderBlockedPage(page, country));
  }));

  app.post("/api/v1/pixel/events", asyncRoute(async (req, res) => {
    const body = pixelEventSchema.parse(req.body);
    const shop = sanitizeShopDomain(body.shop);
    if (!shop) throw new HttpError(400, "BAD_REQUEST", "Shop domain is invalid");
    const loaded = await loadRuntime(runtime, shop);
    if (!loaded) throw new HttpError(404, "NOT_FOUND", "Shop is not installed");
    const decision = await inspect(firewallDeps(runtime), {
      shop,
      ip: clientIp(req, config),
      path: body.path ?? "/",
      userAgent: req.header("user-agent") ?? "",
    });
    if (!decision || decision.action === "block" || decision.action === "rate_limit") {
      sendData(res, { accepted: false, duplicate: false, reason: "blocked_session" });
      return;
    }
    if (decision.action !== "allow" && decision.action !== "monitor") {
      sendData(res, { accepted: false, duplicate: false, reason: "not_approved" });
      return;
    }
    const sessionKey = `${hashIp(clientIp(req, config), loaded.ipSalt)}:${new Date().toISOString().slice(0, 10)}`;
    const existing = await TrafficSession.findOne({ shopId: loaded.id, sessionKey, approved: true });
    if (existing?.eventIds.includes(body.eventId)) {
      sendData(res, { accepted: true, duplicate: true });
      return;
    }
    if (!existing) {
      await TrafficSession.create({
        shopId: loaded.id,
        sessionKey,
        approved: true,
        classification: decision.classification,
        enforcementMode: "shopify_native",
        requestCount: 0,
        eventIds: [body.eventId],
        startedAt: new Date(body.timestamp ?? Date.now()),
        lastSeenAt: new Date(),
      });
    } else if (existing.eventIds.length < 200) {
      existing.eventIds.push(body.eventId);
      existing.lastSeenAt = new Date();
      await existing.save();
    }
    sendData(res, { accepted: true, duplicate: false });
  }));

  app.get("/api/v1/billing/callback", mountBillingCallback(runtime));

  const authed = express.Router();
  authed.use((req, _res, next) => {
    authenticate(req, config).then((shop) => {
      req.shop = shop;
      next();
    }).catch(next);
  });
  mountShopRoutes(authed, runtime);
  mountCountryRoutes(authed, runtime);
  mountNetworkRoutes(authed, runtime);
  mountRuleRoutes(authed, runtime);
  mountAnalyticsRoutes(authed, runtime);
  mountEdgeRoutes(authed, runtime);
  app.use("/api/v1", authed);

  const here = path.dirname(fileURLToPath(import.meta.url));
  const adminDist = path.resolve(here, "../../admin/dist");
  app.use(express.static(adminDist));
  app.get(/^(?!\/api|\/blocked-page\/|\/health).*/, (req, res, next) => {
    if (req.method !== "GET") {
      next();
      return;
    }
    res.sendFile(path.join(adminDist, "index.html"), (error) => {
      if (error) next();
    });
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (!(error instanceof HttpError)) logger.error({ err: error }, "request failed");
    if (res.headersSent) return;
    sendError(error, res);
  });
  return app;
}

export { deleteShopData };
