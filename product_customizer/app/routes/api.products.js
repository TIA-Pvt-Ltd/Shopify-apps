import { authenticate } from "../shopify.server";
import { getOrCreateStore } from "../services/store.server";
import { fetchShopifyProducts } from "../services/shopify-products.server";
import { getCustomizerMap } from "../services/product.server";
import { apiError, apiOk } from "../utils/http";
import { USER_ERRORS, logError } from "../utils/logger.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const url = new URL(request.url);
  try {
    const products = await fetchShopifyProducts(admin, {
      query: url.searchParams.get("q") || "",
      status: url.searchParams.get("status") || "all",
      after: url.searchParams.get("after") || null,
      before: url.searchParams.get("before") || null,
      first: Number(url.searchParams.get("first") || 50),
    });
    const customizerMap = await getCustomizerMap(store.id);
    return apiOk({
      products: products.nodes,
      customizerMap,
      pageInfo: products.pageInfo,
      count: products.count,
    });
  } catch (error) {
    logError("api.products", error);
    return apiError(USER_ERRORS.configLoad, 500);
  }
};
