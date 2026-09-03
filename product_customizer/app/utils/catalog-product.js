import { normalizeShopifyProduct } from "./shopify-ajax-product";
import { colorsFromProduct } from "./product-colors";

function variantCount(product) {
  return product?.variants?.length || 0;
}

function colorCount(product) {
  return colorsFromProduct(product).length;
}

export function richerCatalogProduct(...candidates) {
  const normalized = candidates.map((item) => normalizeShopifyProduct(item)).filter(Boolean);
  if (!normalized.length) return null;
  return [...normalized].sort((left, right) => {
    const colorDelta = colorCount(right) - colorCount(left);
    if (colorDelta) return colorDelta;
    return variantCount(right) - variantCount(left);
  })[0];
}

export function injectedProductFromStorage() {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get("product_id") || params.get("productId") || "";
    const handle = params.get("handle") || "";
    const keys = [
      productId && `pc-product-${productId}`,
      handle && `pc-product-handle-${handle}`,
    ].filter(Boolean);
    for (const key of keys) {
      const raw = window.sessionStorage.getItem(key);
      if (!raw) continue;
      return JSON.parse(raw);
    }
  } catch {
    return null;
  }
  return null;
}

export async function fetchStorefrontProductJson(handle) {
  if (!handle || typeof window === "undefined") return null;
  const host = window.location.hostname;
  const onShop = host.endsWith(".myshopify.com") || host.endsWith(".shopify.com");
  if (!onShop) return null;
  try {
    const response = await fetch(`/products/${encodeURIComponent(handle)}.js`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("json") && !contentType.includes("javascript")) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export function selectionsFromVariant(variant) {
  return Object.fromEntries(
    (variant?.selectedOptions || []).map((option) => [option.name, option.value]),
  );
}
