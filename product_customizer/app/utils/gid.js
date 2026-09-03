export function toGid(id, type = "Product") {
  if (!id) return "";
  const value = String(id);
  if (value.startsWith("gid://")) return value;
  return `gid://shopify/${type}/${value}`;
}

export function toNumericId(gid) {
  if (!gid) return "";
  const value = String(gid);
  if (!value.startsWith("gid://")) return value;
  return value.split("/").pop() || "";
}

export function parseShopDomain(shop) {
  if (!shop) return "";
  return String(shop)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}
