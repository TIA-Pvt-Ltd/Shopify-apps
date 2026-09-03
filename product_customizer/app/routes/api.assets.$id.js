import { authenticate } from "../shopify.server";
import { getOrCreateStore } from "../services/store.server";
import { deleteAsset } from "../services/asset.server";
import { apiError, apiOk } from "../utils/http";
import { USER_ERRORS } from "../utils/logger.server";

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  if (request.method !== "DELETE" && request.method !== "POST") {
    return apiError("Method not allowed.", 405);
  }
  const deleted = await deleteAsset(store.id, params.id);
  if (!deleted) return apiError(USER_ERRORS.notFound, 404);
  return apiOk({ deleted: true });
};
