import fs from "node:fs/promises";
import path from "node:path";

export class StorageProvider {
  /**
   * @param {string} key
   * @param {Buffer|Uint8Array} _buffer
   * @param {string} _contentType
   * @returns {Promise<{ key: string, url: string }>}
   */
  async put(key, buffer, contentType) {
    throw new Error(
      `put() is not implemented for key ${key} (${contentType}, ${buffer?.length || 0} bytes)`,
    );
  }

  /**
   * @param {string} key
   * @returns {Promise<void>}
   */
  async delete(key) {
    throw new Error(`delete() is not implemented for key ${key}`);
  }

  /**
   * @param {string} key
   * @param {string} [appUrl]
   * @returns {string}
   */
  getPublicUrl(key, appUrl = "") {
    const normalized = String(key).replace(/^\/+/, "");
    const origin = String(appUrl || "").replace(/\/$/, "");
    return origin ? `${origin}/${normalized}` : `/${normalized}`;
  }
}

export class LocalStorageProvider extends StorageProvider {
  constructor(rootDir = path.join(process.cwd(), "public", "uploads")) {
    super();
    this.rootDir = rootDir;
    this.publicPrefix = "uploads";
  }

  #safeKey(key) {
    const normalized = String(key)
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .split("/")
      .filter((part) => part && part !== "." && part !== "..")
      .join("/");
    if (!normalized) {
      throw new Error("Invalid storage key.");
    }
    return normalized;
  }

  async put(key, buffer) {
    const safeKey = this.#safeKey(key);
    const absolute = path.join(this.rootDir, safeKey);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, buffer);
    return {
      key: `${this.publicPrefix}/${safeKey}`,
      url: `/${this.publicPrefix}/${safeKey}`,
    };
  }

  async delete(key) {
    const withoutPrefix = String(key).replace(/^uploads\//, "");
    const safeKey = this.#safeKey(withoutPrefix);
    const absolute = path.join(this.rootDir, safeKey);
    try {
      await fs.unlink(absolute);
    } catch (error) {
      if (error && error.code !== "ENOENT") throw error;
    }
  }

  getPublicUrl(key, appUrl = "") {
    const normalized = String(key).replace(/^\/+/, "");
    const withPrefix = normalized.startsWith("uploads/")
      ? normalized
      : `${this.publicPrefix}/${normalized}`;
    return super.getPublicUrl(withPrefix, appUrl);
  }
}

let storageSingleton;

export function getStorage() {
  if (storageSingleton) return storageSingleton;
  // Future: switch on env (S3-compatible) without changing call sites.
  storageSingleton = new LocalStorageProvider();
  return storageSingleton;
}

export function absoluteAssetUrl(url, appUrl = "") {
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  const origin = String(appUrl || "").replace(/\/$/, "");
  if (!origin) return url;
  return `${origin}${url.startsWith("/") ? url : `/${url}`}`;
}

export function isPublicUploadPath(splat) {
  const value = decodeURIComponent(String(splat || ""))
    .replace(/^\/+/, "")
    .replace(/\\/g, "/");
  return value.startsWith("uploads/") && /\.(png|jpe?g|gif|webp|svg|woff2?|ttf|otf)$/i.test(value);
}

export async function servePublicUpload(splat) {
  const value = decodeURIComponent(String(splat || ""))
    .replace(/^\/+/, "")
    .replace(/\\/g, "/");
  if (!isPublicUploadPath(value)) {
    return new Response("Not found", { status: 404 });
  }
  const root = path.resolve(process.cwd(), "public");
  const filePath = path.resolve(root, value);
  const relative = path.relative(root, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".woff2": "font/woff2",
      ".woff": "font/woff",
      ".ttf": "font/ttf",
      ".otf": "font/otf",
    };
    return new Response(data, {
      headers: {
        "Content-Type": types[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
        "Cross-Origin-Resource-Policy": "cross-origin",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
