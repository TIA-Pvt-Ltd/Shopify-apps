import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
// Replace the HOST env var with SHOPIFY_APP_URL so that it doesn't break the Vite server.
// The CLI will eventually stop passing in HOST,
// so we can remove this workaround after the next major release.
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const appUrl = (process.env.SHOPIFY_APP_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);
const host = new URL(appUrl).hostname;
const SHOPIFY_PROXY_QUERY = new Set([
  "shop",
  "signature",
  "timestamp",
  "logged_in_customer_id",
  "path_prefix",
  "id_token",
]);

function isViteAssetPath(path) {
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

function stripShopifyProxyQuery(search) {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  for (const key of [...params.keys()]) {
    if (SHOPIFY_PROXY_QUERY.has(key)) params.delete(key);
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}

function rewriteProxyViteUrl(url) {
  if (!url) return url;
  const q = url.indexOf("?");
  const pathname = q === -1 ? url : url.slice(0, q);
  const search = q === -1 ? "" : url.slice(q);
  const prefixes = ["/api/proxy/", "/apps/product-customizer/"];
  for (const prefix of prefixes) {
    if (!pathname.startsWith(prefix)) continue;
    const restPath = pathname.slice(prefix.length);
    if (isViteAssetPath(restPath)) {
      return `/${restPath}${stripShopifyProxyQuery(search)}`;
    }
  }
  if (pathname.startsWith("/apps/product-customizer/")) {
    return `/api/proxy/${pathname.slice("/apps/product-customizer/".length)}${search}`;
  }
  return url;
}

function shopifyProxyViteDev() {
  const middleware = (req, _res, next) => {
    const rewritten = rewriteProxyViteUrl(req.url || "");
    if (rewritten !== req.url) req.url = rewritten;
    next();
  };
  return {
    name: "shopify-app-proxy-vite-dev",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

let hmrConfig;

if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = {
    protocol: "wss",
    host: host,
    port: parseInt(process.env.FRONTEND_PORT) || 8002,
    clientPort: 443,
  };
}

export default defineConfig({
  server: {
    origin: appUrl,
    allowedHosts: [host],
    cors: {
      origin: true,
      preflightContinue: true,
    },
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    fs: {
      // See https://vitejs.dev/config/server-options.html#server-fs-allow for more information
      allow: ["app", "node_modules"],
    },
  },
  plugins: [shopifyProxyViteDev(), reactRouter(), tsconfigPaths()],
  build: {
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: ["@shopify/app-bridge-react", "fabric", "qrcode"],
  },
  ssr: {
    external: ["@prisma/client", ".prisma/client"],
    noExternal: ["@shopify/shopify-app-react-router"],
  },
  environments: {
    ssr: {
      resolve: {
        external: ["@prisma/client", ".prisma/client"],
      },
    },
  },
});
