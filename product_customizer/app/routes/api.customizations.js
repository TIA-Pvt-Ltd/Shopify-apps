import { authenticate } from "../shopify.server";
import { getOrCreateStore } from "../services/store.server";
import { createCustomization } from "../services/customization.server";
import { validateCustomizationPayload } from "../services/validation.server";
import { getAppUrl } from "../services/storefront-api.server";
import { apiError, apiOk } from "../utils/http";
import { USER_ERRORS, logError } from "../utils/logger.server";

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  if (request.method !== "POST") return apiError("Method not allowed.", 405);
  const payload = await request.json();
  const invalid = validateCustomizationPayload(payload);
  if (invalid) return apiError(invalid, 400);
  try {
    const customization = await createCustomization(store, payload, getAppUrl(request));
    return apiOk({ customization }, { status: 201 });
  } catch (error) {
    logError("api.customizations", error);
    return apiError(USER_ERRORS.saveCustomization, 500);
  }
};
