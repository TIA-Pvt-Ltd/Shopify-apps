import { authenticate } from "../shopify.server";
import { getOrCreateStore } from "../services/store.server";
import { listAssets } from "../services/asset.server";
import { handleAdminAssetUpload, getAppUrl } from "../services/storefront-api.server";
import { apiError, apiOk } from "../utils/http";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const url = new URL(request.url);
  const assets = await listAssets(store.id, {
    type: url.searchParams.get("type") || undefined,
    category: url.searchParams.get("category") || undefined,
    appUrl: getAppUrl(request),
  });
  return apiOk({ assets });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  if (request.method !== "POST") return apiError("Method not allowed.", 405);
  const result = await handleAdminAssetUpload(store, request);
  if (result.error) return apiError(result.error, 400);
  return apiOk({ asset: result.asset }, { status: 201 });
};
