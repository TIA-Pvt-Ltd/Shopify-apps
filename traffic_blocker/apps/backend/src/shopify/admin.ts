import { getConfig, type AppConfig } from "../config.js";

export interface GraphqlResult<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export async function shopifyGraphql<T>(
  shop: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown>,
  config: AppConfig = getConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const response = await fetchImpl(`https://${shop}/admin/api/${config.shopifyApiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-access-token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`Shopify Admin API returned ${response.status}`);
  const body = (await response.json()) as GraphqlResult<T>;
  if (body.errors?.length) throw new Error(body.errors.map((error) => error.message).join("; "));
  if (!body.data) throw new Error("Shopify Admin API returned an empty payload");
  return body.data;
}

export async function exchangeSessionToken(shop: string, sessionToken: string, config: AppConfig, fetchImpl: typeof fetch = fetch): Promise<{ access_token: string; scope: string }> {
  const response = await fetchImpl(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: config.shopifyApiKey,
      client_secret: config.shopifyApiSecret,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: sessionToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
    }),
  });
  if (!response.ok) throw new Error(`Shopify session token exchange failed (${response.status})`);
  const body = (await response.json()) as { access_token?: string; scope?: string };
  if (!body.access_token) throw new Error("Shopify session token exchange returned no access token");
  return { access_token: body.access_token, scope: body.scope ?? "" };
}

export async function exchangeOfflineToken(shop: string, code: string, config: AppConfig, fetchImpl: typeof fetch = fetch): Promise<{ access_token: string; scope: string }> {
  const response = await fetchImpl(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: config.shopifyApiKey,
      client_secret: config.shopifyApiSecret,
      code,
    }),
  });
  if (!response.ok) throw new Error("Shopify token exchange failed");
  return (await response.json()) as { access_token: string; scope: string };
}

const WEBHOOK_MUTATION = `
  mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $callbackUrl: URL!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: { callbackUrl: $callbackUrl, format: JSON }) {
      userErrors { field message }
      webhookSubscription { id }
    }
  }
`;

export async function registerWebhooks(shop: string, accessToken: string, config: AppConfig): Promise<void> {
  const callbackUrl = `${config.appUrl}/api/webhooks/shopify`;
  const topics = ["APP_UNINSTALLED", "APP_SUBSCRIPTIONS_UPDATE", "CUSTOMERS_DATA_REQUEST", "CUSTOMERS_REDACT", "SHOP_REDACT"];
  for (const topic of topics) {
    const data = await shopifyGraphql<{
      webhookSubscriptionCreate: { userErrors: Array<{ message: string }> };
    }>(shop, accessToken, WEBHOOK_MUTATION, { topic, callbackUrl }, config);
    const errors = data.webhookSubscriptionCreate.userErrors.filter((error) => !/already been taken/i.test(error.message));
    if (errors.length > 0) throw new Error(errors.map((error) => error.message).join("; "));
  }
}

const PIXEL_MUTATION = `
  mutation webPixelCreate($settings: JSON!) {
    webPixelCreate(webPixel: { settings: $settings }) {
      userErrors { field message }
      webPixel { id }
    }
  }
`;

export async function activateWebPixel(shop: string, accessToken: string, config: AppConfig): Promise<void> {
  const settings = JSON.stringify({ endpoint: config.appUrl });
  const data = await shopifyGraphql<{
    webPixelCreate: { userErrors: Array<{ message: string }> };
  }>(shop, accessToken, PIXEL_MUTATION, { settings }, config);
  const errors = data.webPixelCreate.userErrors.filter((error) => !/already/i.test(error.message));
  if (errors.length > 0) throw new Error(errors.map((error) => error.message).join("; "));
}

export const SUBSCRIPTION_MUTATION = `
  mutation appSubscriptionCreate($name: String!, $returnUrl: URL!, $trialDays: Int, $test: Boolean, $lineItems: [AppSubscriptionLineItemInput!]!) {
    appSubscriptionCreate(name: $name, returnUrl: $returnUrl, trialDays: $trialDays, test: $test, lineItems: $lineItems) {
      userErrors { field message }
      confirmationUrl
      appSubscription { id status }
    }
  }
`;

export const CANCEL_MUTATION = `
  mutation appSubscriptionCancel($id: ID!) {
    appSubscriptionCancel(id: $id) {
      userErrors { field message }
      appSubscription { id status }
    }
  }
`;
