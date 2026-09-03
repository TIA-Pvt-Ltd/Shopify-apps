import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  fetchCustomizerOrders,
  fetchShopifyProductsByIds,
} from "../services/shopify-products.server";
import { getStoreByShop } from "../services/store.server";
import {
  deleteCustomization,
  listRecentCustomizations,
} from "../services/customization.server";
import { getAppUrl } from "../services/storefront-api.server";
import { logError } from "../utils/logger.server";
import { toGid, toNumericId } from "../utils/gid";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const store = await getStoreByShop(session.shop);
  const customizations = store
    ? await listRecentCustomizations(store.id, getAppUrl(request), 100)
    : [];
  const shopifyProducts = await fetchShopifyProductsByIds(
    admin,
    customizations.map((item) => item.shopifyProductId),
  );
  const enriched = customizations.map((item) => {
    const product = shopifyProducts[toGid(item.shopifyProductId)] || null;
    return {
      ...item,
      title: product?.title || "Customized product",
      numericId: product?.numericId || toNumericId(item.shopifyProductId),
    };
  });
  const previews = Object.fromEntries(
    enriched.map((item) => [item.publicId, item.previewUrl]).filter((entry) => entry[1]),
  );
  let orders = [];
  try {
    orders = await fetchCustomizerOrders(admin);
  } catch (error) {
    logError("admin.orders", error);
  }
  orders = orders.map((order) => ({
    ...order,
    items: order.items.map((item) => ({
      ...item,
      previewUrl: previews[item.customizationId] || item.previewUrl || "",
    })),
  }));
  return { orders, customizations: enriched };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const store = await getStoreByShop(session.shop);
  if (!store) return { ok: false, error: "Store not found." };
  const formData = await request.formData();
  if (formData.get("intent") === "delete") {
    const deleted = await deleteCustomization(store.id, String(formData.get("id") || ""));
    return deleted
      ? { ok: true, deleted: true }
      : { ok: false, error: "Unable to delete that design." };
  }
  return { ok: false };
};

function formatDateTime(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

function formatStatus(value) {
  if (!value) return "";
  return String(value)
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(value) {
  const status = String(value || "").toLowerCase();
  if (status === "paid" || status === "fulfilled") return "success";
  if (status.includes("refund") || status === "voided" || status === "unfulfilled") return "caution";
  if (status === "pending" || status === "authorized") return "caution";
  return "neutral";
}

function matchesQuery(query, ...values) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => String(value || "").toLowerCase().includes(needle));
}

