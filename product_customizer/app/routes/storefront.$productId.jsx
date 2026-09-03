import { loadStorefrontCustomizerPage } from "../services/storefront-page.server";
import {
  StorefrontCustomizerView,
  links as customizerLinks,
} from "../components/customizer/StorefrontCustomizerView.jsx";

export const links = customizerLinks;

export const shouldRevalidate = () => false;

export const loader = async ({ request, params }) => {
  const url = new URL(request.url);
  return loadStorefrontCustomizerPage({
    request,
    shop: url.searchParams.get("shop"),
    productId: params.productId,
    handle: url.searchParams.get("handle") || "",
  });
};

export default StorefrontCustomizerView;
