import { GRAPHIC_CATEGORIES, VIEW_TYPES } from "../utils/customizer-defaults";

export function requireFields(payload, fields) {
  const missing = fields.filter((field) => {
    const value = payload?.[field];
    return value == null || value === "";
  });
  if (!missing.length) return null;
  return `Missing required field: ${missing.join(", ")}.`;
}

export function validateConfigurationPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Configuration payload is invalid.";
  }
  if (payload.views && !Array.isArray(payload.views)) {
    return "Views must be an array.";
  }
  if (Array.isArray(payload.views)) {
    for (const view of payload.views) {
      if (!view.name) return "Each view needs a name.";
      if (view.type && !VIEW_TYPES.some((item) => item.value === view.type) && view.type !== "custom") {
        return `Unsupported view type: ${view.type}.`;
      }
      if (view.printArea) {
        const { x, y, width, height } = view.printArea;
        if ([x, y, width, height].some((value) => Number.isNaN(Number(value)))) {
          return "Print area coordinates must be numeric.";
        }
      }
    }
  }
  return null;
}

export function validateCustomizationPayload(payload) {
  const missing = requireFields(payload, ["shopifyProductId", "configuration"]);
  if (missing) return missing;
  if (typeof payload.configuration !== "object") {
    return "Customization configuration must be an object.";
  }
  return null;
}

export function validateAssetCategory(category) {
  if (!category) return "Other";
  return GRAPHIC_CATEGORIES.includes(category) ? category : "Other";
}
