import { authenticate } from "../shopify.server";
import { apiError, apiOk } from "../utils/http";
import { toNumericId } from "../utils/gid";
import { cartLineProperties } from "../utils/cart-add";

export const action = async ({ request }) => {
  await authenticate.admin(request);
  if (request.method !== "POST") return apiError("Method not allowed.", 405);
  const payload = await request.json();
  if (!payload.customizationId || !payload.variantId) {
    return apiError("A customization ID and variant ID are required.");
  }
  return apiOk({
    cartPayload: {
      id: toNumericId(payload.variantId),
      quantity: Math.max(1, Number(payload.quantity) || 1),
      properties: cartLineProperties({
        publicId: payload.customizationId,
        previewUrl: payload.previewUrl,
        color: payload.color,
        view: payload.view,
        configuration: payload.configuration,
      }),
    },
  });
};
