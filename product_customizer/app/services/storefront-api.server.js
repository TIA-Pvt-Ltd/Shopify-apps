import { getOrCreateStore, getStoreByShop, updateStoreSettings } from "./store.server";
import {
  getCustomizerByProduct,
  saveCustomizerConfiguration,
} from "./product.server";
import { listAssets, createAsset } from "./asset.server";
import {
  createCustomization,
  getCustomizationByPublicId,
  updateCustomization,
} from "./customization.server";
import { generatePreview, generatePrintFile } from "./preview.server";
import { cartLineProperties } from "../utils/cart-add";
import { fetchProductForCustomizer } from "./shopify-products.server";
import {
  validateConfigurationPayload,
  validateCustomizationPayload,
  validateAssetCategory,
} from "./validation.server";
import { apiError, apiOk, optionsResponse } from "../utils/http";
import { USER_ERRORS, logError } from "../utils/logger.server";
import { parseShopDomain, toGid } from "../utils/gid";
import { defaultStoreSettings } from "../utils/customizer-defaults";
import { parseJsonField } from "../utils/json";
import { unauthenticated } from "../shopify.server";

export function getAppUrl(request) {
  return process.env.SHOPIFY_APP_URL || new URL(request.url).origin;
}

export function getShopFromRequest(request, fallbackShop) {
  const url = new URL(request.url);
  return parseShopDomain(
    fallbackShop ||
      url.searchParams.get("shop") ||
      request.headers.get("x-shop-domain") ||
      "",
  );
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function loadStorefrontProduct(shop, productId, handle) {
  try {
    const { admin } = await unauthenticated.admin(shop);
    return await fetchProductForCustomizer(admin, { shop, productId, handle });
  } catch (error) {
    logError("storefront.product", error);
    return null;
  }
}

export async function handleStorefrontApi(request, path, { shop: shopOverride, cors = true } = {}) {
  if (request.method === "OPTIONS") {
    return optionsResponse(request);
  }

  const shop = getShopFromRequest(request, shopOverride);
  const appUrl = getAppUrl(request);
  const segments = String(path || "")
    .split("/")
    .filter(Boolean);

  try {
    if (!shop) {
      return apiError("Shop is required.", 400, request, cors);
    }

    if (segments[0] === "bootstrap") {
      const url = new URL(request.url);
      const productId = url.searchParams.get("product_id") || url.searchParams.get("productId");
      const store = await getStoreByShop(shop);
      const customizer =
        productId && store ? await getCustomizerByProduct(store.id, productId) : null;
      return apiOk(
        {
          shop,
          appUrl,
          productId: productId ? toGid(productId) : null,
          enabled: Boolean(customizer?.enabled),
        },
        {},
        request,
        cors,
      );
    }

    if (segments[0] === "products" && segments[2] === "configuration") {
      const productId = segments[1];
      if (request.method === "GET") {
        const store = await getStoreByShop(shop);
        if (!store) {
          return apiError(USER_ERRORS.notEnabled, 404, request, cors);
        }
        const customizer = await getCustomizerByProduct(store.id, productId);
        if (!customizer?.enabled) {
          return apiError(USER_ERRORS.notEnabled, 404, request, cors);
        }
        const shopifyProduct = await loadStorefrontProduct(shop, productId);
        const assets = await listAssets(store.id, { types: ["graphic", "upload"], appUrl });
        const fonts = await listAssets(store.id, { type: "font", appUrl });
        return apiOk(
          { customizer, product: shopifyProduct, assets, fonts, shop, appUrl },
          {},
          request,
          cors,
        );
      }
    }

    if (segments[0] === "assets" && request.method === "GET") {
      const store = await getStoreByShop(shop);
      if (!store) return apiOk({ assets: [] }, {}, request, cors);
      const url = new URL(request.url);
      const assets = await listAssets(store.id, {
        type: url.searchParams.get("type") || "graphic",
        category: url.searchParams.get("category") || undefined,
        appUrl,
      });
      return apiOk({ assets }, {}, request, cors);
    }

    if (segments[0] === "assets" && request.method === "POST") {
      const store = await getOrCreateStore(shop);
      const formData = await request.formData();
      const file = formData.get("file");
      if (!file || typeof file === "string") {
        return apiError("A file is required.", 400, request, cors);
      }
      const result = await createAsset(store, file, {
        name: String(formData.get("name") || ""),
        type: String(formData.get("type") || "upload"),
        category: validateAssetCategory(String(formData.get("category") || "Other")),
        appUrl,
      });
      if (result.error) {
        return apiError(result.error, 400, request, cors);
      }
      return apiOk({ asset: result.asset }, { status: 201 }, request, cors);
    }

    if (segments[0] === "customizations" && segments[1] === "preview" && request.method === "POST") {
      const store = await getOrCreateStore(shop);
      const payload = await readJson(request);
      const preview = await generatePreview(store, payload, appUrl);
      return apiOk(preview, {}, request, cors);
    }

    if (segments[0] === "customizations" && segments[1] === "print-file" && request.method === "POST") {
      const store = await getOrCreateStore(shop);
      const payload = await readJson(request);
      const printFile = await generatePrintFile(store, payload, appUrl);
      return apiOk(printFile, {}, request, cors);
    }

    if (segments[0] === "customizations" && request.method === "POST" && !segments[1]) {
      const store = await getOrCreateStore(shop);
      const payload = await readJson(request);
      const invalid = validateCustomizationPayload(payload);
      if (invalid) return apiError(invalid, 400, request, cors);
      const customization = await createCustomization(store, payload, appUrl);
      return apiOk({ customization }, { status: 201 }, request, cors);
    }

    if (segments[0] === "customizations" && segments[1] && request.method === "GET") {
      const store = await getStoreByShop(shop);
      if (!store) return apiError(USER_ERRORS.notFound, 404, request, cors);
      const customization = await getCustomizationByPublicId(store.id, segments[1], appUrl);
      if (!customization) return apiError(USER_ERRORS.notFound, 404, request, cors);
      return apiOk({ customization }, {}, request, cors);
    }

    if (segments[0] === "customizations" && segments[1] && request.method === "PUT") {
      const store = await getStoreByShop(shop);
      if (!store) return apiError(USER_ERRORS.notFound, 404, request, cors);
      const payload = await readJson(request);
      const customization = await updateCustomization(store.id, segments[1], payload, appUrl);
      if (!customization) return apiError(USER_ERRORS.notFound, 404, request, cors);
      return apiOk({ customization }, {}, request, cors);
    }

    if (segments[0] === "cart" && segments[1] === "add" && request.method === "POST") {
      const payload = await readJson(request);
      if (!payload.customizationId || !payload.variantId) {
        return apiError("A customization ID and variant ID are required.", 400, request, cors);
      }
      return apiOk(
        {
          cartPayload: {
            id: payload.variantIdNumeric || payload.variantId,
            quantity: Math.max(1, Number(payload.quantity) || 1),
            properties: cartLineProperties({
              publicId: payload.customizationId,
              previewUrl: payload.previewUrl,
              color: payload.color,
              view: payload.viewName,
              configuration: payload.configuration,
            }),
          },
        },
        {},
        request,
        cors,
      );
    }

    return apiError(USER_ERRORS.notFound, 404, request, cors);
  } catch (error) {
    logError("storefront.api", error);
    return apiError("Something went wrong. Please try again.", 500, request, cors);
  }
}

export async function handleAdminAssetUpload(store, request) {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return { error: "A file is required." };
  }
  return createAsset(store, file, {
    name: String(formData.get("name") || ""),
    type: String(formData.get("type") || "graphic"),
    category: validateAssetCategory(String(formData.get("category") || "Other")),
    appUrl: getAppUrl(request),
  });
}

export { saveCustomizerConfiguration, validateConfigurationPayload, updateStoreSettings, defaultStoreSettings, parseJsonField };
