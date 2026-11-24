import type { PlanId } from "@traffic-blocker/shared-types";
import {
  AnalyticsDaily,
  ASNBlock,
  AuditLog,
  Billing,
  BlockEvent,
  BotDetection,
  ConfigVersion,
  CountryBlock,
  CustomRule,
  EdgeIntegration,
  IPBlock,
  Notification,
  Shop,
  TrafficSession,
  Whitelist,
} from "../models/index.js";
import type { RulesetCache } from "../services/cache.js";
import { enforcePlanCaps, refreshRules } from "../services/plans.js";

export async function handleWebhook(
  shopDomain: string,
  topic: string,
  payload: Record<string, unknown>,
  cache: RulesetCache,
): Promise<void> {
  const shop = await Shop.findOne({ shopDomain });
  if (topic === "app/uninstalled" && shop) {
    shop.installed = false;
    shop.uninstalledAt = new Date();
    shop.accessTokenEncrypted = "";
    await shop.save();
    await AuditLog.create({ shopId: shop._id, action: "uninstalled", resource: "shop" });
  }
  if (topic === "app_subscriptions/update" && shop) {
    const subscription = (payload.app_subscription ?? payload) as { status?: string };
    const billing = await Billing.findOne({ shopId: shop._id });
    if (billing && subscription.status) {
      billing.status = subscription.status.toLowerCase();
      if (billing.status === "active") shop.plan = billing.plan;
      if (billing.status === "cancelled" || billing.status === "expired") shop.plan = "STARTER";
      await billing.save();
      await shop.save();
      await enforcePlanCaps(String(shop._id), shop.plan as PlanId);
      await refreshRules(String(shop._id), cache);
    }
  }
  if (topic === "customers/data_request" && shop) {
    await AuditLog.create({
      shopId: shop._id,
      action: "data_request",
      resource: "privacy",
      metadata: { note: "Traffic Blocker stores IP hashes and shop configuration, not Shopify customer profiles." },
    });
  }
  if (topic === "customers/redact" && shop) {
    await AuditLog.create({
      shopId: shop._id,
      action: "customers_redact",
      resource: "privacy",
      metadata: { deletedCustomerRecords: 0 },
    });
  }
  if (topic === "shop/redact") await deleteShopData(shopDomain);
}

export async function deleteShopData(shopDomain: string): Promise<void> {
  const shop = await Shop.findOne({ shopDomain });
  if (!shop) return;
  const shopId = shop._id;
  await Promise.all([
    CountryBlock.deleteMany({ shopId }),
    IPBlock.deleteMany({ shopId }),
    ASNBlock.deleteMany({ shopId }),
    CustomRule.deleteMany({ shopId }),
    BlockEvent.deleteMany({ shopId }),
    TrafficSession.deleteMany({ shopId }),
    AnalyticsDaily.deleteMany({ shopId }),
    BotDetection.deleteMany({ shopId }),
    Whitelist.deleteMany({ shopId }),
    Notification.deleteMany({ shopId }),
    Billing.deleteMany({ shopId }),
    EdgeIntegration.deleteMany({ shopId }),
    ConfigVersion.deleteMany({ shopId }),
    AuditLog.deleteMany({ shopId }),
  ]);
  await shop.deleteOne();
}
