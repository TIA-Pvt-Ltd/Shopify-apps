import { useEffect, useMemo, useState } from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getOrCreateStore } from "../services/store.server";
import {
  saveCustomizerConfiguration,
  upsertCustomizer,
} from "../services/product.server";
import { fetchShopifyProduct, setCustomizerEnabledMetafield } from "../services/shopify-products.server";
import { handleAdminAssetUpload } from "../services/storefront-api.server";
import { validateConfigurationPayload } from "../services/validation.server";
import ViewConfigurator from "../components/admin/ViewConfigurator";
import {
  defaultCustomizerConfiguration,
  defaultPrintArea,
  mergeConfiguration,
} from "../utils/customizer-defaults";
import { USER_ERRORS, logError } from "../utils/logger.server";

export const loader = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const product = await fetchShopifyProduct(admin, params.productId);
  if (!product) {
    throw new Response("Product not found", { status: 404 });
  }
  const customizer = await upsertCustomizer(store.id, {
    shopifyProductId: product.id,
    name: product.title,
  });
  await setCustomizerEnabledMetafield(admin, product.id, Boolean(customizer.enabled));
  return { product, customizer };
};

export const action = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const result = await handleAdminAssetUpload(store, request);
    if (result.error) return { ok: false, error: result.error };
    return { ok: true, asset: result.asset };
  }

  const payload = await request.json();
  const invalid = validateConfigurationPayload(payload);
  if (invalid) return { ok: false, error: invalid };

  try {
    const customizer = await saveCustomizerConfiguration(store.id, params.productId, payload);
    await setCustomizerEnabledMetafield(admin, params.productId, Boolean(customizer?.enabled));
    return { ok: true, customizer };
  } catch (error) {
    logError("admin.saveConfiguration", error);
    return { ok: false, error: USER_ERRORS.configSave };
  }
};

