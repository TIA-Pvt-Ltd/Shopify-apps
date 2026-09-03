import { toGid, toNumericId, parseShopDomain } from "../utils/gid";
import { logError } from "../utils/logger.server";
import { normalizeShopifyProduct } from "../utils/shopify-ajax-product";
import { richerCatalogProduct } from "../utils/catalog-product";

const PRODUCTS_QUERY = `#graphql
  query CustomizerProducts(
    $first: Int
    $last: Int
    $after: String
    $before: String
    $query: String
    $sortKey: ProductSortKeys
  ) {
    productsCount(query: $query) {
      count
    }
    products(
      first: $first
      last: $last
      after: $after
      before: $before
      query: $query
      sortKey: $sortKey
    ) {
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      nodes {
        id
        title
        handle
        status
        featuredMedia {
          preview {
            image {
              url
              altText
            }
          }
        }
        variantsCount {
          count
        }
      }
    }
  }
`;

const PRODUCTS_QUERY_SIMPLE = `#graphql
  query CustomizerProductsSimple(
    $first: Int
    $last: Int
    $after: String
    $before: String
    $query: String
    $sortKey: ProductSortKeys
  ) {
    products(
      first: $first
      last: $last
      after: $after
      before: $before
      query: $query
      sortKey: $sortKey
    ) {
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      nodes {
        id
        title
        handle
        status
        featuredMedia {
          preview {
            image {
              url
              altText
            }
          }
        }
        variantsCount {
          count
        }
      }
    }
  }
`;

const PRODUCTS_BY_IDS_QUERY = `#graphql
  query CustomizerProductsByIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        handle
        featuredMedia {
          preview {
            image {
              url
              altText
            }
          }
        }
      }
    }
  }
`;

const VARIANT_FIELDS = `
  id
  title
  availableForSale
  price
  selectedOptions {
    name
    value
  }
  image {
    url
    altText
  }
  media(first: 1) {
    nodes {
      preview {
        image {
          url
        }
      }
    }
  }
`;

const PRODUCT_QUERY = `#graphql
  query CustomizerProduct($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      description
      hasOnlyDefaultVariant
      featuredMedia {
        preview {
          image {
            url
            altText
          }
        }
      }
      options {
        name
        values
        optionValues {
          name
          swatch {
            color
          }
        }
      }
      variants(first: 250) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          ${VARIANT_FIELDS}
        }
      }
      combinedListing {
        combinedListingChildren(first: 50) {
          nodes {
            parentVariant {
              ${VARIANT_FIELDS}
            }
            product {
              id
              title
              handle
              featuredMedia {
                preview {
                  image {
                    url
                  }
                }
              }
              options {
                name
                optionValues {
                  name
                  swatch {
                    color
                  }
                }
              }
              variants(first: 250) {
                nodes {
                  ${VARIANT_FIELDS}
                }
              }
            }
          }
        }
      }
    }
  }
`;

const PRODUCT_QUERY_SIMPLE = `#graphql
  query CustomizerProductSimple($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      description
      featuredMedia {
        preview {
          image {
            url
            altText
          }
        }
      }
      options {
        name
        optionValues {
          name
        }
      }
      variants(first: 250) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          title
          availableForSale
          price
          selectedOptions {
            name
            value
          }
          image {
            url
          }
        }
      }
    }
  }
`;

const VARIANTS_PAGE_QUERY = `#graphql
  query CustomizerProductVariants($id: ID!, $after: String) {
    product(id: $id) {
      variants(first: 250, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          ${VARIANT_FIELDS}
        }
      }
    }
  }
`;

const ORDERS_QUERY = `#graphql
  query CustomizerOrders($first: Int!) {
    orders(first: $first, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        name
        createdAt
        displayFinancialStatus
        displayFulfillmentStatus
        lineItems(first: 50) {
          nodes {
            title
            quantity
            customAttributes {
              key
              value
            }
          }
        }
      }
    }
  }
`;

