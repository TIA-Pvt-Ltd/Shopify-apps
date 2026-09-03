export function themeEditorUrls(_shop, apiKey) {
  const key = apiKey || "";
  const editor = "shopify://admin/themes/current/editor";

  return {
    enableEmbed: `${editor}?context=apps&template=product&activateAppId=${encodeURIComponent(
      `${key}/app-embed`,
    )}`,
    addProductBlock: `${editor}?template=product&addAppBlockId=${encodeURIComponent(
      `${key}/product-customizer`,
    )}&target=newAppsSection`,
  };
}
