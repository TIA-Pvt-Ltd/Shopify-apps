export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

interface ShopifyGlobal {
  idToken?: () => Promise<string>;
}

async function sessionToken(): Promise<string | null> {
  const shopify = (window as Window & { shopify?: ShopifyGlobal }).shopify;
  if (!shopify?.idToken) return null;
  try {
    return await shopify.idToken();
  } catch {
    return null;
  }
}

export async function api<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const token = await sessionToken();
  if (token) headers.set("authorization", `Bearer ${token}`);
  else if (import.meta.env.DEV) headers.set("x-dev-shop", import.meta.env.VITE_DEV_SHOP ?? "dev-shop.myshopify.com");
  const response = await fetch(path, { ...init, headers });
  if (response.status === 401 && attempt < 1 && token) {
    const refreshed = await sessionToken();
    if (refreshed && refreshed !== token) return api(path, init, attempt + 1);
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