export default function ProductConfigurePage() {
  const { product, customizer } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const [name, setName] = useState(customizer.name);
  const [enabled, setEnabled] = useState(customizer.enabled);
  const [configuration, setConfiguration] = useState(
    mergeConfiguration(customizer.configuration || defaultCustomizerConfiguration()),
  );
  const [views, setViews] = useState(
    customizer.views?.length
      ? customizer.views
      : [
          {
            id: `tmp-${crypto.randomUUID()}`,
            name: "Front",
            type: "front",
            imageUrl: product.imageUrl,
            sortOrder: 0,
            width: 800,
            height: 800,
            printArea: defaultPrintArea(),
          },
        ],
  );

  useEffect(() => {
    if (fetcher.data?.ok && fetcher.data.customizer) {
      shopify.toast.show("Customizer saved");
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const saving = fetcher.state !== "idle";
  const colors = configuration.colors || [];

  const save = () => {
    fetcher.submit(
      {
        name,
        enabled,
        configuration,
        views: views.map((view, index) => ({ ...view, sortOrder: index })),
      },
      {
        method: "POST",
        encType: "application/json",
      },
    );
  };

  const uploadViewImage = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", "product-image");
    formData.append("name", file.name);
    const response = await fetch(window.location.pathname, {
      method: "POST",
      body: formData,
    });
    const json = await response.json();
    if (!json.ok) {
      shopify.toast.show(json.error || "Image upload failed.", { isError: true });
      return "";
    }
    return json.asset.url;
  };

  const toolEntries = useMemo(
    () => [
      ["text", "Add text"],
      ["graphic", "Add graphic"],
      ["upload", "Upload file"],
      ["qrCode", "QR code"],
      ["namesNumbers", "Names or #s"],
      ["designIdeas", "Design ideas"],
    ],
    [],
  );

  return (
    <s-page heading={product.title}>
      <s-button slot="secondary-actions" onClick={() => navigate("/app/products")} variant="secondary">
        Back
      </s-button>
      <s-button slot="primary-action" onClick={save} {...(saving ? { loading: true } : {})}>
        Save
      </s-button>

      <s-section heading="Product information">
        <s-paragraph>
          {product.status} · {product.variants.length} variants
        </s-paragraph>
        <label>
          Customizer name
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Enable customizer on the storefront
        </label>
      </s-section>

      <s-section heading="Product views">
        <ViewConfigurator views={views} onChange={setViews} onUpload={uploadViewImage} />
      </s-section>

      <s-section heading="Colors">
        <p className="admin-muted">
          Use a separate image per color, or leave images empty to tint the product mockup.
        </p>
        <label>
          Color mode
          <select
            value={configuration.colorMode}
            onChange={(event) => setConfiguration({ ...configuration, colorMode: event.target.value })}
          >
            <option value="tint">Image colorization</option>
            <option value="image">Separate image per color</option>
          </select>
        </label>
        <div className="swatch-row">
          {colors.map((color, index) => (
            <div key={color.id || index}>
              <input
                value={color.name}
                onChange={(event) => {
                  const next = colors.slice();
                  next[index] = { ...color, name: event.target.value };
                  setConfiguration({ ...configuration, colors: next });
                }}
              />
              <input
                type="color"
                value={color.hex}
                onChange={(event) => {
                  const next = colors.slice();
                  next[index] = { ...color, hex: event.target.value };
                  setConfiguration({ ...configuration, colors: next });
                }}
              />
              <input
                placeholder="Optional image URL"
                value={color.imageUrl || ""}
                onChange={(event) => {
                  const next = colors.slice();
                  next[index] = { ...color, imageUrl: event.target.value };
                  setConfiguration({ ...configuration, colors: next });
                }}
              />
              <s-button
                variant="secondary"
                onClick={() =>
                  setConfiguration({
                    ...configuration,
                    colors: colors.filter((_, colorIndex) => colorIndex !== index),
                  })
                }
              >
                Remove
              </s-button>
            </div>
          ))}
        </div>
        <s-button
          onClick={() =>
            setConfiguration({
              ...configuration,
              colors: [
                ...colors,
                { id: crypto.randomUUID(), name: "New color", hex: "#888888", imageUrl: "" },
              ],
            })
          }
        >
          Add color
        </s-button>
      </s-section>

      <s-section heading="Allowed customization tools">
        {toolEntries.map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={configuration.tools?.[key] !== false}
              onChange={(event) =>
                setConfiguration({
                  ...configuration,
                  tools: { ...configuration.tools, [key]: event.target.checked },
                })
              }
            />
            {label}
          </label>
        ))}
      </s-section>

      <s-section heading="Pricing">
        <div className="admin-form-grid">
          {["basePrice", "textPrice", "graphicPrice", "uploadPrice"].map((key) => (
            <label key={key}>
              {key}
              <input
                type="number"
                step="0.01"
                value={configuration.pricing?.[key] || 0}
                onChange={(event) =>
                  setConfiguration({
                    ...configuration,
                    pricing: {
                      ...configuration.pricing,
                      [key]: Number(event.target.value) || 0,
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
      </s-section>

      <s-section heading="Customer options">
        <label>
          <input
            type="checkbox"
            checked={Boolean(configuration.customerOptions?.allowOverflow)}
            onChange={(event) =>
              setConfiguration({
                ...configuration,
                customerOptions: {
                  ...configuration.customerOptions,
                  allowOverflow: event.target.checked,
                },
              })
            }
          />
          Allow design to overflow the print area
        </label>
        <label>
          <input
            type="checkbox"
            checked={configuration.customerOptions?.showQuantity !== false}
            onChange={(event) =>
              setConfiguration({
                ...configuration,
                customerOptions: {
                  ...configuration.customerOptions,
                  showQuantity: event.target.checked,
                },
              })
            }
          />
          Show quantity selector
        </label>
        <div className="admin-form-grid">
          <label>
            Min quantity
            <input
              type="number"
              value={configuration.customerOptions?.minQuantity || 1}
              onChange={(event) =>
                setConfiguration({
                  ...configuration,
                  customerOptions: {
                    ...configuration.customerOptions,
                    minQuantity: Number(event.target.value) || 1,
                  },
                })
              }
            />
          </label>
          <label>
            Max quantity
            <input
              type="number"
              value={configuration.customerOptions?.maxQuantity || 99}
              onChange={(event) =>
                setConfiguration({
                  ...configuration,
                  customerOptions: {
                    ...configuration.customerOptions,
                    maxQuantity: Number(event.target.value) || 99,
                  },
                })
              }
            />
          </label>
          <label>
            Print DPI
            <input
              type="number"
              value={configuration.print?.dpi || 300}
              onChange={(event) =>
                setConfiguration({
                  ...configuration,
                  print: { ...configuration.print, dpi: Number(event.target.value) || 300 },
                })
              }
            />
          </label>
        </div>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
