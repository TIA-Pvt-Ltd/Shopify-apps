import { useLoaderData, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getOrCreateStore, updateStoreSettings } from "../services/store.server";
import { defaultStoreSettings } from "../utils/customizer-defaults";
import { parseJsonField } from "../utils/json";
import { themeEditorUrls } from "../utils/theme-editor";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  // eslint-disable-next-line no-undef
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  return {
    shop: session.shop,
    settings: parseJsonField(store.settings, defaultStoreSettings()),
    // eslint-disable-next-line no-undef
    appUrl: process.env.SHOPIFY_APP_URL || "",
    themeUrls: themeEditorUrls(session.shop, apiKey),
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const formData = await request.formData();
  const settings = {
    ...defaultStoreSettings(),
    maxUploadMb: Number(formData.get("maxUploadMb") || 8),
    defaultDpi: Number(formData.get("defaultDpi") || 300),
    allowSvg: formData.get("allowSvg") === "on",
  };
  await updateStoreSettings(store.id, settings);
  return { ok: true };
};

export default function SettingsPage() {
  const { shop, settings, appUrl, themeUrls } = useLoaderData();
  const fetcher = useFetcher();

  return (
    <s-page heading="Settings">
      <s-section heading="Store">
        <s-paragraph>{shop}</s-paragraph>
      </s-section>
      <s-section heading="Show the customizer on your store">
        <s-paragraph>
          The Customize Product button is not added automatically. Enable the app embed,
          then save the theme.
        </s-paragraph>
        <s-unordered-list>
          <s-list-item>
            Open the theme editor and turn on <s-text>Product Customizer</s-text> under
            Theme settings → App embeds.
          </s-list-item>
          <s-list-item>
            Or add the Product Customizer app block to the product template.
          </s-list-item>
          <s-list-item>
            Enable the customizer for that product in this app under Products.
          </s-list-item>
        </s-unordered-list>
        <s-stack direction="inline" gap="base">
          <s-button href={themeUrls.enableEmbed} target="_top">
            Enable app embed
          </s-button>
          <s-button href={themeUrls.addProductBlock} target="_top" variant="secondary">
            Add product block
          </s-button>
        </s-stack>
        <s-paragraph>
          App URL used by the storefront: {appUrl || "Set during shopify app dev / deploy"}
        </s-paragraph>
      </s-section>
      <s-section heading="Uploads and print files">
        <fetcher.Form method="post">
          <s-stack direction="block" gap="base">
            <label>
              Max upload size (MB)
              <input type="number" name="maxUploadMb" defaultValue={settings.maxUploadMb} />
            </label>
            <label>
              Default print DPI
              <input type="number" name="defaultDpi" defaultValue={settings.defaultDpi} />
            </label>
            <label>
              <input type="checkbox" name="allowSvg" defaultChecked={settings.allowSvg} />
              Allow SVG uploads
            </label>
            <s-button type="submit">Save settings</s-button>
          </s-stack>
        </fetcher.Form>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
