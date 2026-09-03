import { serveCustomizationPreview } from "../services/customization.server";

export const loader = async ({ request, params }) => {
  return serveCustomizationPreview(request, `p/${params.publicId || ""}`);
};
