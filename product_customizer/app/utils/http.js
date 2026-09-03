export function storefrontCorsHeaders(request) {
  const origin = request.headers.get("Origin");
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", origin || "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With",
  );
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Vary", "Origin");
  return headers;
}

export function jsonWithCors(request, data, init = {}) {
  const headers = storefrontCorsHeaders(request);
  if (init.headers) {
    const extra = new Headers(init.headers);
    extra.forEach((value, key) => headers.set(key, value));
  }
  return Response.json(data, { ...init, headers });
}

export function optionsResponse(request) {
  return new Response(null, {
    status: 204,
    headers: storefrontCorsHeaders(request),
  });
}

export function apiError(message, status = 400, request, cors = false) {
  const body = { ok: false, error: message };
  if (cors && request) {
    return jsonWithCors(request, body, { status });
  }
  return Response.json(body, { status });
}

export function apiOk(data, init = {}, request, cors = false) {
  const body = { ok: true, ...data };
  if (cors && request) {
    return jsonWithCors(request, body, init);
  }
  return Response.json(body, init);
}
