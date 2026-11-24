import { register } from "@shopify/web-pixels-extension";

/**
 * Records Shopify customer events for sessions this app has not marked as blocked.
 * It does not control other apps' pixels or Shopify's native analytics.
 * Shopify runs this pixel only when the analytics consent configured on the extension is granted.
 */
register(({ analytics, browser, settings, init }) => {
  const events = ["page_viewed", "product_viewed", "collection_viewed", "search_submitted", "cart_viewed", "checkout_started", "checkout_completed"];
  for (const name of events) {
    analytics.subscribe(name, async (event) => {
      const decision = await browser.sessionStorage.getItem("tb_decision");
      if (decision === "block" || decision === "rate_limit") return;
      const endpoint = String(settings.endpoint || "").replace(/\/$/, "");
      if (!endpoint || !event.id) return;
      const shop = init.data.shop.myshopifyDomain;
      const path = event.context?.document?.location?.pathname ?? "";
      await fetch(`${endpoint}/api/v1/pixel/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          shop,
          eventId: event.id,
          name: event.name,
          timestamp: event.timestamp,
          path,
        }),
        keepalive: true,
      });
    });
  }
});
