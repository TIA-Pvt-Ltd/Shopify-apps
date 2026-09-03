export function parseJsonField(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function asPrintArea(value, fallback) {
  const parsed = parseJsonField(value, fallback);
  if (!parsed || typeof parsed !== "object") return fallback;
  return {
    x: Number(parsed.x) || 0,
    y: Number(parsed.y) || 0,
    width: Number(parsed.width) || 0,
    height: Number(parsed.height) || 0,
    rotation: Number(parsed.rotation) || 0,
    locked: Boolean(parsed.locked),
  };
}
