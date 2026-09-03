import { authenticate } from "../shopify.server";
import { getOrCreateStore } from "../services/store.server";
import {
  getCustomizerByProduct,
  saveCustomizerConfiguration,
} from "../services/product.server";
import { validateConfigurationPayload } from "../services/validation.server";
import { apiError, apiOk } from "../utils/http";
import { USER_ERRORS, logError } from "../utils/logger.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const customizer = await getCustomizerByProduct(store.id, params.id);
  if (!customizer) return apiError(USER_ERRORS.notFound, 404);
  return apiOk({ customizer });
};

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  if (request.method !== "POST" && request.method !== "PUT") {
    return apiError("Method not allowed.", 405);
  }
  const payload = await request.json();
  const invalid = validateConfigurationPayload(payload);
  if (invalid) return apiError(invalid, 400);
  try {
    const customizer = await saveCustomizerConfiguration(store.id, params.id, payload);
    return apiOk({ customizer });
  } catch (error) {
    logError("api.configuration", error);
    return apiError(USER_ERRORS.configSave, 500);
  }
};
