const PROXY_PREFIX = "/apps/product-customizer";
const SHOPIFY_QUERY_KEYS = new Set([
  "shop",
  "signature",
  "timestamp",
  "logged_in_customer_id",
  "path_prefix",
  "id_token",
]);

export function isViteAssetPath(path) {
  const value = decodeURIComponent(String(path || "")).replace(/^\/+/, "");
  if (!value) return false;
  return (
    value.startsWith("@") ||
    value.startsWith("node_modules/") ||
    value.startsWith("app/") ||
    value.startsWith("assets/") ||
    value.startsWith("src/") ||
    value.includes("virtual:react-router") ||
    /\.(m?js|jsx|ts|tsx|mjs|cjs|css|map)$/i.test(value)
  );
}

export function viteOnlySearch(search) {
  const params = new URLSearchParams(
    String(search || "").replace(/^\?/, ""),
  );
  for (const key of [...params.keys()]) {
    if (SHOPIFY_QUERY_KEYS.has(key)) params.delete(key);
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}

export function rewriteToAppProxy(source) {
  if (!source) return source;
  return source
    .replaceAll(`${PROXY_PREFIX}${PROXY_PREFIX}`, PROXY_PREFIX)
    .replaceAll('"/@', `"${PROXY_PREFIX}/@`)
    .replaceAll("'/@", `'${PROXY_PREFIX}/@`)
    .replaceAll('"/node_modules/', `"${PROXY_PREFIX}/node_modules/`)
    .replaceAll("'/node_modules/", `'${PROXY_PREFIX}/node_modules/`)
    .replaceAll('"/app/', `"${PROXY_PREFIX}/app/`)
    .replaceAll("'/app/", `'${PROXY_PREFIX}/app/`)
    .replaceAll('"/assets/', `"${PROXY_PREFIX}/assets/`)
    .replaceAll("'/assets/", `'${PROXY_PREFIX}/assets/`)
    .replaceAll('from "/@', `from "${PROXY_PREFIX}/@`)
    .replaceAll("from '/@", `from '${PROXY_PREFIX}/@`)
    .replaceAll('import("/@', `import("${PROXY_PREFIX}/@`)
    .replaceAll('import("/app/', `import("${PROXY_PREFIX}/app/`)
    .replaceAll('import("/node_modules/', `import("${PROXY_PREFIX}/node_modules/`);
}

function localDevOrigin() {
  return `http://127.0.0.1:${process.env.PORT || 3000}`;
}

export async function proxyViteAsset(request, splat) {
  const incoming = new URL(request.url);
  const targetPath = decodeURIComponent(String(splat || "")).replace(/^\/+/, "");
  const target = `${localDevOrigin()}/${targetPath}${viteOnlySearch(incoming.search)}`;
  const response = await fetch(target, {
    method: "GET",
    headers: {
      Accept: request.headers.get("Accept") || "*/*",
    },
  });
  const contentType =
    response.headers.get("Content-Type") || "application/javascript; charset=utf-8";
  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Cache-Control", "no-store");
  headers.set("Access-Control-Allow-Origin", "*");

  if (/javascript|ecmascript|text\/css|json|text\/plain/i.test(contentType)) {
    const text = rewriteToAppProxy(await response.text());
    return new Response(text, { status: response.status, headers });
  }

  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers,
  });
}