export default function OrdersPage() {
  const { orders, customizations } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const deleteModalRef = useRef(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const [pendingDelete, setPendingDelete] = useState(null);
  const deleting =
    fetcher.state !== "idle" && fetcher.formData?.get("intent") === "delete";

  const closeDeleteModal = () => {
    deleteModalRef.current?.hideOverlay?.();
    setPendingDelete(null);
  };

  useEffect(() => {
    if (fetcher.data?.deleted) {
      shopify.toast.show("Design deleted");
      closeDeleteModal();
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);
  const orderIds = useMemo(
    () => new Set((orders || []).flatMap((order) => order.items.map((item) => item.customizationId))),
    [orders],
  );
  const saved = useMemo(
    () => (customizations || []).filter((item) => !orderIds.has(item.publicId)),
    [customizations, orderIds],
  );
  const orderRows = useMemo(
    () =>
      (orders || []).flatMap((order) =>
        order.items.map((item) => ({
          ...item,
          orderName: order.name,
          orderId: order.id,
          createdAt: order.createdAt,
          financialStatus: order.financialStatus,
        })),
      ),
    [orders],
  );
  const filteredOrders = orderRows.filter((item) =>
    matchesQuery(query, item.orderName, item.customizationId, item.title),
  );
  const filteredSaved = saved.filter((item) =>
    matchesQuery(query, item.publicId, item.title),
  );
  const showOrders = tab === "all" || tab === "orders";
  const showSaved = tab === "all" || tab === "saved";

  return (
    <s-page heading="Orders" inlineSize="large">
      <s-section heading="Overview" padding="base">
        <s-grid
          gridTemplateColumns="@container (inline-size <= 640px) 1fr, 1fr auto 1fr"
          gap="small"
          alignItems="center"
        >
          <s-clickable padding="base" borderRadius="base" onClick={() => setTab("orders")}>
            <s-stack gap="small-200">
              <s-text color="subdued">Shopify orders</s-text>
              <span className="admin-metric-value">{orderRows.length}</span>
              <s-text color="subdued">Checked-out customizations</s-text>
            </s-stack>
          </s-clickable>
          <s-divider direction="block" />
          <s-clickable padding="base" borderRadius="base" onClick={() => setTab("saved")}>
            <s-stack gap="small-200">
              <s-text color="subdued">Saved designs</s-text>
              <span className="admin-metric-value">{saved.length}</span>
              <s-text color="subdued">In cart or saved, not yet ordered</s-text>
            </s-stack>
          </s-clickable>
        </s-grid>
      </s-section>

      <s-section padding="base">
        <s-stack gap="small">
          <s-search-field
            label="Search customizations"
            labelAccessibilityVisibility="exclusive"
            placeholder="Search by order, ID, or product"
            onInput={(event) => setQuery(event.currentTarget.value || "")}
            onChange={(event) => setQuery(event.currentTarget.value || "")}
          />
          <s-stack direction="inline" gap="small-200">
            {[
              { id: "all", label: "All" },
              { id: "orders", label: `Orders (${orderRows.length})` },
              { id: "saved", label: `Saved (${saved.length})` },
            ].map((item) => (
              <s-button
                key={item.id}
                variant={tab === item.id ? "primary" : "secondary"}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </s-button>
            ))}
          </s-stack>
        </s-stack>
      </s-section>

      {showOrders ? (
        <s-section padding="none">
          <s-box padding="base">
            <s-stack gap="small-200">
              <s-heading>Customized orders</s-heading>
              <s-text color="subdued">
                {filteredOrders.length
                  ? `${filteredOrders.length} checked-out ${filteredOrders.length === 1 ? "item" : "items"} with a customization ID`
                  : "Paid Shopify orders with a customization ID appear here after checkout."}
              </s-text>
            </s-stack>
          </s-box>
          {filteredOrders.length ? <s-divider /> : null}
          {filteredOrders.length ? (
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="primary">Order</s-table-header>
                <s-table-header>Product</s-table-header>
                <s-table-header>Status</s-table-header>
                <s-table-header>Date</s-table-header>
                <s-table-header listSlot="secondary">Preview</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {filteredOrders.map((item) => (
                  <s-table-row key={`${item.orderId}-${item.customizationId}`}>
                    <s-table-cell>
                      <s-stack gap="none">
                        <s-link href={`shopify://admin/orders/${toNumericId(item.orderId)}`}>
                          {item.orderName}
                        </s-link>
                        <span className="admin-muted">{item.customizationId}</span>
                      </s-stack>
                    </s-table-cell>
                    <s-table-cell>{item.title}</s-table-cell>
                    <s-table-cell>
                      {item.financialStatus ? (
                        <s-badge tone={statusTone(item.financialStatus)}>
                          {formatStatus(item.financialStatus)}
                        </s-badge>
                      ) : (
                        "—"
                      )}
                    </s-table-cell>
                    <s-table-cell>{formatDateTime(item.createdAt)}</s-table-cell>
                    <s-table-cell>
                      {item.previewUrl ? (
                        <a
                          className="orders-preview-link"
                          href={item.previewUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <s-thumbnail src={item.previewUrl} alt="" size="small" />
                          <span>Open</span>
                        </a>
                      ) : (
                        <span className="admin-muted">No preview</span>
                      )}
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          ) : orderRows.length ? (
            <s-box padding="base" paddingBlockStart="none">
              <s-paragraph>No orders match that search.</s-paragraph>
            </s-box>
          ) : null}
        </s-section>
      ) : null}

      {showSaved ? (
        <s-section padding="none">
          <s-box padding="base">
            <s-stack gap="base">
              <s-stack gap="small-200">
                <s-heading>Saved designs</s-heading>
                <s-text color="subdued">
                  {filteredSaved.length
                    ? `${filteredSaved.length} ${filteredSaved.length === 1 ? "design" : "designs"} saved from the customizer`
                    : "Designs saved from the customizer, including items added to cart, appear here."}
                </s-text>
              </s-stack>
              {filteredSaved.length ? (
                <div className="orders-grid">
                {filteredSaved.map((item) => (
                  <s-box
                    key={item.id}
                    padding="small"
                    border="base"
                    borderRadius="base"
                    background="base"
                  >
                    <s-stack gap="small">
                      {item.previewUrl ? (
                        <a
                          className="orders-thumb orders-thumb-lg"
                          href={item.previewUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <img src={item.previewUrl} alt={`Preview ${item.publicId}`} />
                        </a>
                      ) : (
                        <div className="orders-thumb orders-thumb-lg is-empty" aria-hidden="true" />
                      )}
                      <s-stack gap="small-200">
                        <s-text>{item.publicId}</s-text>
                        {item.numericId ? (
                          <s-link href={`/app/products/${item.numericId}`}>{item.title}</s-link>
                        ) : (
                          <s-text color="subdued">{item.title}</s-text>
                        )}
                        <s-text color="subdued">
                          Qty {item.quantity} · {formatDateTime(item.createdAt)}
                        </s-text>
                      </s-stack>
                      <s-stack direction="inline" gap="small" alignItems="center">
                        {item.previewUrl ? (
                          <a
                            className="orders-preview-link"
                            href={item.previewUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open preview
                          </a>
                        ) : (
                          <s-text color="subdued">No preview</s-text>
                        )}
                        <s-button
                          type="button"
                          variant="secondary"
                          tone="critical"
                          commandFor="delete-design-modal"
                          command="--show"
                          onClick={() => setPendingDelete(item)}
                        >
                          Delete
                        </s-button>
                      </s-stack>
                    </s-stack>
                  </s-box>
                ))}
                </div>
              ) : saved.length ? (
                <s-paragraph>No saved designs match that search.</s-paragraph>
              ) : null}
            </s-stack>
          </s-box>
        </s-section>
      ) : null}

      <s-section slot="aside" heading="About this page">
        <s-unordered-list>
          <s-list-item>
            Shopify orders appear after checkout when a line item has a customization ID.
          </s-list-item>
          <s-list-item>
            Saved designs are customizer saves and cart items that have not been ordered yet.
          </s-list-item>
          <s-list-item>Open a preview to inspect the customer artwork at full size.</s-list-item>
          <s-list-item>
            Delete a saved design to remove it from this list. Designs already on a Shopify order stay
            with that order.
          </s-list-item>
        </s-unordered-list>
      </s-section>

      <s-modal
        ref={deleteModalRef}
        id="delete-design-modal"
        heading="Delete saved design?"
        size="small"
        onHide={() => {
          if (!deleting) setPendingDelete(null);
        }}
      >
        <s-stack gap="base">
          {pendingDelete?.previewUrl ? (
            <div className="orders-thumb orders-delete-preview">
              <img src={pendingDelete.previewUrl} alt="" />
            </div>
          ) : null}
          <s-stack gap="small-200">
            <s-text>
              Delete {pendingDelete?.publicId || "this saved design"}
              {pendingDelete?.title ? ` (${pendingDelete.title})` : ""}?
            </s-text>
            <s-text color="subdued">This cannot be undone.</s-text>
          </s-stack>
        </s-stack>
        <s-button
          slot="secondary-actions"
          variant="secondary"
          commandFor="delete-design-modal"
          command="--hide"
          disabled={deleting || undefined}
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
          Delete design
        </s-button>
      </s-modal>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
