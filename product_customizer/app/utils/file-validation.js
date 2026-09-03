const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const SVG_DANGEROUS =
  /<script|on\w+\s*=|javascript:|xlink:href\s*=\s*["']\s*javascript/i;

export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/svg+xml",
  "image/webp",
];

export function detectImageMime(buffer, declaredType = "") {
  if (!buffer || buffer.length < 4) return null;
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (PNG_SIGNATURE.every((value, index) => bytes[index] === value)) {
    return "image/png";
  }
  if (JPEG_SIGNATURE.every((value, index) => bytes[index] === value)) {
    return "image/jpeg";
  }
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return "image/webp";
  }

  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.slice(0, 256))
    .trim()
    .toLowerCase();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) {
    return "image/svg+xml";
  }

  if (ALLOWED_IMAGE_TYPES.includes(declaredType)) {
    return declaredType === "image/jpg" ? "image/jpeg" : declaredType;
  }

  return null;
}

export function isSafeSvg(svgText) {
  if (!svgText) return false;
  return !SVG_DANGEROUS.test(svgText);
}

export function sanitizeSvg(svgText) {
  if (!svgText) return "";
  return svgText
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

export function validateUpload({
  buffer,
  declaredType,
  filename,
  maxBytes,
  allowSvg = true,
}) {
  const mime = detectImageMime(buffer, declaredType);
  if (!mime) {
    return { ok: false, error: "That file type is not supported." };
  }
  if (mime === "image/svg+xml" && !allowSvg) {
    return { ok: false, error: "SVG uploads are not enabled." };
  }
  if (buffer.length > maxBytes) {
    return { ok: false, error: "Your image is too large." };
  }
  if (mime === "image/svg+xml") {
    const text = new TextDecoder().decode(buffer);
    if (!isSafeSvg(text)) {
      return { ok: false, error: "That SVG file contains unsupported content." };
    }
  }
  const extension = extensionForMime(mime, filename);
  return { ok: true, mime, extension };
}

export function extensionForMime(mime, filename = "") {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/svg+xml") return "svg";
  const fromName = String(filename).split(".").pop();
  return fromName ? fromName.toLowerCase().replace(/[^a-z0-9]/g, "") : "bin";
}

const FONT_MIME_BY_EXT = {
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
};

const FONT_EXT_BY_MIME = {
  "font/woff2": "woff2",
  "application/font-woff2": "woff2",
  "font/woff": "woff",
  "application/font-woff": "woff",
  "application/x-font-woff": "woff",
  "font/ttf": "ttf",
  "application/x-font-ttf": "ttf",
  "application/font-sfnt": "ttf",
  "font/otf": "otf",
  "application/x-font-otf": "otf",
  "application/vnd.ms-opentype": "otf",
};

export function validateFontUpload({ buffer, declaredType, filename, maxBytes }) {
  const name = String(filename || "").toLowerCase();
  const extension = name.includes(".") ? name.split(".").pop() : "";
  const mime = String(declaredType || "").toLowerCase();
  const fromExt = FONT_MIME_BY_EXT[extension];
  const fromMime = FONT_EXT_BY_MIME[mime];
  if (!fromExt && !fromMime) {
    return { ok: false, error: "That font format is not supported." };
  }
  if (buffer.length > maxBytes) {
    return { ok: false, error: "That font file is too large." };
  }
  return {
    ok: true,
    mime: fromExt || FONT_MIME_BY_EXT[fromMime] || "font/woff2",
    extension: fromExt ? extension : fromMime,
  };
}
