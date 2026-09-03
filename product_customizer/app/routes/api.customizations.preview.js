import { authenticate } from "../shopify.server";
import { getOrCreateStore } from "../services/store.server";
import { generatePreview } from "../services/preview.server";
import { getAppUrl } from "../services/storefront-api.server";
import { apiError, apiOk } from "../utils/http";
import { USER_ERRORS, logError } from "../utils/logger.server";

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  if (request.method !== "POST") return apiError("Method not allowed.", 405);
  try {
    const payload = await request.json();
    const result = await generatePreview(store, payload, getAppUrl(request));
    return apiOk(result);
  } catch (error) {
    logError("api.preview", error);
    return apiError(USER_ERRORS.previewFailed, 500);
  }
};