export function buildProductsSearchQuery(q = "", status = "all") {
  const filters = [];
  if (status && status !== "all") {
    filters.push(`status:${status}`);
  }
  const term = String(q || "")
    .trim()
    .replace(/[*"\\()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (term) {
    filters.push(term);
  }
  return filters.join(" AND ") || null;
}

function mapProductNodes(products) {
  return (products?.nodes || []).map((product) => ({
    id: product.id,
    numericId: toNumericId(product.id),
    title: product.title,
    handle: product.handle,
    status: product.status,
    imageUrl: product.featuredMedia?.preview?.image?.url || "",
    imageAlt: product.featuredMedia?.preview?.image?.altText || product.title,
    variantCount: product.variantsCount?.count || 0,
  }));
}

export async function fetchShopifyProducts(
  admin,
  { query = "", status = "all", after = null, before = null, first = 50 } = {},
) {
  const searchQuery = buildProductsSearchQuery(query, status);
  const sortKey = query?.trim() ? "RELEVANCE" : "TITLE";
  const variables = {
    query: searchQuery,
    sortKey,
  };
  if (before) {
    variables.last = first;
    variables.before = before;
  } else {
    variables.first = first;
    if (after) variables.after = after;
  }

  let json = await adminGraphql(admin, PRODUCTS_QUERY, variables);
  if (json.errors && !json.data?.products) {
    logError("products.query", json.errors[0]);
    json = await adminGraphql(admin, PRODUCTS_QUERY_SIMPLE, variables);
  } else if (json.errors) {
    logError("products.query.partial", json.errors[0]);
  }
  if (json.errors && !json.data?.products) {
    throw new Error("Unable to load products from Shopify.");
  }

  const products = json.data?.products;
  return {
    count: json.data?.productsCount?.count ?? null,
    pageInfo: products?.pageInfo || {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: null,
    },
    nodes: mapProductNodes(products),
  };
}

async function adminGraphql(admin, query, variables) {
  const response = await admin.graphql(query, { variables });
  if (typeof response?.json === "function") return response.json();
  return response;
}

function mapVariantNode(variant, product) {
  return {
    id: variant.id,
    title: variant.title,
    availableForSale: variant.availableForSale,
    price: variant.price,
    selectedOptions: variant.selectedOptions || [],
    imageUrl:
      variant.image?.url ||
      variant.media?.nodes?.[0]?.preview?.image?.url ||
      "",
  };
}

function mapAdminProduct(product, variantNodes = product?.variants?.nodes) {
  if (!product) return null;
  return normalizeShopifyProduct({
    id: product.id,
    title: product.title,
    handle: product.handle,
    status: product.status,
    description: product.description,
    imageUrl: product.featuredMedia?.preview?.image?.url || "",
    imageAlt: product.featuredMedia?.preview?.image?.altText || product.title,
    options: product.options || [],
    variants: (variantNodes || []).map((variant) => mapVariantNode(variant, product)),
  });
}

function flattenCombinedListing(product) {
  const children = product?.combinedListing?.combinedListingChildren?.nodes || [];
  if (!children.length) return null;

  const variants = [];
  const optionMap = new Map();

  const addOption = (name, value, swatch) => {
    if (!name || !value) return;
    if (!optionMap.has(name)) optionMap.set(name, { name, values: [], swatches: {} });
    const option = optionMap.get(name);
    if (!option.values.includes(value)) option.values.push(value);
    if (swatch?.hex || swatch?.imageUrl) option.swatches[value] = swatch;
  };

  for (const child of children) {
    const childProduct = mapAdminProduct(child.product);
    const parentOptions = child.parentVariant?.selectedOptions || [];
    for (const option of parentOptions) addOption(option.name, option.value);
    for (const option of childProduct?.options || []) {
      for (const value of option.values || []) {
        addOption(option.name, value, option.swatches?.[value]);
      }
    }

    const childVariants = childProduct?.variants?.length
      ? childProduct.variants
      : [mapVariantNode(child.parentVariant, child.product)].filter((item) => item.id);

    for (const variant of childVariants) {
      const selectedOptions = [
        ...parentOptions.filter(
          (option) =>
            !(variant.selectedOptions || []).some(
              (item) => item.name?.toLowerCase() === option.name?.toLowerCase(),
            ),
        ),
        ...(variant.selectedOptions || []),
      ];
      variants.push({
        ...variant,
        id: variant.id || child.parentVariant?.id,
        imageUrl:
          variant.imageUrl ||
          childProduct?.imageUrl ||
          child.parentVariant?.image?.url ||
          "",
        selectedOptions,
        title:
          selectedOptions.map((option) => option.value).filter(Boolean).join(" / ") ||
          variant.title,
      });
    }
  }

  if (!variants.length) return null;
  return normalizeShopifyProduct({
    id: product.id,
    title: product.title,
    handle: product.handle,
    status: product.status,
    description: product.description,
    imageUrl: product.featuredMedia?.preview?.image?.url || variants[0]?.imageUrl || "",
    imageAlt: product.title,
    options: [...optionMap.values()],
    variants,
  });
}

async function fetchAllVariantNodes(admin, productId, firstPage) {
  let nodes = [...(firstPage?.nodes || [])];
  let pageInfo = firstPage?.pageInfo;
  while (pageInfo?.hasNextPage && pageInfo.endCursor) {
    const json = await adminGraphql(admin, VARIANTS_PAGE_QUERY, {
      id: productId,
      after: pageInfo.endCursor,
    });
    const connection = json.data?.product?.variants;
    nodes = nodes.concat(connection?.nodes || []);
    pageInfo = connection?.pageInfo;
  }
  return nodes;
}

export async function fetchAjaxProduct(shop, handle) {
  const domain = parseShopDomain(shop);
  if (!domain || !handle) return null;
  try {
    const response = await fetch(
      `https://${domain}/products/${encodeURIComponent(handle)}.js`,
      { headers: { Accept: "application/json" } },
    );
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || (!contentType.includes("json") && !contentType.includes("javascript"))) {
      return null;
    }
    return normalizeShopifyProduct(await response.json());
  } catch (error) {
    logError("product.ajax", error);
    return null;
  }
}

