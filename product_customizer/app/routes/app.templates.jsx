import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getOrCreateStore } from "../services/store.server";
import { createTemplate, deleteTemplate, listTemplates } from "../services/asset.server";
import { getCustomizerById, listCustomizers } from "../services/product.server";
import { fetchShopifyProductsByIds } from "../services/shopify-products.server";
import { logError } from "../utils/logger.server";
import { toGid, toNumericId } from "../utils/gid";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const [templates, customizers] = await Promise.all([
    listTemplates(store.id),
    listCustomizers(store.id),
  ]);
  const shopifyProducts = await fetchShopifyProductsByIds(
    admin,
    customizers.map((item) => item.shopifyProductId),
  );
  const seen = new Set();
  const products = [];
  for (const item of customizers) {
    const gid = toGid(item.shopifyProductId);
    if (!gid || seen.has(gid)) continue;
    seen.add(gid);
    const product = shopifyProducts[gid] || null;
    products.push({
      id: item.id,
      title: product?.title || item.name || "Customizable product",
      enabled: item.enabled,
      numericId: product?.numericId || toNumericId(item.shopifyProductId),
    });
  }
  return { templates, products };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "create") {
    const customizer = await getCustomizerById(store.id, String(formData.get("customizerId") || ""));
    if (!customizer) {
      return { ok: false, error: "Select a configured product first." };
    }
    try {
      await createTemplate(store.id, {
        name: String(formData.get("name") || "").trim() || customizer.name || "Untitled template",
        configuration: customizer.configuration || {},
      });
      return { ok: true, created: true };
    } catch (error) {
      logError("admin.templates.create", error);
      return { ok: false, error: "Unable to save that template." };
    }
  }

  if (intent === "delete") {
    const deleted = await deleteTemplate(store.id, String(formData.get("id") || ""));
    return deleted
      ? { ok: true, deleted: true }
      : { ok: false, error: "Unable to delete that template." };
  }

  return { ok: false };
};

function fieldValue(root, selector) {
  return root?.querySelector(selector)?.value || "";
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

export default function TemplatesPage() {
  const { templates, products } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const formRef = useRef(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const deleting =
    fetcher.state !== "idle" && fetcher.formData?.get("intent") === "delete";

  useEffect(() => {
    if (fetcher.data?.created) {
      shopify.toast.show("Template saved");
      formRef.current?.reset();
    } else if (fetcher.data?.deleted) {
      shopify.toast.show("Template deleted");
      setPendingDelete(null);
      document.getElementById("delete-template-modal")?.hideOverlay?.();
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const productOptions = useMemo(
    () =>
      [...products].sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return a.title.localeCompare(b.title);
      }),
    [products],
  );

  return (
    <s-page heading={templates.length ? `Templates (${templates.length})` : "Templates"}>
      <s-section heading="Save a product configuration as a template">
        <s-paragraph color="subdued">
          Capture a product’s customizer setup so you can reuse it later.
        </s-paragraph>
        {!productOptions.length ? (
          <s-paragraph>
            Enable a product under <s-link href="/app/products">Products</s-link> before saving a
            template.
          </s-paragraph>
        ) : (
          <fetcher.Form
            method="post"
            ref={formRef}
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const customizerId = fieldValue(form, "s-select");
              if (!customizerId) {
                shopify.toast.show("Select a product first.", { isError: true });
                return;
              }
              const data = new FormData();
              data.set("intent", "create");
              data.set("name", fieldValue(form, "s-text-field"));
              data.set("customizerId", customizerId);
              fetcher.submit(data, { method: "post" });
            }}
          >
            <s-stack gap="base">
              <s-text-field
                name="name"
                label="Template name"
                placeholder="Summer polo setup"
              />
              <s-select name="customizerId" label="Product">
                <s-option value="">Select a product</s-option>
                {productOptions.map((item) => (
                  <s-option key={item.id} value={item.id}>
                    {item.enabled ? item.title : `${item.title} (disabled)`}
                  </s-option>
                ))}
              </s-select>
              <s-stack direction="inline" gap="small">
                <s-button
                  type="submit"
                  {...(fetcher.state !== "idle" && fetcher.formData?.get("intent") === "create"
                    ? { loading: true }
                    : {})}
                >
                  Save template
                </s-button>
              </s-stack>
            </s-stack>
          </fetcher.Form>
        )}
      </s-section>

      <s-section heading="Saved templates" padding={templates.length ? "none" : "base"}>
        {templates.length ? (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Template</s-table-header>
              <s-table-header>Saved</s-table-header>
              <s-table-header listSlot="secondary">Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {templates.map((template) => (
                <s-table-row key={template.id}>
                  <s-table-cell>{template.name}</s-table-cell>
                  <s-table-cell>{formatDate(template.createdAt)}</s-table-cell>
                  <s-table-cell>
                    <s-button
                      type="button"
                      variant="secondary"
                      tone="critical"
                      commandFor="delete-template-modal"
                      command="--show"
                      onClick={() => setPendingDelete(template)}
                    >
                      Delete
                    </s-button>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        ) : (
          <s-stack gap="small" alignItems="center">
            <s-heading>No templates yet</s-heading>
            <s-paragraph>
              Save a product configuration above. Templates store print areas, tools, and pricing so
              you can reuse them.
            </s-paragraph>
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="About templates">
        <s-unordered-list>
          <s-list-item>Templates copy a product’s customizer settings, not a customer’s saved design.</s-list-item>
          <s-list-item>
            Customer designs appear on the <s-link href="/app/orders">Orders</s-link> page.
          </s-list-item>
        </s-unordered-list>
      </s-section>

      <s-modal id="delete-template-modal" heading="Delete template?" size="small">
        <s-text>
          Delete {pendingDelete?.name || "this template"}? This cannot be undone.
        </s-text>
        <s-button
          slot="secondary-actions"
          variant="secondary"
          commandFor="delete-template-modal"
          command="--hide"
        >
          Cancel
        </s-button>
        <s-button
          slot="primary-action"
          variant="primary"
          tone="critical"
          {...(deleting ? { loading: true } : {})}
          onClick={() => {
            if (!pendingDelete?.id) return;
            const data = new FormData();
            data.set("intent", "delete");
            data.set("id", pendingDelete.id);
            fetcher.submit(data, { method: "post" });
          }}
        >
          Delete template
        </s-button>
      </s-modal>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
