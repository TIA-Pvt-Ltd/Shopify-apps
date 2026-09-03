export const VIEW_TYPES = [
  { value: "front", label: "Front" },
  { value: "back", label: "Back" },
  { value: "right_sleeve", label: "Right Sleeve" },
  { value: "left_sleeve", label: "Left Sleeve" },
  { value: "inside_label", label: "Inside Label" },
  { value: "custom", label: "Custom" },
];

export const GRAPHIC_CATEGORIES = [
  "Logos",
  "Symbols",
  "Sports",
  "Animals",
  "Business",
  "Holiday",
  "Other",
];

export const DEFAULT_COLORS = [
  { id: "white", name: "White", hex: "#ffffff", imageUrl: null },
  { id: "black", name: "Black", hex: "#111111", imageUrl: null },
  { id: "red", name: "Red", hex: "#c81e1e", imageUrl: null },
  { id: "blue", name: "Blue", hex: "#1d4ed8", imageUrl: null },
  { id: "yellow", name: "Yellow", hex: "#eab308", imageUrl: null },
  { id: "green", name: "Green", hex: "#15803d", imageUrl: null },
];

export const GRAPHIC_TINT_NONE = "";

export const GRAPHIC_TINTS = [
  "#111111",
  "#ffffff",
  "#c81e1e",
  "#ea580c",
  "#eab308",
  "#15803d",
  "#0f766e",
  "#1d4ed8",
  "#0891b2",
  "#7c3aed",
  "#db2777",
  "#44403c",
];

export const WEB_SAFE_FONTS = [
  "Arial",
  "Helvetica",
  "Times New Roman",
  "Georgia",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Courier New",
  "Impact",
];

export const GOOGLE_FONTS = [
  "Anton",
  "Archivo Black",
  "Bangers",
  "Barlow Condensed",
  "Bebas Neue",
  "Lato",
  "Montserrat",
  "Oswald",
  "Pacifico",
  "Playfair Display",
  "Poppins",
  "Roboto",
  "Rubik",
  "Source Sans 3",
];

export function defaultTools() {
  return {
    text: true,
    graphic: true,
    upload: true,
    qrCode: true,
    namesNumbers: true,
    designIdeas: true,
  };
}

export function defaultCustomizerConfiguration() {
  return {
    tools: defaultTools(),
    pricing: {
      basePrice: 0,
      textPrice: 0,
      graphicPrice: 0,
      uploadPrice: 0,
    },
    customerOptions: {
      allowOverflow: false,
      showQuantity: true,
      minQuantity: 1,
      maxQuantity: 99,
      requireColor: true,
    },
    colors: DEFAULT_COLORS,
    colorMode: "tint",
    print: {
      dpi: 300,
      format: "png",
    },
  };
}

export function defaultStoreSettings() {
  return {
    maxUploadMb: 8,
    defaultDpi: 300,
    allowSvg: true,
    tools: defaultTools(),
  };
}

export function defaultPrintArea(width = 800, height = 800) {
  return {
    x: Math.round(width * 0.22),
    y: Math.round(height * 0.18),
    width: Math.round(width * 0.56),
    height: Math.round(height * 0.62),
    rotation: 0,
    locked: false,
  };
}

export function mergeConfiguration(value) {
  const defaults = defaultCustomizerConfiguration();
  if (!value || typeof value !== "object") return defaults;
  return {
    ...defaults,
    ...value,
    tools: { ...defaults.tools, ...(value.tools || {}) },
    pricing: { ...defaults.pricing, ...(value.pricing || {}) },
    customerOptions: {
      ...defaults.customerOptions,
      ...(value.customerOptions || {}),
    },
    print: { ...defaults.print, ...(value.print || {}) },
    colors: Array.isArray(value.colors) ? value.colors : defaults.colors,
  };
}
