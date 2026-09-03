import { isSizeOptionName } from "./shopify-ajax-product";

const COLOR_OPTION_NAMES = new Set([
  "color",
  "colour",
  "colorway",
  "hue",
  "shade",
  "finish",
  "pattern",
]);

const NAMED_HEX = {
  white: "#ffffff",
  ivory: "#fffff0",
  cream: "#fffdd0",
  beige: "#f5f5dc",
  natural: "#e8dcc8",
  black: "#111111",
  charcoal: "#36454f",
  gray: "#6b7280",
  grey: "#6b7280",
  "heather grey": "#9ca3af",
  silver: "#c0c0c0",
  red: "#c81e1e",
  burgundy: "#7f1d1d",
  maroon: "#7f1d1d",
  pink: "#ec4899",
  rose: "#f43f5e",
  coral: "#f97373",
  orange: "#ea580c",
  yellow: "#eab308",
  gold: "#ca8a04",
  green: "#15803d",
  olive: "#4d7c0f",
  mint: "#6ee7b7",
  teal: "#0f766e",
  aqua: "#22d3ee",
  blue: "#1d4ed8",
  navy: "#1e3a8a",
  indigo: "#4338ca",
  purple: "#7e22ce",
  violet: "#8b5cf6",
  brown: "#7c4a1e",
  tan: "#d2b48c",
  khaki: "#c3b091",
  camel: "#c19a6b",
};

function optionKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase();
}

export function isColorOptionName(name) {
  const key = optionKey(name);
  if (!key || key === "title") return false;
  return COLOR_OPTION_NAMES.has(key) || key.includes("color") || key.includes("colour");
}

function uniqueValues(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function optionValuesFromVariants(product, optionName) {
  return uniqueValues(
    (product?.variants || []).map((variant) => variantOptionValue(variant, optionName)),
  );
}

export function findColorOption(product) {
  const options = product?.options || [];
  const named = options.find((option) => isColorOptionName(option.name));
  if (named) {
    const values = uniqueValues(named.values).length
      ? uniqueValues(named.values)
      : optionValuesFromVariants(product, named.name);
    return { ...named, values };
  }

  const fallback = options.find((option) => {
    const key = optionKey(option.name);
    if (!key || key === "title" || isSizeOptionName(option.name)) return false;
    const values = uniqueValues(option.values).length
      ? uniqueValues(option.values)
      : optionValuesFromVariants(product, option.name);
    return values.length > 1;
  });
  if (!fallback) return null;
  return {
    ...fallback,
    values: uniqueValues(fallback.values).length
      ? uniqueValues(fallback.values)
      : optionValuesFromVariants(product, fallback.name),
  };
}

export function otherProductOptions(product) {
  const color = findColorOption(product);
  return (product?.options || []).filter((option) => {
    const key = optionKey(option.name);
    if (!key || key === "title") return false;
    if (color && optionKey(option.name) === optionKey(color.name)) return false;
    const values = uniqueValues(option.values).length
      ? uniqueValues(option.values)
      : optionValuesFromVariants(product, option.name);
    return values.length > 1;
  }).map((option) => ({
    ...option,
    values: uniqueValues(option.values).length
      ? uniqueValues(option.values)
      : optionValuesFromVariants(product, option.name),
  }));
}

export function hexFromColorName(name) {
  const key = optionKey(name).replace(/[_-]+/g, " ");
  if (NAMED_HEX[key]) return NAMED_HEX[key];
  const first = key.split(/\s+/)[0];
  if (NAMED_HEX[first]) return NAMED_HEX[first];
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue} 45% 48%)`;
}

function variantOptionValue(variant, optionName) {
  const match = (variant?.selectedOptions || []).find(
    (option) => optionKey(option.name) === optionKey(optionName),
  );
  return match?.value || "";
}

export function colorsFromProduct(product) {
  const variants = product?.variants || [];
  const colorOption = findColorOption(product);
  if (colorOption?.values?.length) {
    return colorOption.values.map((value) => {
      const variant =
        variants.find((item) => variantOptionValue(item, colorOption.name) === value) || null;
      const swatch = colorOption.swatches?.[value] || {};
      return {
        id: `color-${optionKey(value)}`,
        name: value,
        hex: swatch.hex || hexFromColorName(value),
        imageUrl: swatch.imageUrl || variant?.imageUrl || null,
        variantId: variant?.id || "",
        optionName: colorOption.name,
      };
    });
  }

  if (variants.length > 1 && variants.some((item) => item.title && item.title !== "Default Title")) {
    return variants.map((variant) => ({
      id: variant.id,
      name: variant.title,
      hex: hexFromColorName(variant.title),
      imageUrl: variant.imageUrl || null,
      variantId: variant.id,
      optionName: "Variant",
    }));
  }

  return [];
}

export function colorFromVariant(colors, variant) {
  if (!variant || !colors?.length) return colors?.[0] || null;
  const byId = colors.find((color) => color.variantId === variant.id);
  if (byId) return byId;
  return (
    colors.find((color) =>
      (variant.selectedOptions || []).some(
        (option) => optionKey(option.value) === optionKey(color.name),
      ),
    ) || colors[0]
  );
}

export function variantForColor(product, color, currentVariantId) {
  const variants = product?.variants || [];
  if (!color) return variants[0] || null;
  if (color.variantId) {
    const exact = variants.find((item) => item.id === color.variantId);
    if (exact) {
      const current = variants.find((item) => item.id === currentVariantId);
      if (!current || !color.optionName) return exact;
      const desired = Object.fromEntries(
        (current.selectedOptions || []).map((option) => [optionKey(option.name), option.value]),
      );
      desired[optionKey(color.optionName)] = color.name;
      const matched = variants.find((item) =>
        (item.selectedOptions || []).every(
          (option) => desired[optionKey(option.name)] === option.value,
        ),
      );
      return matched || exact;
    }
  }
  return variants.find((item) => item.title === color.name) || variants[0] || null;
}

export function variantForSelections(product, selections) {
  const variants = product?.variants || [];
  if (!variants.length) return null;
  const desired = Object.fromEntries(
    Object.entries(selections || {}).map(([name, value]) => [optionKey(name), value]),
  );
  const matched = variants.find((variant) =>
    (variant.selectedOptions || []).every((option) => {
      const selected = desired[optionKey(option.name)];
      return !selected || selected === option.value;
    }),
  );
  return matched || variants[0];
}
