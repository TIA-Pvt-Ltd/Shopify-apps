import { loadAppProxyCustomizerPage } from "../services/proxy-customizer.server";
import {
  StorefrontCustomizerView,
  links as customizerLinks,
} from "../components/customizer/StorefrontCustomizerView.jsx";

export const links = customizerLinks;

export const shouldRevalidate = () => false;

export const headers = () => ({
  "Content-Security-Policy":
    "frame-ancestors 'self' https://*.myshopify.com https://*.shopify.com https://admin.shopify.com *;",
});

export const loader = async ({ request }) => {
  return loadAppProxyCustomizerPage({ request });
};

export default StorefrontCustomizerView;
