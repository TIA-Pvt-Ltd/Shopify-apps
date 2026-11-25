import { useEffect, useRef } from "react";
import { Form, Link, useFetcher, useLoaderData, useNavigate, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getOrCreateStore } from "../services/store.server";
import { getCustomizerMap, setCustomizerEnabled } from "../services/product.server";
import { fetchShopifyProducts, setCustomizerEnabledMetafield } from "../services/shopify-products.server";
import { logError, USER_ERRORS } from "../utils/logger.server";

const PAGE_SIZE = 50;
const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "draft", label: "Draft" },
  { id: "archived", label: "Archived" },
];

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "";
  const status = url.searchParams.get("status") || "all";
  const after = url.searchParams.get("after") || "";
  const before = url.searchParams.get("before") || "";
  const store = await getOrCreateStore(session.shop);

  try {
    const [products, customizerMap] = await Promise.all([
      fetchShopifyProducts(admin, {
        query,
        status,
        after: after || null,
        before: before || null,
        first: PAGE_SIZE,
      }),
      getCustomizerMap(store.id),
    ]);
    return {
      products: products.nodes,
      pageInfo: products.pageInfo,
      count: products.count,
      query,
      status,
      customizerMap,
    };
  } catch (error) {
    logError("admin.products", error);
    return {
      products: [],
      pageInfo: { hasNextPage: false, hasPreviousPage: false },
      count: 0,
      query,
      status,
      customizerMap: {},
      error: USER_ERRORS.configLoad,
    };
  }
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const formData = await request.formData();
  const productId = String(formData.get("productId") || "");
  const intent = String(formData.get("intent") || "");
  const enabled = intent === "enable";
  await setCustomizerEnabled(store.id, productId, enabled);
  await setCustomizerEnabledMetafield(admin, productId, enabled);
  return { ok: true, enabled };
};

function statusTone(status) {
  if (status === "ACTIVE") return "success";
  if (status === "DRAFT") return "info";
  if (status === "ARCHIVED") return "neutral";
  return "auto";
}

function statusLabel(status) {
  if (!status) return "Unknown";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function productsHref({ query, status, after, before }) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (status && status !== "all") params.set("status", status);
  if (after) params.set("after", after);
  if (before) params.set("before", before);
  const search = params.toString();
  return search ? `/app/products?${search}` : "/app/products";
}

