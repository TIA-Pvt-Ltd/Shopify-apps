import { authenticate } from "../shopify.server";
import { loadStorefrontCustomizerPage } from "./storefront-page.server";

export async function loadAppProxyCustomizerPage({ request }) {
  const url = new URL(request.url);
  let shop = url.searchParams.get("shop") || "";
  try {
    const result = await authenticate.public.appProxy(request);
    shop = result.session?.shop || shop;
  } catch (error) {
    console.error("[product-customizer:proxy.customizer]", error);
  }

  const productId =
    url.searchParams.get("product_id") || url.searchParams.get("productId");
  const handle = url.searchParams.get("handle") || "";
  const domain = shop.replace(/^https?:\/\//, "");

  return loadStorefrontCustomizerPage({
    request,
    shop,
    productId,
    handle,
    apiBase: domain
      ? `https://${domain}/apps/product-customizer`
      : "/apps/product-customizer",
  });
}
