import { toNumericId } from "./gid";
import { cartPreviewPath, toStorefrontPreviewUrl } from "./preview-url";

const MAX_PROPERTY = 255;

function clipProperty(value) {
  const text = String(value || "").trim();
  if (!text || text.startsWith("data:") || text.length > MAX_PROPERTY) return "";
  return text;
}

export function variantNumericId(catalogProduct, selectedVariantId) {
  const variants = catalogProduct?.variants || [];
  const selectedNumeric = String(toNumericId(selectedVariantId) || "");
  const productNumeric = String(toNumericId(catalogProduct?.id) || "");
  const match =
    variants.find(
      (item) =>
        item.id === selectedVariantId ||
        String(item.numericId) === selectedNumeric ||
        String(item.id).endsWith(`/${selectedNumeric}`),
    ) || variants[0];

  const numeric = Number(match?.numericId || toNumericId(match?.id) || selectedNumeric);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  if (productNumeric && String(numeric) === productNumeric && variants.length > 1) {
    const first = Number(variants[0]?.numericId);
    if (Number.isFinite(first) && first > 0 && String(first) !== productNumeric) return first;
  }
  return numeric;
}

export function cartLineProperties({ publicId, previewUrl, shop, color, view }) {
  const properties = {};
  const customizationId = clipProperty(publicId);
  const preview =
    clipProperty(cartPreviewPath(publicId)) ||
    clipProperty(toStorefrontPreviewUrl(previewUrl, shop));
  const colorName = clipProperty(color);
  const viewName = clipProperty(view);
  if (customizationId) {
    properties._customizationId = customizationId;
    properties["Customization ID"] = customizationId;
  }
  if (preview) properties._previewUrl = preview;
  if (colorName) properties.Color = colorName;
  if (viewName) properties.View = viewName;
  return properties;
}

export function cartAddPayload({ variantId, quantity, properties }) {
  return {
    items: [
      {
        id: Number(variantId),
        quantity: Math.max(1, Number(quantity) || 1),
        properties: properties || {},
      },
    ],
  };
}

export async function postShopifyCartAdd(payload) {
  const item = payload?.items?.[0];
  if (!item?.id) {
    throw new Error("Select a product variant before adding to cart.");
  }

  const jsonResponse = await fetch("/cart/add.js", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      items: [
        {
          id: Number(item.id),
          quantity: Math.max(1, Number(item.quantity) || 1),
          properties: item.properties || {},
        },
      ],
    }),
  }).catch(() => null);

  if (jsonResponse?.ok) return jsonResponse;

  const body = new URLSearchParams();
  body.set("id", String(item.id));
  body.set("quantity", String(Math.max(1, Number(item.quantity) || 1)));
  Object.entries(item.properties || {}).forEach(([key, value]) => {
    if (value == null || value === "") return;
    body.set(`properties[${key}]`, String(value));
  });

  const formResponse = await fetch("/cart/add.js", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "application/json",
    },
    body: body.toString(),
  }).catch(() => null);

  if (formResponse?.ok) return formResponse;

  const errorResponse = formResponse || jsonResponse;
  const errorBody = await errorResponse?.json?.().catch(() => ({}));
  throw new Error(
    errorBody?.description || errorBody?.message || "Unable to add the customized product to the cart.",
  );
}