export default function ProductsPage() {
  const { products, pageInfo, count, query, status, customizerMap, error } = useLoaderData();
  const fetcher = useFetcher();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const loading = navigation.state === "loading";
  const tableRef = useRef(null);

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show(fetcher.data.enabled ? "Customizer enabled" : "Customizer disabled");
    }
  }, [fetcher.data, shopify]);

  useEffect(() => {
    const table = tableRef.current;
    if (!table) return undefined;
    table.paginate = Boolean(pageInfo?.hasNextPage || pageInfo?.hasPreviousPage);
    table.hasNextPage = Boolean(pageInfo?.hasNextPage);
    table.hasPreviousPage = Boolean(pageInfo?.hasPreviousPage);
    table.loading = loading;
    function goNext() {
      if (!pageInfo?.endCursor) return;
      navigate(productsHref({ query, status, after: pageInfo.endCursor }));
    }
    function goPrev() {
      if (!pageInfo?.startCursor) return;
      navigate(productsHref({ query, status, before: pageInfo.startCursor }));
    }
    table.addEventListener("nextpage", goNext);
    table.addEventListener("previouspage", goPrev);
    return () => {
      table.removeEventListener("nextpage", goNext);
      table.removeEventListener("previouspage", goPrev);
    };
  }, [loading, navigate, pageInfo, query, status]);

  const heading = typeof count === "number" ? `Products (${count})` : "Products";

  return (
    <s-page heading={heading}>
      {error ? <s-banner tone="critical">{error}</s-banner> : null}

      <s-section padding="none">
        <s-table
          ref={tableRef}
          loading={loading || undefined}
          paginate={Boolean(pageInfo?.hasNextPage || pageInfo?.hasPreviousPage)}
          hasPreviousPage={Boolean(pageInfo?.hasPreviousPage)}
          hasNextPage={Boolean(pageInfo?.hasNextPage)}
        >
          <s-stack slot="filters" direction="inline" gap="small" alignItems="end">
            <Form
              method="get"
              onSubmit={(event) => {
                event.preventDefault();
                const field = event.currentTarget.querySelector("s-search-field");
                const value = field?.value || "";
                navigate(productsHref({ query: value, status }));
              }}
            >
              {status && status !== "all" ? (
                <input type="hidden" name="status" value={status} />
              ) : null}
              <s-stack direction="inline" gap="small" alignItems="end">
                <s-search-field
                  name="q"
                  label="Search products"
                  labelAccessibilityVisibility="exclusive"
                  placeholder="Search by name, handle, or SKU"
                  defaultValue={query}
                />
                <s-button type="submit">Search</s-button>
              </s-stack>
            </Form>
            <s-stack direction="inline" gap="small-200">
              {STATUS_FILTERS.map((filter) => (
                <s-button
                  key={filter.id}
                  href={productsHref({ query, status: filter.id })}
                  variant={status === filter.id ? "primary" : "secondary"}
                >
                  {filter.label}
                </s-button>
              ))}
            </s-stack>
          </s-stack>

          <s-table-header-row>
            <s-table-header listSlot="primary">Product</s-table-header>
            <s-table-header>Status</s-table-header>
            <s-table-header format="numeric">Variants</s-table-header>
            <s-table-header>Customizer</s-table-header>
            <s-table-header listSlot="secondary">Actions</s-table-header>
          </s-table-header-row>

          <s-table-body>
            {products.map((product) => {
              const customizer = customizerMap[product.id];
              const enabled = Boolean(customizer?.enabled);
              return (
                <s-table-row key={product.id}>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small" alignItems="center">
                      <s-thumbnail
                        src={product.imageUrl || undefined}
                        alt={product.imageAlt || product.title}
                        size="small"
                      />
                      <s-stack gap="none" className="admin-product-title">
                        <Link
                          to={`/app/products/${product.numericId}`}
                          className="admin-product-link"
                          data-app-to={`/app/products/${product.numericId}`}
                        >
                          {product.title}
                        </Link>
                        {product.handle ? (
                          <span className="admin-muted">{product.handle}</span>
                        ) : null}
                      </s-stack>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    <s-badge tone={statusTone(product.status)}>{statusLabel(product.status)}</s-badge>
                  </s-table-cell>
                  <s-table-cell>{product.variantCount}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={enabled ? "success" : "neutral"}>
                      {enabled ? "Enabled" : "Disabled"}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small-200">
                      <Link
                        to={`/app/products/${product.numericId}`}
                        className="admin-configure-btn"
                        data-app-to={`/app/products/${product.numericId}`}
                      >
                        Configure
                      </Link>
                      <fetcher.Form method="post">
                        <input type="hidden" name="productId" value={product.id} />
                        <input type="hidden" name="intent" value={enabled ? "disable" : "enable"} />
                        <s-button type="submit" variant={enabled ? "secondary" : "primary"}>
                          {enabled ? "Disable" : "Enable"}
                        </s-button>
                      </fetcher.Form>
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              );
            })}
          </s-table-body>
        </s-table>
      </s-section>

      {!loading && !products.length ? (
        <s-section>
          <s-stack gap="small" alignItems="center">
            <s-heading>No products found</s-heading>
            <s-paragraph>
              {query
                ? "Try a different search, or clear filters to see the full catalog."
                : "Create a product in Shopify admin, then return here to enable the customizer."}
            </s-paragraph>
            {query || status !== "all" ? (
              <s-button href="/app/products" variant="secondary">
                View all products
              </s-button>
            ) : null}
          </s-stack>
        </s-section>
      ) : null}
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
