import type { Router } from "express";
import { billingSubscribeSchema, shopSettingsSchema } from "@traffic-blocker/rule-schemas";
import { PLANS, planPrice } from "../engines/plans.js";
import type { PlanId } from "@traffic-blocker/shared-types";
import { HttpError } from "../lib/errors.js";
import { sendData } from "../lib/http.js";
import { decryptSecret } from "../lib/crypto.js";
import { sanitizeShopDomain } from "../shopify/auth.js";
import { CANCEL_MUTATION, shopifyGraphql, SUBSCRIPTION_MUTATION } from "../shopify/admin.js";
import { effectivePlan, enforcePlanCaps } from "../services/plans.js";
import { Billing, Shop } from "../models/index.js";
import { asyncRoute, publicSettings, protectionStatus, refresh, shopOf, type AppRuntime } from "../http/shared.js";

export function mountShopRoutes(router: Router, runtime: AppRuntime): void {
  router.get("/shops/me", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const billing = await Billing.findOne({ shopId: shop._id });
    const plan = await effectivePlan(String(shop._id));
    sendData(res, {
      shopDomain: shop.shopDomain,
      demo: shop.demo === true,
      plan,
      billingStatus: billing?.status ?? "trial",
      trialEndsAt: billing?.trialEndsAt ?? null,
      settings: publicSettings(shop),
      protection: await protectionStatus(shop, runtime.geoip.configured),
    });
  }));

  router.put("/shops/settings", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const body = shopSettingsSchema.parse(req.body);
    if (body.enforcementMode === "edge") {
      const { assertFeature } = await import("../services/plans.js");
      await assertFeature(String(shop._id), "edge");
    }
    shop.settings.enforcementMode = body.enforcementMode;
    shop.settings.failMode = body.failMode;
    shop.settings.allowlistOverride = body.allowlistOverride;
    shop.settings.timezone = body.timezone;
    shop.settings.notifications = {
      countryBlock: body.notifyOnCountryBlock,
      attack: body.notifyOnAttack,
      bot: body.notifyOnBot,
      edgeFailure: body.notifyOnEdgeFailure,
      email: body.emailNotifications,
      dailyReport: body.dailyReport,
      weeklyReport: body.weeklyReport,
      emailAddress: body.notificationEmail ?? "",
    };
    if (body.bot) shop.settings.bot = { ...shop.settings.bot, ...body.bot };
    if (body.vpn) shop.settings.vpn = body.vpn;
    if (body.rateLimit) shop.settings.rateLimit = body.rateLimit;
    shop.markModified("settings");
    await shop.save();
    await refresh(runtime, String(shop._id));
    sendData(res, publicSettings(shop));
  }));

  router.get("/billing", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const billing = await Billing.findOne({ shopId: shop._id });
    sendData(res, {
      currentPlan: await effectivePlan(String(shop._id)),
      status: billing?.status ?? "trial",
      interval: billing?.interval ?? null,
      trialEndsAt: billing?.trialEndsAt ?? null,
      plans: Object.values(PLANS),
    });
  }));

  router.post("/billing/subscribe", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const body = billingSubscribeSchema.parse(req.body);
    if (!shop.accessTokenEncrypted) throw new HttpError(400, "BAD_REQUEST", "Install the app through Shopify before starting a subscription");
    const token = decryptSecret(shop.accessTokenEncrypted, runtime.config.encryptionKey);
    const price = planPrice(body.plan, body.interval);
    const data = await shopifyGraphql<{
      appSubscriptionCreate: {
        confirmationUrl: string | null;
        userErrors: Array<{ message: string }>;
        appSubscription: { id: string; status: string } | null;
      };
    }>(shop.shopDomain, token, SUBSCRIPTION_MUTATION, {
      name: `Traffic Blocker ${PLANS[body.plan].name}`,
      returnUrl: `${runtime.config.appUrl}/api/v1/billing/callback?shop=${shop.shopDomain}&plan=${body.plan}&interval=${body.interval}`,
      trialDays: PLANS[body.plan].trialDays,
      test: runtime.config.shopifyBillingTest,
      lineItems: [{ plan: { appRecurringPricingDetails: { price: { amount: price, currencyCode: "USD" }, interval: body.interval } } }],
    }, runtime.config);
    const errors = data.appSubscriptionCreate.userErrors;
    if (errors.length) throw new HttpError(400, "BILLING_ERROR", errors.map((error) => error.message).join("; "));
    await Billing.findOneAndUpdate(
      { shopId: shop._id },
      {
        $set: {
          plan: body.plan,
          interval: body.interval,
          status: "pending",
          subscriptionId: data.appSubscriptionCreate.appSubscription?.id ?? "",
          confirmationUrl: data.appSubscriptionCreate.confirmationUrl ?? "",
          test: runtime.config.shopifyBillingTest,
        },
      },
      { upsert: true },
    );
    sendData(res, { confirmationUrl: data.appSubscriptionCreate.confirmationUrl });
  }));

  router.post("/billing/cancel", asyncRoute(async (req, res) => {
    const shop = shopOf(req);
    const billing = await Billing.findOne({ shopId: shop._id });
    if (billing?.subscriptionId && shop.accessTokenEncrypted) {
      const token = decryptSecret(shop.accessTokenEncrypted, runtime.config.encryptionKey);
      await shopifyGraphql(shop.shopDomain, token, CANCEL_MUTATION, { id: billing.subscriptionId }, runtime.config);
    }
    if (billing) {
      billing.status = "cancelled";
      billing.plan = "STARTER";
      await billing.save();
    }
    shop.plan = "STARTER";
    await shop.save();
    await enforcePlanCaps(String(shop._id), "STARTER");
    await refresh(runtime, String(shop._id));
    sendData(res, { status: "cancelled", plan: "STARTER" });
  }));
}

export function mountBillingCallback(runtime: AppRuntime) {
  return asyncRoute(async (req, res) => {
    const shopDomain = sanitizeShopDomain(String(req.query.shop ?? ""));
    const plan = String(req.query.plan ?? "") as PlanId;
    if (!shopDomain || !PLANS[plan]) throw new HttpError(400, "BAD_REQUEST", "Billing return is invalid");
    const shop = await Shop.findOne({ shopDomain });
    if (!shop) throw new HttpError(404, "NOT_FOUND", "Shop not found");
    const billing = await Billing.findOne({ shopId: shop._id });
    if (billing) {
      billing.status = "active";
      billing.plan = plan;
      await billing.save();
    }
    shop.plan = plan;
    await shop.save();
    await enforcePlanCaps(String(shop._id), plan);
    await refresh(runtime, String(shop._id));
    res.redirect(`${runtime.config.appUrl}/billing?shop=${shopDomain}&billing=updated`);
  });
}