export async function fetchShopifyProductsByIds(admin, productIds) {
  const ids = [...new Set((productIds || []).map((id) => toGid(id)).filter(Boolean))];
  if (!ids.length) return {};
  try {
    const json = await adminGraphql(admin, PRODUCTS_BY_IDS_QUERY, { ids });
    if (json.errors) logError("products.byIds", json.errors[0]);
    return Object.fromEntries(
      (json.data?.nodes || [])
        .filter((product) => product?.id)
        .map((product) => [
          product.id,
          {
            id: product.id,
            numericId: toNumericId(product.id),
            title: product.title,
            handle: product.handle,
            imageUrl: product.featuredMedia?.preview?.image?.url || "",
            imageAlt: product.featuredMedia?.preview?.image?.altText || product.title,
          },
        ]),
    );
  } catch (error) {
    logError("products.byIds", error);
    return {};
  }
}

export async function fetchShopifyProduct(admin, productId) {
  const id = toGid(productId);
  let json = await adminGraphql(admin, PRODUCT_QUERY, { id });
  if (json.errors && !json.data?.product) {
    logError("product.query", json.errors[0]);
    json = await adminGraphql(admin, PRODUCT_QUERY_SIMPLE, { id });
  } else if (json.errors) {
    logError("product.query.partial", json.errors[0]);
  }
  if (json.errors && !json.data?.product) {
    throw new Error("Unable to load product from Shopify.");
  }
  const product = json.data?.product;
  if (!product) return null;

  const variantNodes = await fetchAllVariantNodes(admin, id, product.variants);
  const mapped = mapAdminProduct(product, variantNodes);
  const combined = flattenCombinedListing(product);
  return richerCatalogProduct(combined, mapped) || mapped;
}

export async function fetchProductForCustomizer(admin, { shop, productId, handle } = {}) {
  const adminPromise =
    admin && productId
      ? fetchShopifyProduct(admin, productId).catch((error) => {
          logError("product.admin", error);
          return null;
        })
      : Promise.resolve(null);
  const ajaxPromise = handle ? fetchAjaxProduct(shop, handle) : Promise.resolve(null);
  const [adminProduct, ajaxFromHandle] = await Promise.all([adminPromise, ajaxPromise]);
  const ajaxProduct =
    ajaxFromHandle ||
    (!handle && adminProduct?.handle ? await fetchAjaxProduct(shop, adminProduct.handle) : null);
  return richerCatalogProduct(ajaxProduct, adminProduct) || adminProduct || ajaxProduct;
}

export async function fetchCustomizerOrders(admin, first = 40) {
  try {
    const json = await adminGraphql(admin, ORDERS_QUERY, { first });
    if (json.errors && !json.data?.orders) {
      logError("orders.query", json.errors[0]);
      return [];
    }
    const orders = json.data?.orders?.nodes || [];
    return orders
      .map((order) => {
        const customizedItems = (order.lineItems?.nodes || []).filter((item) =>
          (item.customAttributes || []).some(
            (attribute) =>
              attribute.key === "_customizationId" ||
              attribute.key === "Customization ID",
          ),
        );
        return {
          id: order.id,
          name: order.name,
          createdAt: order.createdAt,
          financialStatus: order.displayFinancialStatus,
          fulfillmentStatus: order.displayFulfillmentStatus,
          customerName: "Customer",
          items: customizedItems.map((item) => {
            const attributes = Object.fromEntries(
              (item.customAttributes || []).map((attribute) => [
                attribute.key,
                attribute.value,
              ]),
            );
            return {
              title: item.title,
              quantity: item.quantity,
              variantTitle: "",
              customizationId:
                attributes._customizationId || attributes["Customization ID"],
              previewUrl: attributes._previewUrl || attributes.Preview,
              color: attributes.Color,
            };
          }),
        };
      })
      .filter((order) => order.items.length > 0);
  } catch (error) {
    logError("orders.query", error);
    return [];
  }
}
