export function cartPreviewPath(publicId) {
  const id = String(publicId || "").trim();
  if (!id) return "";
  return `/apps/product-customizer/p/${encodeURIComponent(id)}`;
}

export function toStorefrontPreviewUrl(previewUrl, shop) {
  if (!previewUrl) return "";
  const domain = String(shop || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  const uploadsAt = String(previewUrl).indexOf("/uploads/");
  if (domain && uploadsAt !== -1) {
    return `https://${domain}/apps/product-customizer${previewUrl.slice(uploadsAt)}`;
  }
  if (domain && previewUrl.startsWith("/")) {
    return `https://${domain}/apps/product-customizer${previewUrl}`;
  }
  return previewUrl;
}
