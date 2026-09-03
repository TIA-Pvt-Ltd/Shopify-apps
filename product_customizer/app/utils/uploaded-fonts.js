function extensionFromUrl(url) {
  try {
    const path = new URL(url, "https://example.invalid").pathname;
    return path.split(".").pop()?.toLowerCase() || "";
  } catch {
    return String(url || "")
      .split("?")[0]
      .split(".")
      .pop()
      ?.toLowerCase() || "";
  }
}

export function cssFontFormat(url) {
  const ext = extensionFromUrl(url);
  if (ext === "woff2") return "woff2";
  if (ext === "woff") return "woff";
  if (ext === "otf") return "opentype";
  return "truetype";
}

export async function loadUploadedFontFaces(fonts) {
  if (typeof document === "undefined" || typeof FontFace === "undefined") {
    return [];
  }
  const uploaded = (fonts || []).filter((font) => font?.url && font?.name);
  const faces = await Promise.all(
    uploaded.map(async (font) => {
      try {
        const format = cssFontFormat(font.url);
        const face = new FontFace(
          font.name,
          `url(${JSON.stringify(font.url)}) format(${JSON.stringify(format)})`,
        );
        const ready = await face.load();
        document.fonts.add(ready);
        return ready;
      } catch {
        return null;
      }
    }),
  );
  return faces.filter(Boolean);
}
