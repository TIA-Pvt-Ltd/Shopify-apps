import { randomBytes } from "node:crypto";
import type { Router } from "express";
import { dnsApplySchema, edgeConnectSchema } from "@traffic-blocker/rule-schemas";
import { SIMULATED_EDGE_SUMMARY, type PlanId } from "@traffic-blocker/shared-types";
import { HttpError } from "../lib/errors.js";
import { sendData } from "../lib/http.js";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";
import { buildCloudflareExpression, CloudflareEdgeProvider, MockEdgeProvider, probeExpression, runEdgeDeployment, signEdgeExpression, type EdgeProvider } from "../engines/edge.js";
import { compileShop } from "../services/plans.js";
import { assertFeature, enforcePlanCaps } from "../services/plans.js";
import { ConfigVersion, EdgeIntegration, Notification } from "../models/index.js";
import { asyncRoute, audit, emptySet, refresh, shopOf, type AppRuntime } from "../http/shared.js";

export function mountEdgeRoutes(router: Router, runtime: AppRuntime): void {
  router.get("/edge", asyncRoute(async (req, res) => {
    const integration = await EdgeIntegration.findOne({ shopId: shopOf(req)._id }).sort({ updatedAt: -1 });
    sendData(res, integration ? publicEdge(integration) : { status: "not_connected", protectionActive: false, simulated: false, provider: null });
  }));

  router.post("/edge/connect", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const body = edgeConnectSchema.parse(req.body);
    await assertFeature(String(shop._id), "edge");
    const integration = await EdgeIntegration.findOneAndUpdate(
      { shopId: shop._id, provider: body.provider },
      {
        $set: {
          hostname: body.hostname.toLowerCase(),
          zoneId: body.zoneId ?? "",
          apiTokenEncrypted: body.apiToken ? encryptSecret(body.apiToken, runtime.config.encryptionKey) : "",
          status: body.provider === "mock" ? "simulated" : "pending",
          simulated: body.provider === "mock",
          protectionActive: false,
          lastMessage: body.provider === "mock" ? SIMULATED_EDGE_SUMMARY : "Connected. A live probe has not succeeded yet.",
        },
      },
      { upsert: true, new: true },
    );
    await audit(shop, "connect", "edge", body.provider);
    sendData(res, publicEdge(integration));
  }));

  router.post("/edge/verify", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const integration = await requireEdge(shop._id);
    const provider = providerFor(integration.provider, runtime);
    const checks = await provider.verify(edgeRequest(shop.shopDomain, integration, runtime));
    integration.checks = checks;
    integration.protectionActive = false;
    integration.status = provider.simulated ? "simulated" : checks.every((check) => check.ok) ? "pending" : "failed";
    integration.lastMessage = provider.simulated ? SIMULATED_EDGE_SUMMARY : "Verification recorded. Deployment is not active until a live probe succeeds.";
    await integration.save();
    sendData(res, publicEdge(integration));
  }));

  router.post("/edge/deploy", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const integration = await requireEdge(shop._id);
    const provider = providerFor(integration.provider, runtime);
    const ruleset = await compileShop(String(shop._id));
    const expression = buildCloudflareExpression(ruleset);
    const nonce = randomBytes(16).toString("hex");
    const result = await runEdgeDeployment({
      provider,
      expression,
      probeExpression: probeExpression(nonce),
      request: {
        ...edgeRequest(shop.shopDomain, integration, runtime, nonce),
        ruleset,
        previousRulesetId: integration.rulesetId || null,
      },
    });
    integration.protectionActive = result.protectionActive;
    integration.simulated = result.simulated;
    integration.status = result.status;
    integration.lastMessage = result.message;
    integration.checks = result.checks;
    if (result.protectionActive) integration.lastVerifiedAt = new Date();
    if (result.rulesetId) integration.rulesetId = result.rulesetId;
    integration.configSignature = signEdgeExpression(runtime.config.signingSecret, ruleset.version, expression);
    integration.version = ruleset.version;
    await integration.save();
    await ConfigVersion.create({ shopId: shop._id, version: ruleset.version, signature: integration.configSignature, snapshot: ruleset });
    if (!result.protectionActive && shop.settings.notifications?.edgeFailure !== false) {
      await Notification.create({
        shopId: shop._id,
        type: "edge_deployment",
        severity: "warning",
        title: "Edge deployment is not active",
        body: result.message,
        emailStatus: "not_requested",
      });
    }
    await refresh(runtime, String(shop._id));
    sendData(res, publicEdge(integration));
  }));

  router.post("/edge/rollback", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const integration = await requireEdge(shop._id);
    const provider = providerFor(integration.provider, runtime);
    await provider.rollback({
      ...edgeRequest(shop.shopDomain, integration, runtime),
      previousRulesetId: integration.previousRulesetId || null,
      ruleset: emptySet(String(shop._id)),
    });
    integration.protectionActive = false;
    integration.status = provider.simulated ? "simulated" : "rolled_back";
    integration.lastMessage = provider.simulated ? SIMULATED_EDGE_SUMMARY : "Rolled back. The previous provider configuration remains the one in effect.";
    await integration.save();
    await refresh(runtime, String(shop._id));
    sendData(res, publicEdge(integration));
  }));

  router.post("/edge/disconnect", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const integration = await requireEdge(shop._id);
    await providerFor(integration.provider, runtime).disconnect(edgeRequest(shop.shopDomain, integration, runtime));
    integration.protectionActive = false;
    integration.status = "not_connected";
    integration.apiTokenEncrypted = "";
    integration.lastMessage = "Disconnected.";
    await integration.save();
    await refresh(runtime, String(shop._id));
    sendData(res, publicEdge(integration));
  }));

  router.post("/edge/dns/apply", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const body = dnsApplySchema.parse(req.body);
    const integration = await requireEdge(shop._id);
    if (integration.provider !== "cloudflare" || integration.simulated) {
      throw new HttpError(400, "BAD_REQUEST", "DNS changes require a real Cloudflare connection and explicit approval.");
    }
    const provider = providerFor(integration.provider, runtime);
    if (!provider.applyDns) throw new HttpError(400, "BAD_REQUEST", "This provider cannot edit DNS");
    await provider.applyDns({
      ...edgeRequest(shop.shopDomain, integration, runtime),
      recordType: body.recordType,
      name: body.name,
      content: body.content,
    });
    await audit(shop, "dns_change", "edge", integration.provider, { name: body.name, type: body.recordType, approved: true });
    sendData(res, { updated: true });
  }));
}

