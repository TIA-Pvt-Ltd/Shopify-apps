import { getStoreByShop } from "./store.server";
import { getCustomizerByProduct } from "./product.server";
import { listAssets } from "./asset.server";
import { getAppUrl } from "./storefront-api.server";
import { parseShopDomain } from "../utils/gid";

export async function loadStorefrontCustomizerPage({
  request,
  shop,
  productId,
  apiBase,
}) {
  const appUrl = getAppUrl(request);
  const domain = parseShopDomain(shop);
  const empty = {
    shop: domain || "",
    appUrl,
    customizer: null,
    product: null,
    assets: [],
    fonts: [],
    apiBase: apiBase || "",
  };

  if (!domain) {
    return { ...empty, error: "Shop is required." };
  }

  const store = await getStoreByShop(domain);
  if (!store) {
    return {
      ...empty,
      error: "Product customizer is not enabled for this product.",
    };
  }

  const [customizer, fonts] = await Promise.all([
    getCustomizerByProduct(store.id, productId),
    listAssets(store.id, { type: "font", appUrl }),
  ]);

  return {
    error: customizer?.enabled
      ? null
      : "Product customizer is not enabled for this product.",
    shop: domain,
    appUrl,
    apiBase: apiBase || `${appUrl}/api/storefront`,
    customizer,
    product: null,
    assets: [],
    fonts,
  };
}
