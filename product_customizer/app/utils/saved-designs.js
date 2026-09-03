import { toNumericId } from "./gid";

const LIMIT = 24;

function keyFor(shop, productId) {
  return `pc-saved:${String(shop || "")}:${toNumericId(productId)}`;
}

export function readSavedDesigns(shop, productId) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(shop, productId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => item?.publicId) : [];
  } catch {
    return [];
  }
}

export function rememberSavedDesign(shop, productId, design) {
  if (!design?.publicId) return readSavedDesigns(shop, productId);
  const next = [
    {
      publicId: design.publicId,
      previewUrl: design.previewUrl || "",
      savedAt: Date.now(),
    },
    ...readSavedDesigns(shop, productId).filter((item) => item.publicId !== design.publicId),
  ].slice(0, LIMIT);
  try {
    window.localStorage.setItem(keyFor(shop, productId), JSON.stringify(next));
  } catch {
    // Ignore quota errors; the in-memory list still works for this session.
  }
  return next;
}

export function forgetSavedDesign(shop, productId, publicId) {
  const next = readSavedDesigns(shop, productId).filter((item) => item.publicId !== publicId);
  try {
    window.localStorage.setItem(keyFor(shop, productId), JSON.stringify(next));
  } catch {
    // Ignore quota errors.
  }
  return next;
}