function publicEdge(integration: {
  provider: string;
  hostname?: string;
  zoneId?: string;
  status: string;
  protectionActive: boolean;
  simulated: boolean;
  lastVerifiedAt?: Date | null;
  lastMessage?: string;
  checks?: unknown;
  apiTokenEncrypted?: string;
}) {
  return {
    provider: integration.provider,
    hostname: integration.hostname ?? "",
    zoneId: integration.zoneId ?? "",
    tokenPresent: Boolean(integration.apiTokenEncrypted),
    status: integration.status,
    protectionActive: Boolean(integration.protectionActive && !integration.simulated),
    simulated: integration.simulated,
    lastVerifiedAt: integration.lastVerifiedAt ?? null,
    message: integration.lastMessage ?? "",
    checks: integration.checks ?? [],
  };
}

async function requireEdge(shopId: unknown) {
  const integration = await EdgeIntegration.findOne({ shopId }).sort({ updatedAt: -1 });
  if (!integration) throw new HttpError(404, "NOT_FOUND", "No edge provider is connected");
  return integration;
}

function providerFor(provider: string, runtime: AppRuntime): EdgeProvider {
  if (provider === "cloudflare") return new CloudflareEdgeProvider(runtime.config.cloudflareApiBase);
  return new MockEdgeProvider();
}

function edgeRequest(
  shopDomain: string,
  integration: { hostname?: string; zoneId?: string; apiTokenEncrypted?: string },
  runtime: AppRuntime,
  probeNonce = randomBytes(16).toString("hex"),
) {
  return {
    shopDomain,
    hostname: integration.hostname || shopDomain,
    zoneId: integration.zoneId || undefined,
    apiToken: integration.apiTokenEncrypted ? decryptSecret(integration.apiTokenEncrypted, runtime.config.encryptionKey) : undefined,
    ruleset: emptySet("pending"),
    probeNonce,
  };
}

export async function syncPlanFromBilling(shopId: string, plan: PlanId, runtime: AppRuntime): Promise<void> {
  await enforcePlanCaps(shopId, plan);
  await refresh(runtime, shopId);
}
