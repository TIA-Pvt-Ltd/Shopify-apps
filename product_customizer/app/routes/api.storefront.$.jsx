import { handleStorefrontApi } from "../services/storefront-api.server";
import { optionsResponse } from "../utils/http";

export const loader = async ({ request, params }) => {
  if (request.method === "OPTIONS") return optionsResponse(request);
  return handleStorefrontApi(request, params["*"] || "", { cors: true });
};

export const action = async ({ request, params }) => {
  if (request.method === "OPTIONS") return optionsResponse(request);
  return handleStorefrontApi(request, params["*"] || "", { cors: true });
};
