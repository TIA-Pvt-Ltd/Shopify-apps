import { Link, useLoaderData, useNavigate } from "react-router";
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
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function MetricCard({ label, value, detail, icon, tone, onClick }) {
  return (
    <button type="button" className={`dash-metric dash-metric--${tone}`} onClick={onClick}>
      <span className="dash-metric-icon" aria-hidden="true">
        <s-icon type={icon} />
      </span>
      <span className="dash-metric-copy">
        <span className="dash-metric-label">{label}</span>
        <span className="dash-metric-value">{value}</span>
        <span className="dash-metric-detail">{detail}</span>
      </span>
    </button>
  );
}

function Shortcut({ icon, title, detail, onClick }) {
  return (
    <button type="button" className="dash-shortcut" onClick={onClick}>
      <span className="dash-shortcut-icon" aria-hidden="true">
        <s-icon type={icon} />
      </span>
      <span>
        <span className="dash-shortcut-title">{title}</span>
        <span className="dash-shortcut-detail">{detail}</span>
      </span>
    </button>
  );
}

export default function Dashboard() {
  const { shop, stats, themeUrls } = useLoaderData();
  const navigate = useNavigate();
  const setupComplete = stats.customizableProducts > 0;
  const graphicsReady = stats.graphicsCount > 0;
  const fontsReady = stats.fontsCount > 0;
  const setupDone = [setupComplete, graphicsReady, fontsReady].filter(Boolean).length;
  const setupTotal = 3;
  const setupPercent = Math.round((setupDone / setupTotal) * 100);
  const go = (path) => navigate(path);

  const metrics = [
    {
      label: "Live products",
      value: stats.customizableProducts,
      detail:
        stats.configuredProducts > stats.customizableProducts
          ? `${stats.configuredProducts} configured total`
          : "Ready on the storefront",
      icon: "product",
      tone: "teal",
      href: "/app/products",
    },
    {
      label: "Graphics",
      value: stats.graphicsCount,
      detail: graphicsReady ? "In the design library" : "Upload clip art next",
      icon: "image",
      tone: "blue",
      href: "/app/graphics",
    },
    {
      label: "Templates",
      value: stats.savedDesigns,
      detail: "Reusable starting designs",
      icon: "page",
      tone: "amber",
      href: "/app/templates",
    },
    {
      label: "Customer designs",
      value: stats.customizations,
      detail: "Saved from the storefront",
      icon: "order",
      tone: "violet",
      href: "/app/orders",
    },
  ];

  const heroTitle = setupComplete
    ? "Your design studio is live"
    : "Set up your product customizer";
  const heroBody = setupComplete
    ? `${stats.customizableProducts} product${stats.customizableProducts === 1 ? "" : "s"} can be customized${
        graphicsReady ? "" : ". Upload graphics so customers have artwork to start from"
      }.`
    : "Enable a product, add graphics, and turn on the storefront button to start selling custom designs.";

  return (
    <s-page heading="Dashboard" inlineSize="large">
      <s-button slot="primary-action" onClick={() => go("/app/products")}>
        Configure products
      </s-button>
      <s-button slot="secondary-actions" onClick={() => go("/app/settings")} variant="secondary">
        Settings
      </s-button>

      <div className="dash-page">
        {!setupComplete ? (
          <s-banner tone="info" heading="Enable a product to go live">
            The storefront customizer stays hidden until at least one product is enabled.{" "}
            <s-link
              href="/app/products"
              onClick={(event) => {
                event.preventDefault();
                go("/app/products");
              }}
            >
              Open products
            </s-link>
          </s-banner>
        ) : !graphicsReady ? (
          <s-banner tone="info" heading="Add graphics next">
            {stats.customizableProducts} product{stats.customizableProducts === 1 ? "" : "s"} can
            already be customized. Upload clip art so customers have designs to start from.{" "}
            <s-link
              href="/app/graphics"
              onClick={(event) => {
                event.preventDefault();
                go("/app/graphics");
              }}
            >
              Upload graphics
            </s-link>
          </s-banner>
        ) : null}

        <section className="dash-hero">
          <div className="dash-hero-copy">
            <p className="dash-kicker">Product customizer</p>
            <h2 className="dash-hero-title">{heroTitle}</h2>
            <p className="dash-hero-body">
              {heroBody}
              {shop ? ` · ${shop}` : ""}
            </p>
          </div>
          <div className="dash-hero-actions">
            <button type="button" className="dash-hero-btn dash-hero-btn-primary" onClick={() => go("/app/products")}>
              Configure products
            </button>
            <button type="button" className="dash-hero-btn" onClick={() => go("/app/graphics")}>
              Upload graphics
            </button>
          </div>
        </section>

        <section className="dash-metrics" aria-label="Overview">
          {metrics.map((metric) => (
            <MetricCard
              key={metric.label}
              label={metric.label}
              value={metric.value}
              detail={metric.detail}
              icon={metric.icon}
              tone={metric.tone}
              onClick={() => go(metric.href)}
            />
          ))}
        </section>

        <div className="dash-layout">
          <div className="dash-main">
            <section className="dash-card">
              <header className="dash-card-head">
                <div>
                  <h3 className="dash-card-title">Recent products</h3>
                  <p className="dash-card-subtitle">Latest items with a customizer configuration</p>
                </div>
                <s-button variant="secondary" onClick={() => go("/app/products")}>
                  View all
                </s-button>
              </header>
              {stats.recentCustomizers.length ? (
                <div className="dash-list">
                  {stats.recentCustomizers.map((item) => (
                    <Link
                      key={item.id}
                      to={`/app/products/${item.numericId}`}
                      className="dash-list-row"
                      data-app-to={`/app/products/${item.numericId}`}
                    >
                      {item.imageUrl ? (
                        <img className="dash-list-thumb" src={item.imageUrl} alt="" />
                      ) : (
                        <span className="dash-list-thumb is-empty" />
                      )}
                      <span className="dash-list-copy">
                        <span className="dash-list-title">{item.title}</span>
                        {item.handle ? <span className="dash-list-meta">{item.handle}</span> : null}
                      </span>
                      <span className={`dash-status ${item.enabled ? "is-on" : ""}`}>
                        {item.enabled ? "Enabled" : "Disabled"}
                      </span>
                      <span className="dash-list-date">{formatDate(item.updatedAt)}</span>
                      <span className="dash-list-action">Configure</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="dash-empty">
                  <s-icon type="product" />
                  <h3>No products configured yet</h3>
                  <p>Enable a product to start selling custom designs.</p>
                  <s-button onClick={() => go("/app/products")}>Browse products</s-button>
                </div>
              )}
            </section>

            <section className="dash-card">
              <header className="dash-card-head">
                <div>
                  <h3 className="dash-card-title">Recent customizations</h3>
                  <p className="dash-card-subtitle">Designs customers saved or added to cart</p>
                </div>
                <s-button variant="secondary" onClick={() => go("/app/orders")}>
                  View all
                </s-button>
              </header>
              {stats.recentCustomizations.length ? (
                <div className="dash-preview-grid">
                  {stats.recentCustomizations.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="dash-preview-card"
                      onClick={() => go("/app/orders")}
                    >
                      <span className={`dash-preview-thumb${item.previewUrl || item.imageUrl ? "" : " is-empty"}`}>
                        {item.previewUrl || item.imageUrl ? (
                          <img src={item.previewUrl || item.imageUrl} alt="" />
                        ) : null}
                      </span>
                      <span className="dash-preview-title">{item.publicId}</span>
                      <span className="dash-preview-meta">
                        {[item.title, formatDate(item.createdAt)].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="dash-empty">
                  <s-icon type="order" />
                  <h3>No customer designs yet</h3>
                  <p>Designs appear here after someone saves a customization or adds it to cart.</p>
                </div>
              )}
            </section>
          </div>

          <aside className="dash-sidebar">
            <section className="dash-card">
              <header className="dash-card-head">
                <div>
                  <h3 className="dash-card-title">Setup checklist</h3>
                  <p className="dash-card-subtitle">
                    {setupDone} of {setupTotal} complete
                  </p>
                </div>
                <s-badge tone={setupDone === setupTotal ? "success" : "info"}>{setupPercent}%</s-badge>
              </header>
              <div className="dash-progress" aria-hidden="true">
                <span className="dash-progress-bar" style={{ width: `${setupPercent}%` }} />
              </div>
              <ol className="dash-setup">
                <li className={setupComplete ? "is-done" : ""}>
                  <span className="dash-setup-mark">{setupComplete ? "✓" : "1"}</span>
                  <div>
                    <strong>Enable a product</strong>
                    <p>
                      {setupComplete
                        ? `${stats.customizableProducts} product${stats.customizableProducts === 1 ? "" : "s"} can be customized.`
                        : "Turn the customizer on for at least one product."}
                    </p>
                  </div>
                </li>
                <li className={graphicsReady ? "is-done" : ""}>
                  <span className="dash-setup-mark">{graphicsReady ? "✓" : "2"}</span>
                  <div>
                    <strong>Add graphics</strong>
                    <p>
                      {graphicsReady
                        ? `${stats.graphicsCount} graphic${stats.graphicsCount === 1 ? "" : "s"} in the library.`
                        : "Upload clip art customers can place on products."}
                    </p>
                    {!graphicsReady ? (
                      <s-button variant="secondary" onClick={() => go("/app/graphics")}>
                        Upload graphics
                      </s-button>
                    ) : null}
                  </div>
                </li>
                <li className={fontsReady ? "is-done" : ""}>
                  <span className="dash-setup-mark">{fontsReady ? "✓" : "3"}</span>
                  <div>
                    <strong>Add brand fonts</strong>
                    <p>
                      {fontsReady
                        ? `${stats.fontsCount} font${stats.fontsCount === 1 ? "" : "s"} available in the editor.`
                        : "Optional, but recommended for on-brand text."}
                    </p>
                    {!fontsReady ? (
                      <s-button variant="secondary" onClick={() => go("/app/fonts")}>
                        Add fonts
                      </s-button>
                    ) : null}
                  </div>
                </li>
              </ol>
              <div className="dash-setup-theme">
                <strong>Show the button on the product page</strong>
                <p>
                  The storefront customizer stays hidden until the app embed is enabled in the theme
                  editor.
                </p>
                <s-button href={themeUrls.enableEmbed} target="_top">
                  Enable storefront button
                </s-button>
                <s-link
                  href="/app/settings"
                  onClick={(event) => {
                    event.preventDefault();
                    go("/app/settings");
                  }}
                >
                  More theme setup options
                </s-link>
              </div>
            </section>

            <section className="dash-card">
              <header className="dash-card-head">
                <div>
                  <h3 className="dash-card-title">Shortcuts</h3>
                  <p className="dash-card-subtitle">Jump into the most used tools</p>
                </div>
              </header>
              <div className="dash-shortcuts">
                <Shortcut
                  icon="product"
                  title="Products"
                  detail="Print areas and colors"
                  onClick={() => go("/app/products")}
                />
                <Shortcut
                  icon="image"
                  title="Graphics"
                  detail="Clip art and logos"
                  onClick={() => go("/app/graphics")}
                />
                <Shortcut
                  icon="text"
                  title="Fonts"
                  detail="Brand typefaces"
                  onClick={() => go("/app/fonts")}
                />
                <Shortcut
                  icon="page"
                  title="Templates"
                  detail="Starting designs"
                  onClick={() => go("/app/templates")}
                />
                <Shortcut
                  icon="order"
                  title="Orders"
                  detail="Customer previews"
                  onClick={() => go("/app/orders")}
                />
              </div>
            </section>
          </aside>
        </div>
      </div>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
