export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

interface ShopifyGlobal {
  idToken?: () => Promise<string>;
}

/**
 * Refresh before the JWT is near expiry. Keep this modest: with a fast host
 * clock, App Bridge's "fresh" tokens already look shorter-lived than 60s.
 */
const TOKEN_REFRESH_SKEW_MS = 8_000;
const MAX_AUTH_RETRIES = 3;

function shopifyApi(): ShopifyGlobal | undefined {
  return (window as Window & { shopify?: ShopifyGlobal }).shopify;
}

function tokenExpiryMs(token: string): number | null {
  const body = token.split(".")[1];
  if (!body) return null;
  try {
    const json = body.replace(/-/g, "+").replace(/_/g, "/");
    const padded = json + "=".repeat((4 - (json.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function tokenIsUsable(token: string): boolean {
  const exp = tokenExpiryMs(token);
  if (exp == null) return true;
  return exp - Date.now() > TOKEN_REFRESH_SKEW_MS;
}

async function sessionToken(): Promise<string | null> {
  const shopify = shopifyApi();
  if (!shopify?.idToken) return null;
  try {
    return await shopify.idToken();
  } catch {
    return null;
  }
}

/** Prefer a token with enough life left; App Bridge can briefly return a near-expired JWT. */
async function freshSessionToken(): Promise<string | null> {
  let token = await sessionToken();
  if (!token) return null;
  if (tokenIsUsable(token)) return token;
  for (const waitMs of [100, 250, 500, 1000]) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    const next = await sessionToken();
    if (!next) continue;
    token = next;
    if (tokenIsUsable(token)) return token;
  }
  return token;
}

/**
 * Authenticated fetch for the admin UI.
 *
 * Always send a Bearer ID token when App Bridge is available (required when the
 * tunnel host differs from the Partner app URL, so App Bridge's fetch interceptor
 * may not attach one). On 401, always retry with a newly requested token — do not
 * require the JWT string to change, which previously blocked the first click on
 * Remove / Save while later clicks succeeded.
 */
export async function api<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");

  const token = await freshSessionToken();
  if (token) headers.set("authorization", `Bearer ${token}`);
  else if (import.meta.env.DEV) headers.set("x-dev-shop", import.meta.env.VITE_DEV_SHOP ?? "dev-shop.myshopify.com");

  const response = await fetch(path, { ...init, headers });
  if (response.status === 401 && attempt < MAX_AUTH_RETRIES && shopifyApi()?.idToken) {
    // Give App Bridge time to mint a replacement after X-Shopify-Retry-Invalid-Session-Request.
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    return api(path, init, attempt + 1);
  }
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("text/csv")) {
    if (!response.ok) throw new ApiError("Export failed", response.status);
    return (await response.text()) as T;
  }
  const body = (await response.json()) as { ok: boolean; data: T; error?: { message: string } };
  if (!response.ok || body.ok === false) throw new ApiError(body.error?.message ?? "Request failed", response.status);
  return body.data;
}

export function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
