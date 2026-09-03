import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";

const STREAM_TIMEOUT_MS = 5000;
export const streamTimeout = STREAM_TIMEOUT_MS;

function appOrigin() {
  return String(process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
}

function rewriteDevAssetUrls(html, origin) {
  if (!origin || !html) return html;
  const importMap = `<script type="importmap">${JSON.stringify({
    imports: {
      "/@vite/": `${origin}/@vite/`,
      "/@id/": `${origin}/@id/`,
      "/@fs/": `${origin}/@fs/`,
      "/@react-refresh": `${origin}/@react-refresh`,
      "/node_modules/": `${origin}/node_modules/`,
      "/app/": `${origin}/app/`,
      "/assets/": `${origin}/assets/`,
    },
  })}</script>`;
  const withAbsoluteAssets = html.replace(
    /(src|href)="\/(@vite\/|@id\/|@fs\/|@react-refresh|node_modules\/|app\/|assets\/)/g,
    `$1="${origin}/$2`,
  );
  return withAbsoluteAssets.replace("<head>", `<head>${importMap}`);
}

export default async function handleRequest(
  request,
  responseStatusCode,
  responseHeaders,
  reactRouterContext,
) {
  const pathname = new URL(request.url).pathname.replace(/(\/_)?\.data$/, "");
  const isProxyCustomizer =
    pathname.startsWith("/api/proxy/customizer") ||
    pathname.startsWith("/apps/product-customizer/customizer");
  const isStorefrontPage = pathname.startsWith("/storefront") || isProxyCustomizer;
  const origin = appOrigin();

  if (!isStorefrontPage) {
    addDocumentResponseHeaders(request, responseHeaders);
  }

  if (isStorefrontPage) {
    responseHeaders.delete("X-Frame-Options");
    responseHeaders.delete("x-frame-options");
    const shop = new URL(request.url).searchParams.get("shop");
    const ancestors = [
      "'self'",
      "https://admin.shopify.com",
      "https://*.myshopify.com",
      "https://*.shopify.com",
    ];
    if (shop) ancestors.push(`https://${shop.replace(/^https?:\/\//, "")}`);
    const scriptSrc = [
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
      "blob:",
      "https://cdn.shopify.com",
      "https://fonts.googleapis.com",
    ];
    const connectSrc = [
      "'self'",
      "https://cdn.shopify.com",
      "https://fonts.googleapis.com",
      "https://fonts.gstatic.com",
    ];
    if (origin) {
      scriptSrc.push(origin);
      connectSrc.push(origin, origin.replace(/^https:/, "wss:"), origin.replace(/^https:/, "ws:"));
    }
    responseHeaders.delete("Content-Security-Policy");
    responseHeaders.delete("X-Frame-Options");
    responseHeaders.set(
      "Content-Security-Policy",
      [
        `frame-ancestors ${ancestors.join(" ")} *`,
        `script-src ${scriptSrc.join(" ")}`,
        `style-src 'self' 'unsafe-inline' https://cdn.shopify.com https://fonts.googleapis.com ${origin}`.trim(),
        `img-src * data: blob:`,
        `font-src 'self' data: https://cdn.shopify.com https://fonts.gstatic.com ${origin}`.trim(),
        `connect-src ${connectSrc.join(" ")}`,
        `worker-src 'self' blob:`,
      ].join("; "),
    );
  }

  const userAgent = request.headers.get("user-agent");
  const waitForFullHtml = isStorefrontPage || isbot(userAgent ?? "");
  const callbackName = waitForFullHtml ? "onAllReady" : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={reactRouterContext} url={request.url} />,
      {
        [callbackName]: () => {
          responseHeaders.set("Content-Type", "text/html");

          if (isStorefrontPage && origin) {
            const body = new PassThrough();
            const chunks = [];
            body.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
            body.on("end", () => {
              const html = rewriteDevAssetUrls(
                Buffer.concat(chunks).toString("utf8"),
                origin,
              );
              resolve(
                new Response(html, {
                  headers: responseHeaders,
                  status: responseStatusCode,
                }),
              );
            });
            body.on("error", reject);
            pipe(body);
            return;
          }

          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        },
      },
    );

    setTimeout(abort, STREAM_TIMEOUT_MS + 1000);
  });
}
