import { toGid, toNumericId } from "./gid";

const SIZE_OPTION_NAMES = new Set(["size", "sizes", "length", "waist", "width"]);

export function parseShopifyPrice(value) {
  if (value && typeof value === "object") {
    if (value.amount != null) return Number(value.amount) || 0;
  }
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  if (raw.includes(".")) return Number(raw) || 0;
  const cents = Number(raw);
  return Number.isFinite(cents) ? cents / 100 : 0;
}

function asOptions(product) {
  const raw = product?.options || [];
  if (!raw.length) return deriveOptionsFromVariants(product?.variants || []);
  if (typeof raw[0] === "string") {
    const names = raw;
    const variants = product?.variants || [];
    return names.map((name, index) => ({
      name,
      values: unique(
        variants.map((variant) => variant[`option${index + 1}`] || variant.options?.[index] || ""),
      ),
    }));
  }
  return raw.map((option) => {
    const fromOptionValues = (option.optionValues || [])
      .map((value) => (typeof value === "string" ? value : value?.name))
      .filter(Boolean);
    const fromValues = Array.isArray(option.values) ? option.values.filter(Boolean) : [];
    const swatches = { ...(option.swatches || {}) };
    for (const value of option.optionValues || []) {
      if (!value || typeof value === "string" || !value.name || !value.swatch) continue;
      swatches[value.name] = {
        hex: value.swatch.color || "",
        imageUrl: value.swatch.image?.preview?.image?.url || value.swatch.image?.url || "",
      };
    }
    return {
      name: option.name,
      values: fromOptionValues.length ? fromOptionValues : fromValues,
      swatches,
    };
  });
}

function unique(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function deriveOptionsFromVariants(variants) {
  const names = [];
  for (const variant of variants) {
    for (const option of variant.selectedOptions || []) {
      if (option.name && !names.includes(option.name)) names.push(option.name);
    }
  }
  return names.map((name) => ({
    name,
    values: unique(
      variants.map(
        (variant) =>
          (variant.selectedOptions || []).find((option) => option.name === name)?.value || "",
      ),
    ),
  }));
}

function firstImage(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.src || value.url || value.preview_image?.src || "";
}

function variantImage(variant) {
  return (
    variant?.imageUrl ||
    variant?.image?.url ||
    firstImage(variant?.featured_image) ||
    firstImage(variant?.featuredImage) ||
    ""
  );
}

export function normalizeShopifyProduct(product) {
  if (!product) return null;
  const options = asOptions(product);
  const variants = (product.variants || []).map((variant) => {
    const selectedOptions =
      variant.selectedOptions?.length
        ? variant.selectedOptions
        : options.map((option, index) => ({
            name: option.name,
            value:
              variant[`option${index + 1}`] ||
              variant.options?.[index] ||
              "",
          }));
    const id = variant.id || variant.admin_graphql_api_id;
    return {
      id: String(id).startsWith("gid://")
        ? String(id)
        : toGid(toNumericId(id) || id, "ProductVariant"),
      numericId: toNumericId(id) || String(id),
      title: variant.title || selectedOptions.map((option) => option.value).filter(Boolean).join(" / ") || "Default Title",
      availableForSale: variant.availableForSale !== false && variant.available !== false,
      price: parseShopifyPrice(variant.price),
      selectedOptions,
      imageUrl: variantImage(variant),
    };
  });

  const id = product.id || product.admin_graphql_api_id;
  return {
    id: String(id).startsWith("gid://") ? String(id) : toGid(toNumericId(id) || id),
    numericId: toNumericId(id) || String(id || ""),
    title: product.title,
    handle: product.handle,
    status: product.status || "ACTIVE",
    description: product.description || product.body_html || "",
    imageUrl:
      product.imageUrl ||
      firstImage(product.featured_image) ||
      firstImage(product.images?.[0]) ||
      variants[0]?.imageUrl ||
      "",
    imageAlt: product.imageAlt || product.title,
    options,
    variants,
  };
}

export function isSizeOptionName(name) {
  return SIZE_OPTION_NAMES.has(String(name || "").trim().toLowerCase());
}
