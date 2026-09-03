import { authenticate } from "../shopify.server";
import { handleStorefrontApi } from "../services/storefront-api.server";
import { serveCustomizationPreview } from "../services/customization.server";
import { isPublicUploadPath, servePublicUpload } from "../services/storage.server";
import { optionsResponse } from "../utils/http";
import { isViteAssetPath, proxyViteAsset } from "../utils/vite-asset-proxy.server";

async function handleProxyRequest(request, params) {
  if (request.method === "OPTIONS") return optionsResponse(request);
  const splat = params["*"] || "";
  if (request.method === "GET" && /^p\//i.test(splat)) {
    return serveCustomizationPreview(request, splat);
  }
  if (request.method === "GET" && isPublicUploadPath(splat)) {
    return servePublicUpload(splat);
  }
  if (isViteAssetPath(splat)) {
    return proxyViteAsset(request, splat);
  }
  const { session } = await authenticate.public.appProxy(request);
  return handleStorefrontApi(request, splat, {
    shop: session?.shop,
    cors: false,
  });
}

export const loader = ({ request, params }) => handleProxyRequest(request, params);

export const action = ({ request, params }) => handleProxyRequest(request, params);
