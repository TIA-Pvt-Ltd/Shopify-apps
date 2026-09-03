import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getOrCreateStore } from "../services/store.server";
import { getDashboardStats } from "../services/product.server";
import { fetchShopifyProductsByIds } from "../services/shopify-products.server";
import { getAppUrl } from "../services/storefront-api.server";
import { absoluteAssetUrl } from "../services/storage.server";
import { themeEditorUrls } from "../utils/theme-editor";
import { toGid, toNumericId } from "../utils/gid";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const stats = await getDashboardStats(store.id);
  const appUrl = getAppUrl(request);
  const productIds = [
    ...stats.recentCustomizers.map((item) => item.shopifyProductId),
    ...stats.recentCustomizations.map((item) => item.shopifyProductId),
  ];
  const shopifyProducts = await fetchShopifyProductsByIds(admin, productIds);
  // eslint-disable-next-line no-undef
  const apiKey = process.env.SHOPIFY_API_KEY || "";

  return {
    shop: session.shop,
    stats: {
      ...stats,
      recentCustomizers: stats.recentCustomizers.map((item) =>
        withShopifyProduct(item, shopifyProducts),
      ),
      recentCustomizations: stats.recentCustomizations.map((item) => ({
        ...withShopifyProduct(item, shopifyProducts),
        previewUrl: absoluteAssetUrl(item.previewUrl, appUrl),
      })),
    },
    themeUrls: themeEditorUrls(session.shop, apiKey),
  };
};

