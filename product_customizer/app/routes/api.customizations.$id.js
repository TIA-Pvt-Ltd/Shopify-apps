import { authenticate } from "../shopify.server";
import { getOrCreateStore } from "../services/store.server";
import {
  getCustomizationByPublicId,
  updateCustomization,
} from "../services/customization.server";
import { getAppUrl } from "../services/storefront-api.server";
import { apiError, apiOk } from "../utils/http";
import { USER_ERRORS } from "../utils/logger.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const customization = await getCustomizationByPublicId(
    store.id,
    params.id,
    getAppUrl(request),
  );
  if (!customization) return apiError(USER_ERRORS.notFound, 404);
  return apiOk({ customization });
};

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  if (request.method !== "PUT" && request.method !== "POST") {
    return apiError("Method not allowed.", 405);
  }
  const payload = await request.json();
  const customization = await updateCustomization(
    store.id,
    params.id,
    payload,
    getAppUrl(request),
  );
  if (!customization) return apiError(USER_ERRORS.notFound, 404);
  return apiOk({ customization });
};