function withShopifyProduct(item, shopifyProducts) {
  const product = shopifyProducts[toGid(item.shopifyProductId)] || null;
  const placeholder = !item.name || item.name === "Customizable product";
  return {
    ...item,
    title: placeholder ? product?.title || item.name || "Untitled product" : item.name,
    handle: product?.handle || "",
    imageUrl: item.imageUrl || item.previewUrl || product?.imageUrl || "",
    numericId: product?.numericId || toNumericId(item.shopifyProductId),
  };
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function MetricCard({ href, label, value, detail }) {
  return (
    <s-clickable href={href} padding="base" borderRadius="base">
      <s-stack gap="small-200">
        <s-text color="subdued">{label}</s-text>
        <span className="admin-metric-value">{value}</span>
        <s-text color="subdued">{detail}</s-text>
      </s-stack>
    </s-clickable>
  );
}

export default function Dashboard() {
  const { stats, themeUrls } = useLoaderData();
  const setupComplete = stats.customizableProducts > 0;
  const graphicsReady = stats.graphicsCount > 0;

  return (
    <s-page heading="Dashboard" inlineSize="large">
      <s-button slot="primary-action" href="/app/products">
        Configure products
      </s-button>
      <s-button slot="secondary-actions" href="/app/settings" variant="secondary">
        Settings
      </s-button>

      {!setupComplete ? (
        <s-banner tone="info">
          Enable at least one product to show the customizer on your storefront.{" "}
          <s-link href="/app/products">View products</s-link>
        </s-banner>
      ) : null}

      <s-section heading="Overview" padding="base">
        <s-grid
          gridTemplateColumns="@container (inline-size <= 640px) 1fr, 1fr auto 1fr auto 1fr auto 1fr"
          gap="small"
          alignItems="center"
        >
          <MetricCard
            href="/app/products"
            label="Enabled products"
            value={stats.customizableProducts}
            detail="Live on the storefront"
          />
          <s-divider direction="block" />
          <MetricCard
            href="/app/graphics"
            label="Graphics"
            value={stats.graphicsCount}
            detail="Available in the editor"
          />
          <s-divider direction="block" />
          <MetricCard
            href="/app/templates"
            label="Templates"
            value={stats.savedDesigns}
            detail="Reusable starting designs"
          />
          <s-divider direction="block" />
          <MetricCard
            href="/app/orders"
            label="Customizations"
            value={stats.customizations}
            detail="Customer designs saved"
          />
        </s-grid>
      </s-section>

      <s-section heading="Quick actions">
        <s-stack direction="inline" gap="small">
          <s-button href="/app/products" icon="product">
            Products
          </s-button>
          <s-button href="/app/graphics" variant="secondary" icon="image">
            Upload graphics
          </s-button>
          <s-button href="/app/fonts" variant="secondary" icon="text">
            Fonts
          </s-button>
          <s-button href="/app/templates" variant="secondary" icon="page">
            Templates
          </s-button>
          <s-button href="/app/orders" variant="secondary" icon="order">
            Orders
          </s-button>
        </s-stack>
      </s-section>

      <s-section heading="Recent products" padding="none">
        {stats.recentCustomizers.length ? (
          <s-table>
            <s-link slot="filters" href="/app/products">
              View all products
            </s-link>
            <s-table-header-row>
              <s-table-header listSlot="primary">Product</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Updated</s-table-header>
              <s-table-header listSlot="secondary"> </s-table-header>
            </s-table-header-row>
            <s-table-body>
              {stats.recentCustomizers.map((item) => (
                <s-table-row key={item.id}>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small" alignItems="center">
                      <s-thumbnail src={item.imageUrl || undefined} alt={item.title} size="small" />
                      <s-stack gap="none">
                        <s-link href={`/app/products/${item.numericId}`}>{item.title}</s-link>
                        {item.handle ? <span className="admin-muted">{item.handle}</span> : null}
                      </s-stack>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    <s-badge tone={item.enabled ? "success" : "neutral"}>
                      {item.enabled ? "Enabled" : "Disabled"}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>{formatDate(item.updatedAt)}</s-table-cell>
                  <s-table-cell>
                    <s-button href={`/app/products/${item.numericId}`} variant="secondary">
                      Configure
                    </s-button>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        ) : (
          <s-box padding="base">
            <s-stack gap="small">
              <s-paragraph>
                No products are configured yet. Enable a product to start selling custom designs.
              </s-paragraph>
              <s-button href="/app/products">Browse products</s-button>
            </s-stack>
          </s-box>
        )}
      </s-section>

      <s-section heading="Recent customizations" padding="none">
        {stats.recentCustomizations.length ? (
          <s-table>
            <s-link slot="filters" href="/app/orders">
              View all orders
            </s-link>
            <s-table-header-row>
              <s-table-header listSlot="primary">Design</s-table-header>
              <s-table-header>Product</s-table-header>
              <s-table-header format="numeric">Qty</s-table-header>
              <s-table-header>Date</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {stats.recentCustomizations.map((item) => (
                <s-table-row key={item.id}>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small" alignItems="center">
                      <s-thumbnail
                        src={item.previewUrl || item.imageUrl || undefined}
                        alt={item.publicId}
                        size="small"
                      />
                      <s-stack gap="none">
                        <s-text>{item.publicId}</s-text>
                        {item.color ? <span className="admin-muted">{item.color}</span> : null}
                      </s-stack>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    {item.numericId ? (
                      <s-link href={`/app/products/${item.numericId}`}>{item.title}</s-link>
                    ) : (
                      item.title
                    )}
                  </s-table-cell>
                  <s-table-cell>{item.quantity}</s-table-cell>
                  <s-table-cell>{formatDate(item.createdAt)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        ) : (
          <s-box padding="base">
            <s-paragraph>
              Customer designs will appear here after someone saves a customization or adds it to
              cart.
            </s-paragraph>
          </s-box>
        )}
      </s-section>

      <s-section slot="aside" heading="Setup">
        <s-stack gap="base">
          <s-stack gap="small-200">
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-badge tone={setupComplete ? "success" : "warning"}>
                {setupComplete ? "Done" : "To do"}
              </s-badge>
              <s-text>Enable a product</s-text>
            </s-stack>
            <s-paragraph color="subdued">
              {setupComplete
                ? `${stats.customizableProducts} product${stats.customizableProducts === 1 ? "" : "s"} can be customized.`
                : "Turn the customizer on for at least one product."}
            </s-paragraph>
          </s-stack>
          <s-stack gap="small-200">
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-badge tone={graphicsReady ? "success" : "warning"}>
                {graphicsReady ? "Done" : "To do"}
              </s-badge>
              <s-text>Add graphics</s-text>
            </s-stack>
            <s-paragraph color="subdued">
              {graphicsReady
                ? `${stats.graphicsCount} graphic${stats.graphicsCount === 1 ? "" : "s"} in the library.`
                : "Upload clip art customers can place on products."}
            </s-paragraph>
          </s-stack>
          <s-stack gap="small-200">
            <s-text>Show the button on the product page</s-text>
            <s-paragraph color="subdued">
              The storefront customizer stays hidden until the app embed is enabled in the theme
              editor.
            </s-paragraph>
          </s-stack>
          <s-button href={themeUrls.enableEmbed} target="_top">
            Enable storefront button
          </s-button>
          <s-link href="/app/settings">More theme setup options</s-link>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
