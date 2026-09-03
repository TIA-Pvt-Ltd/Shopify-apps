var __defProp = Object.defineProperty;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);
var _a, _LocalStorageProvider_instances, safeKey_fn;
import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { redirect, ServerRouter, UNSAFE_withComponentProps, Meta, Links, Outlet, ScrollRestoration, Scripts, useLoaderData, useNavigate, useActionData, Form, UNSAFE_withErrorBoundaryProps, useRouteError, useFetcher, useNavigation, Link } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import { setAbstractRuntimeString } from "@shopify/shopify-api/runtime";
import "@shopify/shopify-api/adapters/web-api";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { PrismaClient } from "@prisma/client";
import { HttpResponseError, ShopifyError, AuthScopes, InvalidJwtError, WebhookValidationErrorReason, WebhookType, FeatureDeprecatedError, RequestedTokenType, ShopifyHeader, shopifyApi, ApiVersion } from "@shopify/shopify-api";
import { compare } from "compare-versions";
import fs from "node:fs/promises";
import path from "node:path";
import { useState, useEffect, useRef, useMemo, createContext, forwardRef, useContext } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
const APP_BRIDGE_URL = "https://cdn.shopify.com/shopifycloud/app-bridge.js";
const POLARIS_URL = "https://cdn.shopify.com/shopifycloud/polaris.js";
const CDN_URL = "https://cdn.shopify.com";
const REAUTH_URL_HEADER = "X-Shopify-API-Request-Failure-Reauthorize-Url";
const RETRY_INVALID_SESSION_HEADER = {
  "X-Shopify-Retry-Invalid-Session-Request": "1"
};
let appBridgeUrlOverride;
function setAppBridgeUrlOverride(url) {
  appBridgeUrlOverride = url;
}
function appBridgeUrl() {
  return appBridgeUrlOverride || APP_BRIDGE_URL;
}
var AppDistribution;
(function(AppDistribution2) {
  AppDistribution2["AppStore"] = "app_store";
  AppDistribution2["SingleMerchant"] = "single_merchant";
  AppDistribution2["ShopifyAdmin"] = "shopify_admin";
})(AppDistribution || (AppDistribution = {}));
var LoginErrorType;
(function(LoginErrorType2) {
  LoginErrorType2["MissingShop"] = "MISSING_SHOP";
  LoginErrorType2["InvalidShop"] = "INVALID_SHOP";
})(LoginErrorType || (LoginErrorType = {}));
setAbstractRuntimeString(() => {
  return `React Router (Node)`;
});
if (process.env.APP_BRIDGE_URL) {
  setAppBridgeUrlOverride(process.env.APP_BRIDGE_URL);
}
function headersBoundary(headers2) {
  const { parentHeaders, loaderHeaders, actionHeaders, errorHeaders } = headers2;
  if (errorHeaders && Array.from(errorHeaders.entries()).length > 0) {
    return errorHeaders;
  }
  return new Headers([
    ...parentHeaders ? Array.from(parentHeaders.entries()) : [],
    ...loaderHeaders ? Array.from(loaderHeaders.entries()) : [],
    ...actionHeaders ? Array.from(actionHeaders.entries()) : []
  ]);
}
function errorBoundary(error) {
  if (error.constructor.name === "ErrorResponse" || error.constructor.name === "ErrorResponseImpl") {
    return jsx("div", { dangerouslySetInnerHTML: { __html: error.data || "Handling response" } });
  }
  throw error;
}
const boundary = {
  /**
   * A function that handles errors or thrown responses.
   *
   * @example
   * <caption>Catching errors in a route</caption>
   * ```ts
   * // /app/routes/admin/widgets.ts
   * import { boundary } from "@shopify/shopify-app-react-router/server";
   *
   * export function ErrorBoundary() {
   *   return boundary.error(useRouteError());
   * }
   * ```
   */
  error: errorBoundary,
  /**
   * A function that sets the appropriate document response headers.
   *
   * @example
   * <caption>Catching errors in a route</caption>
   * ```ts
   * // /app/routes/admin/widgets.ts
   * import { boundary } from "@shopify/shopify-app-react-router/server";
   *
   * export const headers = (headersArgs) => {
   *   return boundary.headers(headersArgs);
   * };
   * ```
   */
  headers: headersBoundary
};
const SHOPIFY_REACT_ROUTER_LIBRARY_VERSION = "1.2.1";
function registerWebhooksFactory({ api, logger }) {
  return async function registerWebhooks({ session }) {
    return api.webhooks.register({ session }).then((response) => {
      Object.entries(response).forEach(([topic, topicResults]) => {
        topicResults.forEach(({ success, ...rest }) => {
          if (success) {
            logger.debug("Registered webhook", {
              topic,
              shop: session.shop,
              operation: rest.operation
            });
          } else {
            logger.error("Failed to register webhook", {
              topic,
              shop: session.shop,
              result: JSON.stringify(rest.result)
            });
          }
        });
      });
      return response;
    }).catch((error) => {
      var _a2, _b;
      const graphQLErrors = ((_b = (_a2 = error.body) == null ? void 0 : _a2.errors) == null ? void 0 : _b.graphQLErrors) || [];
      const throttled = graphQLErrors.find(({ extensions: { code } }) => code === "THROTTLED");
      if (throttled) {
        logger.error("Failed to register webhooks", {
          shop: session.shop,
          error: JSON.stringify(error)
        });
      } else {
        throw error;
      }
    });
  };
}
function ensureCORSHeadersFactory(params, request, corsHeaders = []) {
  const { logger, config } = params;
  return function ensureCORSHeaders(response) {
    const origin = request.headers.get("Origin");
    if (origin && origin !== config.appUrl) {
      logger.debug("Request comes from a different origin, adding CORS headers");
      const corsHeadersSet = /* @__PURE__ */ new Set([
        "Authorization",
        "Content-Type",
        ...corsHeaders
      ]);
      response.headers.set("Access-Control-Allow-Origin", "*");
      response.headers.set("Access-Control-Allow-Headers", [...corsHeadersSet].join(", "));
      response.headers.set("Access-Control-Expose-Headers", REAUTH_URL_HEADER);
    }
    return response;
  };
}
const redirectToBouncePage = (params, url) => {
  const { config } = params;
  const searchParams = url.searchParams;
  searchParams.delete("id_token");
  searchParams.set("shopify-reload", `${config.appUrl}${url.pathname}?${searchParams.toString()}`);
  throw redirect(`${config.auth.patchSessionTokenPath}?${searchParams.toString()}`);
};
function respondToInvalidSessionToken({ params, request, retryRequest = false }) {
  const { api, logger, config } = params;
  const isDocumentRequest = !request.headers.get("authorization");
  if (isDocumentRequest) {
    return redirectToBouncePage({ config }, new URL(request.url));
  }
  throw new Response(void 0, {
    status: 401,
    statusText: "Unauthorized",
    headers: retryRequest ? RETRY_INVALID_SESSION_HEADER : {}
  });
}
function getShopFromRequest$1(request) {
  const url = new URL(request.url);
  return url.searchParams.get("shop");
}
async function validateSessionToken(params, request, token, { checkAudience = true, retryRequest = true } = {}) {
  const { api, logger } = params;
  const shop = getShopFromRequest$1(request);
  logger.debug("Validating session token", { shop });
  try {
    const payload = await api.session.decodeSessionToken(token, {
      checkAudience
    });
    logger.debug("Session token is valid - validated", {
      shop,
      payload: JSON.stringify(payload)
    });
    return payload;
  } catch (error) {
    logger.debug(`Failed to validate session token: ${error.message}`, {
      shop
    });
    throw respondToInvalidSessionToken({ params, request, retryRequest });
  }
}
const SESSION_TOKEN_PARAM$1 = "id_token";
function getSessionTokenHeader(request) {
  var _a2;
  return (_a2 = request.headers.get("authorization")) == null ? void 0 : _a2.replace("Bearer ", "");
}
function getSessionTokenFromUrlParam(request) {
  const url = new URL(request.url);
  return url.searchParams.get(SESSION_TOKEN_PARAM$1);
}
const SHOPIFY_POS_USER_AGENT = /Shopify POS\//;
const SHOPIFY_MOBILE_USER_AGENT = /Shopify Mobile\//;
const SHOPIFY_USER_AGENTS = [SHOPIFY_POS_USER_AGENT, SHOPIFY_MOBILE_USER_AGENT];
function respondToBotRequest({ logger }, request) {
  const userAgent = request.headers.get("User-Agent") ?? "";
  if (SHOPIFY_USER_AGENTS.some((agent) => agent.test(userAgent))) {
    logger.debug("Request is from a Shopify agent, allow");
    return;
  }
  if (isbot(userAgent)) {
    logger.debug("Request is from a bot, skipping auth");
    throw new Response(void 0, { status: 410, statusText: "Gone" });
  }
}
function respondToOptionsRequest(params, request, corsHeaders) {
  if (request.method === "OPTIONS") {
    const ensureCORSHeaders = ensureCORSHeadersFactory(params, request, corsHeaders);
    throw ensureCORSHeaders(new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Max-Age": "7200"
      }
    }));
  }
}
async function invalidateAccessToken(params, session) {
  const { logger, config } = params;
  logger.debug(`Invalidating access token for session - ${session.id}`, {
    shop: session.shop
  });
  session.accessToken = void 0;
  await config.sessionStorage.storeSession(session);
}
function cancelBillingFactory(params, request, session) {
  return async function cancelBilling(options) {
    const { api, logger } = params;
    logger.debug("Cancelling billing", { shop: session.shop, ...options });
    try {
      return await api.billing.cancel({
        session,
        subscriptionId: options.subscriptionId,
        isTest: options.isTest,
        prorate: options.prorate
      });
    } catch (error) {
      if (error instanceof HttpResponseError && error.response.code === 401) {
        logger.debug("API token was invalid, responding to invalid session", {
          shop: session.shop
        });
        await invalidateAccessToken(params, session);
        throw respondToInvalidSessionToken({
          params,
          request,
          retryRequest: true
        });
      }
      throw error;
    }
  };
}
function requireBillingFactory(params, request, session) {
  const { api, logger } = params;
  return async function requireBilling(options) {
    const logContext = {
      shop: session.shop,
      plans: options.plans,
      isTest: options.isTest
    };
    logger.debug("Checking billing for the shop", logContext);
    let data;
    try {
      data = await api.billing.check({
        session,
        plans: options.plans,
        isTest: options.isTest,
        returnObject: true
      });
    } catch (error) {
      if (error instanceof HttpResponseError && error.response.code === 401) {
        logger.debug("API token was invalid, responding to invalid session", logContext);
        await invalidateAccessToken(params, session);
        throw respondToInvalidSessionToken({
          params,
          request,
          retryRequest: true
        });
      }
      throw error;
    }
    if (!data.hasActivePayment) {
      logger.debug("Billing check failed", logContext);
      throw await options.onFailure(new Error("Billing check failed"));
    }
    logger.debug("Billing check succeeded", logContext);
    return data;
  };
}
function redirectWithAppBridgeHeaders(redirectUri) {
  throw new Response(void 0, {
    status: 401,
    statusText: "Unauthorized",
    headers: getAppBridgeHeaders(redirectUri)
  });
}
function getAppBridgeHeaders(url) {
  return new Headers({ [REAUTH_URL_HEADER]: url });
}
function redirectOutOfApp(params, request, url, shop) {
  const { config, logger } = params;
  logger.debug("Redirecting out of app", { shop, url });
  const requestUrl = new URL(request.url);
  const isEmbeddedRequest2 = requestUrl.searchParams.get("embedded") === "1";
  const isXhrRequest = request.headers.get("authorization");
  if (isXhrRequest) {
    throw new Response(void 0, {
      status: 401,
      statusText: "Unauthorized",
      headers: getAppBridgeHeaders(url)
    });
  } else if (isEmbeddedRequest2) {
    const params2 = new URLSearchParams({
      shop,
      host: requestUrl.searchParams.get("host"),
      exitIframe: url
    });
    throw redirect(`${config.auth.exitIframePath}?${params2.toString()}`);
  } else {
    throw redirect(url);
  }
}
function requestBillingFactory(params, request, session) {
  return async function requestBilling({ plan, isTest, returnUrl, ...overrides }) {
    const { api, logger } = params;
    logger.info("Requesting billing", {
      shop: session.shop,
      plan,
      isTest,
      returnUrl
    });
    let result;
    try {
      result = await api.billing.request({
        plan,
        session,
        isTest,
        returnUrl,
        returnObject: true,
        ...overrides
      });
    } catch (error) {
      if (error instanceof HttpResponseError && error.response.code === 401) {
        logger.debug("API token was invalid, responding to invalid session", {
          shop: session.shop
        });
        await invalidateAccessToken(params, session);
        throw respondToInvalidSessionToken({
          params,
          request,
          retryRequest: true
        });
      }
      throw error;
    }
    throw redirectOutOfApp(params, request, result.confirmationUrl, session.shop);
  };
}
function checkBillingFactory(params, request, session) {
  return async function checkBilling(options = {}) {
    const { api, logger } = params;
    logger.debug("Checking billing plans", { shop: session.shop, ...options });
    try {
      return await api.billing.check({
        session,
        plans: options.plans,
        isTest: options.isTest,
        returnObject: true
      });
    } catch (error) {
      if (error instanceof HttpResponseError && error.response.code === 401) {
        logger.debug("API token was invalid, responding to invalid session", {
          shop: session.shop
        });
        await invalidateAccessToken(params, session);
        throw respondToInvalidSessionToken({
          params,
          request,
          retryRequest: true
        });
      }
      throw error;
    }
  };
}
function createUsageRecordFactory(params, request, session) {
  return async function createUsageRecord(options) {
    const { api, logger } = params;
    logger.debug("Create usage record", { shop: session.shop, ...options });
    try {
      return await api.billing.createUsageRecord({
        ...options,
        session
      });
    } catch (error) {
      if (error instanceof HttpResponseError && error.response.code === 401) {
        logger.debug("API token was invalid, responding to invalid session", {
          shop: session.shop
        });
        await invalidateAccessToken(params, session);
        throw respondToInvalidSessionToken({
          params,
          request,
          retryRequest: true
        });
      }
      throw error;
    }
  };
}
function updateUsageCappedAmountFactory(params, request, session) {
  return async function updateUsageCappedAmount(options) {
    const { api, logger } = params;
    logger.debug("Updating usage subscription capped amount", {
      shop: session.shop,
      ...options
    });
    let result;
    try {
      result = await api.billing.updateUsageCappedAmount({
        session,
        subscriptionLineItemId: options.subscriptionLineItemId,
        cappedAmount: options.cappedAmount
      });
    } catch (error) {
      if (error instanceof HttpResponseError && error.response.code === 401) {
        logger.debug("API token was invalid, responding to invalid session", {
          shop: session.shop
        });
        await invalidateAccessToken(params, session);
        throw respondToInvalidSessionToken({
          params,
          request,
          retryRequest: true
        });
      }
      throw error;
    }
    throw redirectOutOfApp(params, request, result.confirmationUrl, session.shop);
  };
}
function graphqlClientFactory({ params, handleClientError, session }) {
  return async function query(operation, options) {
    const client = new params.api.clients.Graphql({
      session,
      apiVersion: options == null ? void 0 : options.apiVersion
    });
    try {
      const apiResponse = await client.request(operation, {
        variables: options == null ? void 0 : options.variables,
        retries: (options == null ? void 0 : options.tries) ? options.tries - 1 : 0,
        headers: options == null ? void 0 : options.headers,
        signal: options == null ? void 0 : options.signal
      });
      return new Response(JSON.stringify(apiResponse));
    } catch (error) {
      if (handleClientError) {
        throw await handleClientError({ error, params, session });
      }
      throw error;
    }
  };
}
function adminClientFactory({ params, handleClientError, session }) {
  return {
    graphql: graphqlClientFactory({ params, session, handleClientError })
  };
}
function createAdminApiContext(session, params, handleClientError) {
  return adminClientFactory({
    session,
    params,
    handleClientError
  });
}
async function redirectToShopifyOrAppRoot(request, params, responseHeaders) {
  const { api, config } = params;
  const url = new URL(request.url);
  const host = api.utils.sanitizeHost(url.searchParams.get("host"));
  const shop = api.utils.sanitizeShop(url.searchParams.get("shop"));
  let redirectUrl;
  if (config.distribution === AppDistribution.ShopifyAdmin) {
    redirectUrl = `/?shop=${shop}&host=${encodeURIComponent(host)}`;
  } else {
    redirectUrl = await api.auth.getEmbeddedAppUrl({ rawRequest: request });
  }
  throw redirect(redirectUrl, { headers: responseHeaders });
}
const ensureAppIsEmbeddedIfRequired = async (params, request) => {
  const { api, logger, config } = params;
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (config.distribution !== AppDistribution.ShopifyAdmin && url.searchParams.get("embedded") !== "1") {
    logger.debug("App is not embedded, redirecting to Shopify", { shop });
    await redirectToShopifyOrAppRoot(request, { api, config });
  }
};
const SESSION_TOKEN_PARAM = "id_token";
const ensureSessionTokenSearchParamIfRequired = async (params, request) => {
  const { logger, config } = params;
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const searchParamSessionToken = url.searchParams.get(SESSION_TOKEN_PARAM);
  const isEmbedded = url.searchParams.get("embedded") === "1";
  if (config.distribution !== AppDistribution.ShopifyAdmin && isEmbedded && !searchParamSessionToken) {
    logger.debug("Missing session token in search params, going to bounce page", { shop });
    redirectToBouncePage(params, url);
  }
};
function addDocumentResponseHeadersFactory(params) {
  const { api, config } = params;
  return function(request, headers2) {
    const { searchParams } = new URL(request.url);
    const shop = api.utils.sanitizeShop(searchParams.get("shop"));
    const isEmbeddedApp = config.distribution !== AppDistribution.ShopifyAdmin;
    addDocumentResponseHeaders$1(headers2, isEmbeddedApp, shop);
  };
}
function addDocumentResponseHeaders$1(headers2, isEmbeddedApp, shop) {
  if (shop) {
    headers2.set("Link", `<${CDN_URL}>; rel="preconnect", <${APP_BRIDGE_URL}>; rel="preload"; as="script", <${POLARIS_URL}>; rel="preload"; as="script"`);
  }
  if (isEmbeddedApp) {
    if (shop) {
      headers2.set("Content-Security-Policy", `frame-ancestors https://${shop} https://admin.shopify.com https://*.spin.dev https://admin.myshopify.io https://admin.shop.dev;`);
    }
  } else {
    headers2.set("Content-Security-Policy", `frame-ancestors 'none';`);
  }
}
const FILE_URI_MATCH = /\/\/\//;
const INVALID_RELATIVE_URL = /[/\\][/\\]/;
const WHITESPACE_CHARACTER = /\s/;
const VALID_PROTOCOLS = ["https:", "http:"];
function isSafe(domain, redirectUrl, requireSSL = true) {
  if (typeof redirectUrl !== "string") {
    return false;
  }
  if (FILE_URI_MATCH.test(redirectUrl) || WHITESPACE_CHARACTER.test(redirectUrl)) {
    return false;
  }
  let url;
  try {
    url = new URL(redirectUrl, domain);
  } catch (error) {
    return false;
  }
  if (INVALID_RELATIVE_URL.test(url.pathname)) {
    return false;
  }
  if (!VALID_PROTOCOLS.includes(url.protocol)) {
    return false;
  }
  if (requireSSL && url.protocol !== "https:") {
    return false;
  }
  return true;
}
function sanitizeRedirectUrl(domain, redirectUrl, options = {}) {
  if (isSafe(domain, redirectUrl, options.requireSSL)) {
    return new URL(redirectUrl, domain);
  } else if (options.throwOnInvalid === false) {
    return void 0;
  } else {
    throw new ShopifyError("Invalid URL. Refusing to redirect");
  }
}
function renderAppBridge({ api, config }, request, redirectTo) {
  let redirectToScript = "";
  if (redirectTo) {
    const destination = sanitizeRedirectUrl(config.appUrl, redirectTo.url);
    const target = redirectTo.target ?? "_top";
    redirectToScript = `<script>window.open(${JSON.stringify(destination.toString())}, ${JSON.stringify(target)})<\/script>`;
  }
  const responseHeaders = new Headers({
    "content-type": "text/html;charset=utf-8"
  });
  const isEmbeddedApp = config.distribution !== AppDistribution.ShopifyAdmin;
  const shop = api.utils.sanitizeShop(new URL(request.url).searchParams.get("shop"));
  addDocumentResponseHeaders$1(responseHeaders, isEmbeddedApp, shop);
  throw new Response(`
      <script data-api-key="${config.apiKey}" src="${appBridgeUrl()}"><\/script>
      ${redirectToScript}
    `, { headers: responseHeaders });
}
function redirectFactory(params, request, shop) {
  const { config, logger } = params;
  return function redirect$1(url, init) {
    const { searchParams } = new URL(request.url);
    const { url: parsedUrl, target } = parseURL({
      params,
      url,
      base: config.appUrl,
      shop,
      init
    });
    logger.debug("Redirecting", { shop, url: parsedUrl.toString() });
    const isSameOrigin = parsedUrl.origin === new URL(config.appUrl).origin;
    if (isSameOrigin) {
      searchParams.forEach((value, key) => {
        if (!parsedUrl.searchParams.has(key)) {
          parsedUrl.searchParams.set(key, value);
        }
      });
    }
    if (target === "_self") {
      if (isBounceRequest(request)) {
        throw renderAppBridge(params, request, {
          url: parsedUrl.toString(),
          target
        });
      } else {
        return redirect(parsedUrl.toString(), init);
      }
    } else if (isDataRequest(request)) {
      throw redirectWithAppBridgeHeaders(parsedUrl.toString());
    } else if (isEmbeddedRequest(request)) {
      throw renderAppBridge(params, request, {
        url: parsedUrl.toString(),
        target
      });
    }
    return redirect(url, init);
  };
}
function isBounceRequest(request) {
  return Boolean(getSessionTokenHeader(request)) && request.headers.has("X-Shopify-Bounce");
}
function isDataRequest(request) {
  const isGet = request.method === "GET";
  const sessionTokenHeader = Boolean(getSessionTokenHeader(request));
  return sessionTokenHeader && !isBounceRequest(request) && (!isEmbeddedRequest(request) || !isGet);
}
function isEmbeddedRequest(request) {
  const { searchParams } = new URL(request.url);
  return searchParams.get("embedded") === "1";
}
function parseURL({ params, base, init, shop, url }) {
  let target = typeof init !== "number" && (init == null ? void 0 : init.target) ? init.target : void 0;
  if (isAdminRemotePath(url)) {
    const { config } = params;
    const adminPath = getAdminRemotePath(url);
    const cleanShopName = shop.replace(".myshopify.com", "");
    if (!target) {
      target = config.distribution === AppDistribution.ShopifyAdmin ? "_self" : "_parent";
    }
    return {
      url: new URL(`https://admin.shopify.com/store/${cleanShopName}${adminPath}`),
      target
    };
  } else {
    return {
      url: new URL(url, base),
      target: target ?? "_self"
    };
  }
}
const ADMIN_REGEX = /^shopify:\/*admin\//i;
function isAdminRemotePath(url) {
  return ADMIN_REGEX.test(url);
}
function getAdminRemotePath(url) {
  const parsedUrl = removeRestrictedParams(new URL(url)).href;
  return parsedUrl.replace(ADMIN_REGEX, "/");
}
const embeddedFrameParamsToRemove = [
  "hmac",
  "locale",
  "protocol",
  "session",
  "id_token",
  "shop",
  "timestamp",
  "host",
  "embedded",
  // sent when clicking rel="home" nav item
  "appLoadId"
];
function removeRestrictedParams(url) {
  const newUrl = new URL(url);
  embeddedFrameParamsToRemove.forEach((param) => newUrl.searchParams.delete(param));
  return newUrl;
}
function validateShopAndHostParams(params, request) {
  const { api, config, logger } = params;
  if (config.distribution !== AppDistribution.ShopifyAdmin) {
    const url = new URL(request.url);
    const shop = api.utils.sanitizeShop(url.searchParams.get("shop"));
    if (!shop) {
      logger.debug("Missing or invalid shop, rendering App Bridge", {
        shop
      });
      throw renderAppBridgeOrError(request, params);
    }
    const host = api.utils.sanitizeHost(url.searchParams.get("host"));
    if (!host) {
      logger.debug("Invalid host, rendering App Bridge", {
        shop,
        host: url.searchParams.get("host")
      });
      throw renderAppBridgeOrError(request, params);
    }
  }
}
function renderAppBridgeOrError(request, params) {
  const { config, logger } = params;
  const { pathname } = new URL(request.url);
  if (pathname.endsWith(config.auth.loginPath)) {
    const message = `Detected call to shopify.authenticate.admin() from configured login path ('${config.auth.loginPath}'), please make sure to call shopify.login() from that route instead.`;
    logger.debug(message);
    throw new Response(message, { status: 500 });
  }
  logger.debug("Missing shop or host params, rendering App Bridge to retrieve session");
  throw renderAppBridge(params, request);
}
async function redirectToInstallPage(params, shop, optionalScopes = []) {
  const installUrl = buildInstallUrl(params, shop, optionalScopes);
  if (params.config.distribution === AppDistribution.ShopifyAdmin) {
    throw redirect(installUrl);
  } else {
    throw redirectWithAppBridgeHeaders(installUrl);
  }
}
function buildInstallUrl(params, shop, optionalScopes = []) {
  const baseInstallUrl = buildBaseInstallUrl(params, shop);
  baseInstallUrl.search = buildParamsInstallUrl(params, optionalScopes).toString();
  return baseInstallUrl.href;
}
function buildBaseInstallUrl({ api }, shop) {
  const cleanShop = api.utils.sanitizeShop(shop, true);
  return new URL(`https://${cleanShop}/admin/oauth/install`);
}
function buildParamsInstallUrl({ config }, optionalScopes = []) {
  var _a2;
  const optionalScopesParam = optionalScopes && optionalScopes.length > 0 ? { optional_scopes: optionalScopes.join(",") } : void 0;
  const query = {
    client_id: config.apiKey,
    scope: ((_a2 = config.scopes) == null ? void 0 : _a2.toString()) || "",
    ...optionalScopesParam
  };
  return new URLSearchParams(query);
}
const FETCH_SCOPES_DETAIL_QUERY = `#graphql
query FetchAccessScopes{
  app {
    requestedAccessScopes {
      handle
    }
    optionalAccessScopes {
      handle
    }
    installation {
      accessScopes {
        handle
      }
    }
  }
}`;
async function fetchScopeDetail(admin) {
  const fetchScopeDetailResult = await admin.graphql(FETCH_SCOPES_DETAIL_QUERY);
  const resultContent = await fetchScopeDetailResult.json();
  return resultContent.data;
}
function requestScopesFactory(params, session, admin) {
  return async function requestScopes(scopes) {
    const { logger } = params;
    logger.debug("Requesting optional scopes: ", { shop: session.shop, scopes });
    if (scopes.length === 0)
      return;
    if (await alreadyGranted(scopes, admin))
      return;
    throw await redirectToInstallPage(params, session.shop, scopes);
  };
  async function alreadyGranted(scopes, admin2) {
    const scopesDetail = await fetchScopeDetail(admin2);
    const grantedScopes = scopesDetail.app.installation.accessScopes.map((scope) => scope.handle);
    return new AuthScopes(grantedScopes).has(scopes);
  }
}
function queryScopesFactory(params, session, admin) {
  return async function queryScopes() {
    const { logger } = params;
    logger.debug("Querying scopes details: ", {
      shop: session.shop
    });
    const scopesDetail = await fetchScopeDetail(admin);
    return mapFetchScopeDetail(scopesDetail);
  };
}
function mapFetchScopeDetail(scopesDetailResponse) {
  const appInformation = scopesDetailResponse.app;
  const granted = new AuthScopes(appInformation.installation.accessScopes.map((scope) => scope.handle)).toArray(true);
  const required = new AuthScopes(appInformation.requestedAccessScopes.map((scope) => scope.handle)).toArray(true);
  const optional = new AuthScopes(appInformation.optionalAccessScopes.map((scope) => scope.handle)).toArray(true);
  return {
    granted,
    required,
    optional
  };
}
const REVOKE_SCOPE_MUTATION = `#graphql
mutation AppRevokeAccessScopes($scopes: [String!]!) {
  appRevokeAccessScopes(scopes: $scopes){
    revoked {
      handle
    }
    userErrors {
      field
      message
    }
  }
}`;
async function revokeScopes(admin, scopes) {
  const revokeScopesResult = await admin.graphql(REVOKE_SCOPE_MUTATION, {
    variables: {
      scopes
    }
  });
  const resultContent = await revokeScopesResult.json();
  return resultContent.data.appRevokeAccessScopes;
}
function revokeScopesFactory(params, session, admin) {
  return async function revoke(scopes) {
    var _a2;
    const { logger } = params;
    await validateScopes(scopes);
    logger.debug("Revoke scopes: ", {
      shop: session.shop,
      scopes
    });
    const revokeScopesResult = await revokeScopes(admin, scopes);
    if (((_a2 = revokeScopesResult.userErrors) == null ? void 0 : _a2.length) > 0) {
      logger.error("Failed to revoke scopes: ", {
        shop: session.shop,
        errors: revokeScopesResult.userErrors
      });
      throw new Response(JSON.stringify(revokeScopesResult.userErrors), {
        status: 422,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    return {
      revoked: revokeScopesResult.revoked.map((scope) => scope.handle)
    };
  };
}
async function validateScopes(scopes) {
  if (!scopes || scopes.length === 0) {
    throw new Response("No scopes provided", { status: 400 });
  }
}
function scopesApiFactory(params, session, admin) {
  return {
    query: queryScopesFactory(params, session, admin),
    request: requestScopesFactory(params, session, admin),
    revoke: revokeScopesFactory(params, session, admin)
  };
}
function authStrategyFactory({ strategy, ...params }) {
  const { api, logger, config } = params;
  async function respondToBouncePageRequest(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith(config.auth.patchSessionTokenPath)) {
      logger.debug("Rendering bounce page", {
        shop: getShopFromRequest$1(request)
      });
      throw renderAppBridge({ config, api }, request);
    }
  }
  async function respondToExitIframeRequest(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith(config.auth.exitIframePath)) {
      const destination = url.searchParams.get("exitIframe");
      logger.debug("Rendering exit iframe page", {
        shop: getShopFromRequest$1(request),
        destination
      });
      throw renderAppBridge({ config, api }, request, { url: destination });
    }
  }
  function createContext2(request, session, authStrategy, sessionToken) {
    let context = {
      admin: createAdminApiContext(session, params, authStrategy.handleClientError(request)),
      billing: {
        require: requireBillingFactory(params, request, session),
        check: checkBillingFactory(params, request, session),
        request: requestBillingFactory(params, request, session),
        cancel: cancelBillingFactory(params, request, session),
        createUsageRecord: createUsageRecordFactory(params, request, session),
        updateUsageCappedAmount: updateUsageCappedAmountFactory(params, request, session)
      },
      session,
      cors: ensureCORSHeadersFactory(params, request)
    };
    context = addEmbeddedFeatures(context, request, session, sessionToken);
    context = addScopesFeatures(context);
    return context;
  }
  function addEmbeddedFeatures(context, request, session, sessionToken) {
    if (config.distribution === AppDistribution.ShopifyAdmin) {
      return context;
    }
    return {
      ...context,
      sessionToken,
      redirect: redirectFactory(params, request, session.shop)
    };
  }
  function addScopesFeatures(context) {
    return {
      ...context,
      scopes: scopesApiFactory(params, context.session, context.admin)
    };
  }
  return async function authenticateAdmin(request) {
    try {
      respondToBotRequest(params, request);
      respondToOptionsRequest(params, request);
      await respondToBouncePageRequest(request);
      await respondToExitIframeRequest(request);
      if (!getSessionTokenHeader(request)) {
        validateShopAndHostParams(params, request);
        await ensureAppIsEmbeddedIfRequired(params, request);
        await ensureSessionTokenSearchParamIfRequired(params, request);
      }
      logger.info("Authenticating admin request", {
        shop: getShopFromRequest$1(request)
      });
      const { payload, shop, sessionId, sessionToken } = await getSessionTokenContext(params, request);
      logger.debug("Loading session from storage", { shop, sessionId });
      const existingSession = sessionId ? await config.sessionStorage.loadSession(sessionId) : void 0;
      const session = await strategy.authenticate(request, {
        session: existingSession,
        sessionToken,
        shop
      });
      return createContext2(request, session, strategy, payload);
    } catch (errorOrResponse) {
      if (errorOrResponse instanceof Response) {
        logger.debug("Authenticate returned a response", {
          shop: getShopFromRequest$1(request)
        });
        ensureCORSHeadersFactory(params, request)(errorOrResponse);
      }
      throw errorOrResponse;
    }
  };
}
async function getSessionTokenContext(params, request) {
  const { api, config, logger } = params;
  const headerSessionToken = getSessionTokenHeader(request);
  const searchParamSessionToken = getSessionTokenFromUrlParam(request);
  const sessionToken = headerSessionToken || searchParamSessionToken;
  logger.debug("Attempting to authenticate session token", {
    shop: getShopFromRequest$1(request),
    sessionToken: JSON.stringify({
      header: headerSessionToken,
      search: searchParamSessionToken
    })
  });
  if (config.distribution !== AppDistribution.ShopifyAdmin) {
    const payload = await validateSessionToken(params, request, sessionToken);
    const dest = new URL(payload.dest);
    const shop2 = dest.hostname;
    logger.debug("Session token is valid - authenticated", { shop: shop2, payload });
    const sessionId2 = config.useOnlineTokens ? api.session.getJwtSessionId(shop2, payload.sub) : api.session.getOfflineId(shop2);
    return { shop: shop2, payload, sessionId: sessionId2, sessionToken };
  }
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const sessionId = await api.session.getCurrentId({
    isOnline: config.useOnlineTokens,
    rawRequest: request
  });
  return { shop, sessionId, payload: void 0, sessionToken };
}
function handleClientErrorFactory({ request, onError }) {
  return async function handleClientError({ error, params, session }) {
    if (error instanceof HttpResponseError !== true) {
      params.logger.debug(`Got a response error from the API: ${error.message}`, { shop: session.shop });
      throw error;
    }
    params.logger.debug(`Got an HTTP response error from the API: ${error.message}`, {
      shop: session.shop,
      code: error.response.code,
      statusText: error.response.statusText,
      body: JSON.stringify(error.response.body)
    });
    if (onError) {
      await onError({ request, session, error });
    }
    throw new Response(JSON.stringify(error.response.body), {
      status: error.response.code,
      headers: {
        "Content-Type": error.response.headers["Content-Type"]
      }
    });
  };
}
async function createOrLoadOfflineSession({ api, config, logger }, shop) {
  if (config.distribution === AppDistribution.ShopifyAdmin) {
    logger.debug("Creating custom app session from configured access token", {
      shop
    });
    return api.session.customAppSession(shop);
  } else {
    logger.debug("Loading offline session from session storage", { shop });
    const offlineSessionId = api.session.getOfflineId(shop);
    const session = await config.sessionStorage.loadSession(offlineSessionId);
    return session;
  }
}
async function refreshToken(params, shop, refreshToken2) {
  var _a2;
  const { api } = params;
  try {
    const { session } = await api.auth.refreshToken({
      shop,
      refreshToken: refreshToken2
    });
    return session;
  } catch (error) {
    if (error instanceof InvalidJwtError || error instanceof HttpResponseError && error.response.code === 400 && ((_a2 = error.response.body) == null ? void 0 : _a2.error) === "invalid_subject_token") {
      throw error;
    }
    throw new Response(void 0, {
      status: 500,
      statusText: "Internal Server Error"
    });
  }
}
const WITHIN_MILLISECONDS_OF_EXPIRY = 5 * 60 * 1e3;
async function ensureOfflineTokenIsNotExpired(session, params, shop) {
  var _a2;
  const { config } = params;
  if (((_a2 = config.future) == null ? void 0 : _a2.expiringOfflineAccessTokens) && session.isExpired(WITHIN_MILLISECONDS_OF_EXPIRY) && config.distribution !== AppDistribution.ShopifyAdmin && session.refreshToken) {
    const offlineSession = await refreshToken(params, shop, session.refreshToken);
    await config.sessionStorage.storeSession(offlineSession);
    return offlineSession;
  }
  return session;
}
async function ensureValidOfflineSession(params, shop) {
  const session = await createOrLoadOfflineSession(params, shop);
  if (!session)
    return void 0;
  return ensureOfflineTokenIsNotExpired(session, params, shop);
}
function authenticateWebhookFactory(params) {
  const { api, logger } = params;
  return async function authenticate2(request) {
    if (request.method !== "POST") {
      logger.debug("Received a non-POST request for a webhook. Only POST requests are allowed.", { url: request.url, method: request.method });
      throw new Response(void 0, {
        status: 405,
        statusText: "Method not allowed"
      });
    }
    const rawBody = await request.text();
    const check = await api.webhooks.validate({
      rawBody,
      rawRequest: request
    });
    if (!check.valid) {
      if (check.reason === WebhookValidationErrorReason.InvalidHmac) {
        logger.debug("Webhook HMAC validation failed", check);
        throw new Response(void 0, {
          status: 401,
          statusText: "Unauthorized"
        });
      } else {
        logger.debug("Webhook validation failed", check);
        throw new Response(void 0, { status: 400, statusText: "Bad Request" });
      }
    }
    const session = await ensureValidOfflineSession(params, check.domain);
    let webhookContext;
    if (check.webhookType === WebhookType.Webhooks) {
      webhookContext = {
        apiVersion: check.apiVersion,
        shop: check.domain,
        topic: check.topic,
        webhookId: check.webhookId,
        payload: JSON.parse(rawBody),
        subTopic: check.subTopic || void 0,
        session: void 0,
        admin: void 0,
        webhookType: check.webhookType,
        name: check.name,
        triggeredAt: check.triggeredAt,
        eventId: check.eventId
      };
    } else {
      webhookContext = {
        apiVersion: check.apiVersion,
        shop: check.domain,
        topic: check.topic,
        webhookId: check.webhookId,
        payload: JSON.parse(rawBody),
        session: void 0,
        admin: void 0,
        webhookType: check.webhookType,
        handle: check.handle,
        action: check.action,
        resourceId: check.resourceId,
        triggeredAt: check.triggeredAt,
        eventId: check.eventId
      };
    }
    if (!session) {
      return webhookContext;
    }
    const admin = adminClientFactory({
      params,
      session,
      handleClientError: handleClientErrorFactory({ request })
    });
    return {
      ...webhookContext,
      session,
      admin
    };
  };
}
function overrideLogger(logger) {
  const baseContext = { package: "shopify-app" };
  const warningFunction = (message, context = {}) => logger.warning(message, { ...baseContext, ...context });
  function deprecated(warningFunction2) {
    return function(version, message) {
      if (compare(SHOPIFY_REACT_ROUTER_LIBRARY_VERSION, version, ">=")) {
        throw new FeatureDeprecatedError(`Feature was deprecated in version ${version}`);
      }
      return warningFunction2(`[Deprecated | ${version}] ${message}`);
    };
  }
  return {
    ...logger,
    log: (severity, message, context = {}) => logger.log(severity, message, { ...baseContext, ...context }),
    debug: (message, context = {}) => logger.debug(message, { ...baseContext, ...context }),
    info: (message, context = {}) => logger.info(message, { ...baseContext, ...context }),
    warning: warningFunction,
    error: (message, context = {}) => logger.error(message, { ...baseContext, ...context }),
    deprecated: deprecated(warningFunction)
  };
}
function loginFactory(params) {
  const { api, config, logger } = params;
  return async function login2(request) {
    const url = new URL(request.url);
    const shopParam = url.searchParams.get("shop");
    if (request.method === "GET" && !shopParam) {
      return {};
    }
    const shop = shopParam || (await request.formData()).get("shop");
    if (!shop) {
      logger.debug("Missing shop parameter", { shop });
      return { shop: LoginErrorType.MissingShop };
    }
    const shopWithoutProtocol = shop.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const shopWithDomain = (shop == null ? void 0 : shop.indexOf(".")) === -1 ? `${shopWithoutProtocol}.myshopify.com` : shopWithoutProtocol;
    const sanitizedShop = api.utils.sanitizeShop(shopWithDomain);
    if (!sanitizedShop) {
      logger.debug("Invalid shop parameter", { shop });
      return { shop: LoginErrorType.InvalidShop };
    }
    const authPath = `${config.appUrl}${config.auth.path}?shop=${sanitizedShop}`;
    const adminPath = api.utils.legacyUrlToShopAdminUrl(sanitizedShop);
    const installPath = `https://${adminPath}/oauth/install?client_id=${config.apiKey}`;
    const shouldInstall = config.distribution !== AppDistribution.ShopifyAdmin;
    const redirectUrl = shouldInstall ? installPath : authPath;
    logger.info(`Redirecting login request to ${redirectUrl}`, {
      shop: sanitizedShop
    });
    throw redirect(redirectUrl);
  };
}
class SessionNotFoundError extends ShopifyError {
}
function unauthenticatedAdminContextFactory(params) {
  return async (shop) => {
    const session = await ensureValidOfflineSession(params, shop);
    if (!session) {
      throw new SessionNotFoundError(`Could not find a session for shop ${shop} when creating unauthenticated admin context`);
    }
    return {
      session,
      admin: adminClientFactory({ params, session })
    };
  };
}
function authenticateExtensionFactory(params, requestType) {
  return async function authenticateExtension(request, options = {}) {
    const { logger } = params;
    const corsHeaders = options.corsHeaders ?? [];
    respondToBotRequest(params, request);
    respondToOptionsRequest(params, request, corsHeaders);
    const sessionTokenHeader = getSessionTokenHeader(request);
    logger.info(`Authenticating ${requestType} request`, {
      shop: getShopFromRequest$1(request)
    });
    if (!sessionTokenHeader) {
      logger.debug("Request did not contain a session token", {
        shop: getShopFromRequest$1(request)
      });
      throw new Response(void 0, {
        status: 401,
        statusText: "Unauthorized"
      });
    }
    return {
      sessionToken: await validateSessionToken(params, request, sessionTokenHeader, { checkAudience: false, retryRequest: false }),
      cors: ensureCORSHeadersFactory(params, request, corsHeaders)
    };
  };
}
function authenticateCheckoutFactory(params) {
  return authenticateExtensionFactory(params, "checkout");
}
function storefrontClientFactory({ params, session }) {
  const { api } = params;
  return {
    graphql: async (query, options = {}) => {
      const client = new api.clients.Storefront({
        session,
        apiVersion: options.apiVersion
      });
      const apiResponse = await client.request(query, {
        variables: options == null ? void 0 : options.variables,
        retries: (options == null ? void 0 : options.tries) ? options.tries - 1 : 0,
        headers: options == null ? void 0 : options.headers
      });
      return new Response(JSON.stringify(apiResponse));
    }
  };
}
function authenticateAppProxyFactory(params) {
  const { logger } = params;
  return async function authenticate2(request) {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    logger.info("Authenticating app proxy request", { shop });
    if (!await validateAppProxyHmac(params, url)) {
      logger.info("App proxy request has invalid signature", { shop });
      throw new Response(void 0, {
        status: 400,
        statusText: "Bad Request"
      });
    }
    const session = await ensureValidOfflineSession(params, shop);
    if (!session) {
      logger.debug("Could not find offline session, returning empty context", {
        shop,
        ...Object.fromEntries(url.searchParams.entries())
      });
      const context2 = {
        liquid,
        session: void 0,
        admin: void 0,
        storefront: void 0
      };
      return context2;
    }
    const context = {
      liquid,
      session,
      admin: adminClientFactory({ params, session }),
      storefront: storefrontClientFactory({ params, session })
    };
    return context;
  };
}
const liquid = (body, initAndOptions) => {
  const processedBody = processLiquidBody(body);
  if (typeof initAndOptions !== "object") {
    return new Response(processedBody, {
      status: initAndOptions || 200,
      headers: {
        "Content-Type": "application/liquid"
      }
    });
  }
  const { layout, ...responseInit } = initAndOptions || {};
  const responseBody = layout === false ? `{% layout none %} ${processedBody}` : processedBody;
  const headers2 = new Headers(responseInit.headers);
  headers2.set("Content-Type", "application/liquid");
  return new Response(responseBody, {
    ...responseInit,
    headers: headers2
  });
};
async function validateAppProxyHmac(params, url) {
  const { api, logger } = params;
  try {
    let searchParams = new URLSearchParams(url.search);
    if (!searchParams.get("index")) {
      searchParams.delete("index");
    }
    let isValid = await api.utils.validateHmac(Object.fromEntries(searchParams.entries()), { signator: "appProxy" });
    if (!isValid) {
      const cleanPath = url.pathname.replace(/^\//, "").replace(/\/$/, "").replaceAll("/", ".");
      const data = `routes%2F${cleanPath}`;
      searchParams = new URLSearchParams(`?_data=${data}&${searchParams.toString().replace(/^\?/, "")}`);
      isValid = await api.utils.validateHmac(Object.fromEntries(searchParams.entries()), { signator: "appProxy" });
      if (!isValid) {
        const searchParams2 = new URLSearchParams(`?_data=${data}._index&${url.search.replace(/^\?/, "")}`);
        isValid = await api.utils.validateHmac(Object.fromEntries(searchParams2.entries()), { signator: "appProxy" });
      }
    }
    return isValid;
  } catch (error) {
    const shop = url.searchParams.get("shop");
    logger.info(error.message, { shop });
    throw new Response(void 0, { status: 400, statusText: "Bad Request" });
  }
}
function processLiquidBody(body) {
  return body.replaceAll(/<(form[^>]+)action="(\/[^"?]+)(\?[^"]+)?">/g, '<$1action="$2/$3">').replaceAll(/<(a[^>]+)href="(\/[^"?]+)(\?[^"]+)?">/g, '<$1href="$2/$3">');
}
function authenticateCustomerAccountFactory(params) {
  return authenticateExtensionFactory(params, "customer account");
}
function authenticatePublicFactory(params) {
  const authenticateCheckout = authenticateCheckoutFactory(params);
  const authenticateAppProxy = authenticateAppProxyFactory(params);
  const authenticateCustomerAccount = authenticateCustomerAccountFactory(params);
  const context = {
    checkout: authenticateCheckout,
    appProxy: authenticateAppProxy,
    customerAccount: authenticateCustomerAccount
  };
  return context;
}
function unauthenticatedStorefrontContextFactory(params) {
  return async (shop) => {
    const session = await ensureValidOfflineSession(params, shop);
    if (!session) {
      throw new SessionNotFoundError(`Could not find a session for shop ${shop} when creating unauthenticated storefront context`);
    }
    return {
      session,
      storefront: storefrontClientFactory({ params, session })
    };
  };
}
async function triggerAfterAuthHook(params, session, request, authStrategy) {
  const { config, logger } = params;
  if (config.hooks.afterAuth) {
    logger.info("Running afterAuth hook", { shop: session.shop });
    const admin = createAdminApiContext(session, params, authStrategy.handleClientError(request));
    await config.hooks.afterAuth({
      session,
      admin
    });
  }
}
const createTokenExchangeStrategy = (params) => {
  const { api, config, logger } = params;
  async function exchangeToken({ request, shop, sessionToken, requestedTokenType }) {
    var _a2;
    try {
      console.log("config.future.expiringOfflineAccessTokens", config.future.expiringOfflineAccessTokens);
      return await api.auth.tokenExchange({
        sessionToken,
        shop,
        requestedTokenType,
        expiring: config.future.expiringOfflineAccessTokens
      });
    } catch (error) {
      if (error instanceof InvalidJwtError || error instanceof HttpResponseError && error.response.code === 400 && ((_a2 = error.response.body) == null ? void 0 : _a2.error) === "invalid_subject_token") {
        throw respondToInvalidSessionToken({
          params: { api, config, logger },
          request,
          retryRequest: true
        });
      }
      throw new Response(void 0, {
        status: 500,
        statusText: "Internal Server Error"
      });
    }
  }
  async function handleAfterAuthHook(session, request, sessionToken) {
    await config.idempotentPromiseHandler.handlePromise({
      promiseFunction: () => {
        return triggerAfterAuthHook(params, session, request, {
          authenticate: authenticate2,
          handleClientError
        });
      },
      identifier: sessionToken
    });
  }
  async function authenticate2(request, sessionContext) {
    const { shop, session, sessionToken } = sessionContext;
    if (!sessionToken)
      throw new InvalidJwtError();
    if (!session || !session.isActive(void 0, WITHIN_MILLISECONDS_OF_EXPIRY)) {
      logger.info("No valid session found", { shop });
      logger.info("Requesting offline access token", { shop });
      const { session: offlineSession } = await exchangeToken({
        request,
        sessionToken,
        shop,
        requestedTokenType: RequestedTokenType.OfflineAccessToken
      });
      await config.sessionStorage.storeSession(offlineSession);
      let newSession = offlineSession;
      if (config.useOnlineTokens) {
        logger.info("Requesting online access token", { shop });
        const { session: onlineSession } = await exchangeToken({
          request,
          sessionToken,
          shop,
          requestedTokenType: RequestedTokenType.OnlineAccessToken
        });
        await config.sessionStorage.storeSession(onlineSession);
        newSession = onlineSession;
      }
      logger.debug("Request is valid, loaded session from session token", {
        shop: newSession.shop,
        isOnline: newSession.isOnline
      });
      try {
        await handleAfterAuthHook(newSession, request, sessionToken);
      } catch (errorOrResponse) {
        if (errorOrResponse instanceof Response) {
          throw errorOrResponse;
        }
        throw new Response(void 0, {
          status: 500,
          statusText: "Internal Server Error"
        });
      }
      return newSession;
    }
    return session;
  }
  function handleClientError(request) {
    return handleClientErrorFactory({
      request,
      onError: async ({ session, error }) => {
        if (error.response.code === 401) {
          logger.debug("Responding to invalid access token", {
            shop: getShopFromRequest$1(request)
          });
          await invalidateAccessToken({ config, logger }, session);
          respondToInvalidSessionToken({
            params: { config, api, logger },
            request
          });
        }
      }
    });
  }
  return {
    authenticate: authenticate2,
    handleClientError
  };
};
const createMerchantCustomAuthStrategy = (params) => {
  const { api, logger } = params;
  async function authenticate2(_request, sessionContext) {
    const { shop } = sessionContext;
    logger.debug("Building session from configured access token for merchant custom app", { shop });
    const session = api.session.customAppSession(shop);
    return session;
  }
  function handleClientError(request) {
    return handleClientErrorFactory({
      request,
      onError: async ({ error }) => {
        if (error.response.code === 401) {
          logger.info("Request failed with 401. Review your API credentials or generate new tokens. https://shopify.dev/docs/apps/build/authentication-authorization/access-token-types/generate-app-access-tokens-admin#rotating-api-credentials-for-admin-created-apps ");
          throw new ShopifyError("Unauthorized: Access token has been revoked.");
        }
      }
    });
  }
  return {
    authenticate: authenticate2,
    handleClientError
  };
};
const IDENTIFIER_TTL_MS = 6e4;
class IdempotentPromiseHandler {
  constructor() {
    __publicField(this, "identifiers");
    this.identifiers = /* @__PURE__ */ new Map();
  }
  async handlePromise({ promiseFunction, identifier }) {
    try {
      if (this.isPromiseRunnable(identifier)) {
        await promiseFunction();
      }
    } finally {
      this.clearStaleIdentifiers();
    }
    return Promise.resolve();
  }
  isPromiseRunnable(identifier) {
    if (!this.identifiers.has(identifier)) {
      this.identifiers.set(identifier, Date.now());
      return true;
    }
    return false;
  }
  async clearStaleIdentifiers() {
    this.identifiers.forEach((date, identifier, map) => {
      if (Date.now() - date > IDENTIFIER_TTL_MS) {
        map.delete(identifier);
      }
    });
  }
}
function authenticateFlowFactory(params) {
  const { api, logger } = params;
  return async function authenticate2(request) {
    logger.info("Authenticating flow request");
    if (request.method !== "POST") {
      logger.debug("Received a non-POST request for flow. Only POST requests are allowed.", { url: request.url, method: request.method });
      throw new Response(void 0, {
        status: 405,
        statusText: "Method not allowed"
      });
    }
    const rawBody = await request.text();
    const result = await api.flow.validate({
      rawBody,
      rawRequest: request
    });
    if (!result.valid) {
      logger.error("Received an invalid flow request", { reason: result.reason });
      throw new Response(void 0, {
        status: 400,
        statusText: "Bad Request"
      });
    }
    const payload = JSON.parse(rawBody);
    logger.debug("Flow request is valid, looking for an offline session", {
      shop: payload.shopify_domain
    });
    const session = await ensureValidOfflineSession(params, payload.shopify_domain);
    if (!session) {
      logger.info("Flow request could not find session", {
        shop: payload.shopify_domain
      });
      throw new Response(void 0, {
        status: 400,
        statusText: "Bad Request"
      });
    }
    logger.debug("Found a session for the flow request", { shop: session.shop });
    return {
      session,
      payload,
      admin: adminClientFactory({ params, session })
    };
  };
}
function authenticateFulfillmentServiceFactory(params) {
  const { api, logger } = params;
  return async function authenticate2(request) {
    logger.info("Authenticating fulfillment service request");
    if (request.method !== "POST") {
      logger.debug("Received a non-POST request for fulfillment service. Only POST requests are allowed.", { url: request.url, method: request.method });
      throw new Response(void 0, {
        status: 405,
        statusText: "Method not allowed"
      });
    }
    const rawBody = await request.text();
    const result = await api.fulfillmentService.validate({
      rawBody,
      rawRequest: request
    });
    if (!result.valid) {
      logger.error("Received an invalid fulfillment service request", {
        reason: result.reason
      });
      throw new Response(void 0, {
        status: 400,
        statusText: "Bad Request"
      });
    }
    const payload = JSON.parse(rawBody);
    const shop = request.headers.get(ShopifyHeader.Domain) || "";
    logger.debug("Fulfillment service request is valid, looking for an offline session", {
      shop
    });
    const session = await ensureValidOfflineSession(params, shop);
    if (!session) {
      logger.info("Fulfillment service request could not find session", {
        shop
      });
      throw new Response(void 0, {
        status: 400,
        statusText: "Bad Request"
      });
    }
    logger.debug("Found a session for the fulfillment service request", {
      shop
    });
    return {
      session,
      payload,
      admin: adminClientFactory({ params, session })
    };
  };
}
function authenticatePOSFactory(params) {
  return authenticateExtensionFactory(params, "pos");
}
function shopifyApp(appConfig) {
  const api = deriveApi(appConfig);
  const config = deriveConfig(appConfig, api.config);
  const logger = overrideLogger(api.logger);
  if (appConfig.webhooks) {
    api.webhooks.addHandlers(appConfig.webhooks);
  }
  const params = { api, config, logger };
  let strategy;
  if (config.distribution === AppDistribution.ShopifyAdmin) {
    strategy = createMerchantCustomAuthStrategy(params);
  } else {
    strategy = createTokenExchangeStrategy(params);
  }
  const authStrategy = authStrategyFactory({
    ...params,
    strategy
  });
  const shopify2 = {
    sessionStorage: config.sessionStorage,
    addDocumentResponseHeaders: addDocumentResponseHeadersFactory(params),
    registerWebhooks: registerWebhooksFactory(params),
    authenticate: {
      admin: authStrategy,
      flow: authenticateFlowFactory(params),
      fulfillmentService: authenticateFulfillmentServiceFactory(params),
      pos: authenticatePOSFactory(params),
      public: authenticatePublicFactory(params),
      webhook: authenticateWebhookFactory(params)
    },
    unauthenticated: {
      admin: unauthenticatedAdminContextFactory(params),
      storefront: unauthenticatedStorefrontContextFactory(params)
    }
  };
  if (isAppStoreApp(shopify2, appConfig) || isSingleMerchantApp(shopify2, appConfig)) {
    shopify2.login = loginFactory(params);
  }
  return shopify2;
}
function isAppStoreApp(_shopify, config) {
  return config.distribution === AppDistribution.AppStore;
}
function isSingleMerchantApp(_shopify, config) {
  return config.distribution === AppDistribution.SingleMerchant;
}
function deriveApi(appConfig) {
  let appUrl;
  try {
    appUrl = new URL(appConfig.appUrl);
  } catch (error) {
    const message = appConfig.appUrl === "" ? `Detected an empty appUrl configuration, please make sure to set the necessary environment variables.
If you're deploying your app, you can find more information at https://shopify.dev/docs/apps/launch/deployment/deploy-web-app/deploy-to-hosting-service#step-4-set-up-environment-variables` : `Invalid appUrl configuration '${appConfig.appUrl}', please provide a valid URL.`;
    throw new ShopifyError(message);
  }
  if (appUrl.hostname === "localhost" && !appUrl.port && process.env.PORT) {
    appUrl.port = process.env.PORT;
  }
  appConfig.appUrl = appUrl.origin;
  let userAgentPrefix = `Shopify React Router Library v${SHOPIFY_REACT_ROUTER_LIBRARY_VERSION}`;
  if (appConfig.userAgentPrefix) {
    userAgentPrefix = `${appConfig.userAgentPrefix} | ${userAgentPrefix}`;
  }
  return shopifyApi({
    ...appConfig,
    hostName: appUrl.host,
    hostScheme: appUrl.protocol.replace(":", ""),
    userAgentPrefix,
    isEmbeddedApp: true,
    isCustomStoreApp: appConfig.distribution === AppDistribution.ShopifyAdmin,
    billing: appConfig.billing,
    future: {
      unstable_managedPricingSupport: true
    },
    _logDisabledFutureFlags: false
  });
}
function deriveConfig(appConfig, apiConfig) {
  if (!appConfig.sessionStorage && appConfig.distribution !== AppDistribution.ShopifyAdmin) {
    throw new ShopifyError("Please provide a valid session storage. Refer to https://github.com/Shopify/shopify-app-js/blob/main/README.md#session-storage-options for options.");
  }
  const authPathPrefix = appConfig.authPathPrefix || "/auth";
  appConfig.distribution = appConfig.distribution ?? AppDistribution.AppStore;
  return {
    ...appConfig,
    ...apiConfig,
    billing: appConfig.billing,
    scopes: apiConfig.scopes,
    idempotentPromiseHandler: new IdempotentPromiseHandler(),
    canUseLoginForm: appConfig.distribution !== AppDistribution.ShopifyAdmin,
    useOnlineTokens: appConfig.useOnlineTokens ?? false,
    hooks: appConfig.hooks ?? {},
    sessionStorage: appConfig.sessionStorage,
    future: appConfig.future ?? {},
    auth: {
      path: authPathPrefix,
      callbackPath: `${authPathPrefix}/callback`,
      patchSessionTokenPath: `${authPathPrefix}/session-token`,
      exitIframePath: `${authPathPrefix}/exit-iframe`,
      loginPath: `${authPathPrefix}/login`
    },
    distribution: appConfig.distribution
  };
}
setAbstractRuntimeString(() => {
  return `React Router`;
});
if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}
const prisma = global.prismaGlobal ?? new PrismaClient();
const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July26,
  scopes: (_a = process.env.SCOPES) == null ? void 0 : _a.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true
  },
  ...process.env.SHOP_CUSTOM_DOMAIN ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] } : {}
});
ApiVersion.July26;
const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
const authenticate = shopify.authenticate;
const unauthenticated = shopify.unauthenticated;
const login = shopify.login;
shopify.registerWebhooks;
shopify.sessionStorage;
const streamTimeout = 5e3;
async function handleRequest(request, responseStatusCode, responseHeaders, reactRouterContext) {
  addDocumentResponseHeaders(request, responseHeaders);
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith("/storefront") || pathname.startsWith("/api/storefront")) {
    responseHeaders.set(
      "Content-Security-Policy",
      "frame-ancestors https://*.myshopify.com https://admin.shopify.com https://*.shopify.com;"
    );
    responseHeaders.delete("X-Frame-Options");
  }
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? "") ? "onAllReady" : "onShellReady";
  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      /* @__PURE__ */ jsx(ServerRouter, { context: reactRouterContext, url: request.url }),
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        }
      }
    );
    setTimeout(abort, streamTimeout + 1e3);
  });
}
const entryServer = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: handleRequest,
  streamTimeout
}, Symbol.toStringTag, { value: "Module" }));
const root = UNSAFE_withComponentProps(function App() {
  return /* @__PURE__ */ jsxs("html", {
    lang: "en",
    children: [/* @__PURE__ */ jsxs("head", {
      children: [/* @__PURE__ */ jsx("meta", {
        charSet: "utf-8"
      }), /* @__PURE__ */ jsx("meta", {
        name: "viewport",
        content: "width=device-width,initial-scale=1"
      }), /* @__PURE__ */ jsx("link", {
        rel: "preconnect",
        href: "https://cdn.shopify.com/"
      }), /* @__PURE__ */ jsx("link", {
        rel: "stylesheet",
        href: "https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
      }), /* @__PURE__ */ jsx(Meta, {}), /* @__PURE__ */ jsx(Links, {})]
    }), /* @__PURE__ */ jsxs("body", {
      children: [/* @__PURE__ */ jsx(Outlet, {}), /* @__PURE__ */ jsx(ScrollRestoration, {}), /* @__PURE__ */ jsx(Scripts, {})]
    })]
  });
});
const route0 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: root
}, Symbol.toStringTag, { value: "Module" }));
const action$i = async ({
  request
}) => {
  const {
    payload,
    session,
    topic,
    shop
  } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  const current = payload.current;
  if (session) {
    await prisma.session.update({
      where: {
        id: session.id
      },
      data: {
        scope: current.toString()
      }
    });
  }
  return new Response();
};
const route1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$i
}, Symbol.toStringTag, { value: "Module" }));
const VIEW_TYPES = [
  { value: "front", label: "Front" },
  { value: "back", label: "Back" },
  { value: "right_sleeve", label: "Right Sleeve" },
  { value: "left_sleeve", label: "Left Sleeve" },
  { value: "inside_label", label: "Inside Label" },
  { value: "custom", label: "Custom" }
];
const GRAPHIC_CATEGORIES = [
  "Logos",
  "Symbols",
  "Sports",
  "Animals",
  "Business",
  "Holiday",
  "Other"
];
const DEFAULT_COLORS = [
  { id: "white", name: "White", hex: "#ffffff", imageUrl: null },
  { id: "black", name: "Black", hex: "#111111", imageUrl: null },
  { id: "red", name: "Red", hex: "#c81e1e", imageUrl: null },
  { id: "blue", name: "Blue", hex: "#1d4ed8", imageUrl: null },
  { id: "yellow", name: "Yellow", hex: "#eab308", imageUrl: null },
  { id: "green", name: "Green", hex: "#15803d", imageUrl: null }
];
const WEB_SAFE_FONTS = [
  "Arial",
  "Helvetica",
  "Times New Roman",
  "Georgia",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Courier New",
  "Impact"
];
const GOOGLE_FONTS = [
  "Anton",
  "Bebas Neue",
  "Lato",
  "Montserrat",
  "Oswald",
  "Playfair Display",
  "Poppins",
  "Roboto",
  "Source Sans 3"
];
function defaultTools() {
  return {
    text: true,
    graphic: true,
    upload: true,
    qrCode: true,
    namesNumbers: true,
    designIdeas: true
  };
}
function defaultCustomizerConfiguration() {
  return {
    tools: defaultTools(),
    pricing: {
      basePrice: 0,
      textPrice: 0,
      graphicPrice: 0,
      uploadPrice: 0
    },
    customerOptions: {
      allowOverflow: false,
      showQuantity: true,
      minQuantity: 1,
      maxQuantity: 99,
      requireColor: true
    },
    colors: DEFAULT_COLORS,
    colorMode: "tint",
    print: {
      dpi: 300,
      format: "png"
    }
  };
}
function defaultStoreSettings() {
  return {
    maxUploadMb: 8,
    defaultDpi: 300,
    allowSvg: true,
    tools: defaultTools()
  };
}
function defaultPrintArea(width = 800, height = 800) {
  return {
    x: Math.round(width * 0.22),
    y: Math.round(height * 0.18),
    width: Math.round(width * 0.56),
    height: Math.round(height * 0.62),
    rotation: 0,
    locked: false
  };
}
function mergeConfiguration(value) {
  const defaults = defaultCustomizerConfiguration();
  if (!value || typeof value !== "object") return defaults;
  return {
    ...defaults,
    ...value,
    tools: { ...defaults.tools, ...value.tools || {} },
    pricing: { ...defaults.pricing, ...value.pricing || {} },
    customerOptions: {
      ...defaults.customerOptions,
      ...value.customerOptions || {}
    },
    print: { ...defaults.print, ...value.print || {} },
    colors: Array.isArray(value.colors) ? value.colors : defaults.colors
  };
}
function toGid(id, type = "Product") {
  if (!id) return "";
  const value = String(id);
  if (value.startsWith("gid://")) return value;
  return `gid://shopify/${type}/${value}`;
}
function toNumericId(gid) {
  if (!gid) return "";
  const value = String(gid);
  if (!value.startsWith("gid://")) return value;
  return value.split("/").pop() || "";
}
function parseShopDomain(shop) {
  if (!shop) return "";
  return String(shop).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}
async function getOrCreateStore(shop) {
  const domain = parseShopDomain(shop);
  if (!domain) {
    throw new Error("A shop domain is required.");
  }
  return prisma.store.upsert({
    where: { shop: domain },
    create: {
      shop: domain,
      settings: defaultStoreSettings()
    },
    update: {}
  });
}
async function getStoreByShop(shop) {
  const domain = parseShopDomain(shop);
  if (!domain) return null;
  return prisma.store.findUnique({ where: { shop: domain } });
}
async function updateStoreSettings(storeId, settings) {
  return prisma.store.update({
    where: { id: storeId },
    data: { settings }
  });
}
async function deleteStoreByShop(shop) {
  const domain = parseShopDomain(shop);
  if (!domain) return;
  await prisma.store.deleteMany({ where: { shop: domain } });
}
const action$h = async ({
  request
}) => {
  const {
    shop,
    session,
    topic
  } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  if (session) {
    await prisma.session.deleteMany({
      where: {
        shop
      }
    });
  }
  await deleteStoreByShop(shop);
  return new Response();
};
const route2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$h
}, Symbol.toStringTag, { value: "Module" }));
function parseJsonField(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
function asPrintArea(value, fallback) {
  const parsed = parseJsonField(value, fallback);
  if (!parsed || typeof parsed !== "object") return fallback;
  return {
    x: Number(parsed.x) || 0,
    y: Number(parsed.y) || 0,
    width: Number(parsed.width) || 0,
    height: Number(parsed.height) || 0,
    rotation: Number(parsed.rotation) || 0,
    locked: Boolean(parsed.locked)
  };
}
function serializeView(view) {
  var _a2;
  const printAreaRecord = (_a2 = view.printAreas) == null ? void 0 : _a2[0];
  const printArea = printAreaRecord ? {
    id: printAreaRecord.id,
    x: printAreaRecord.x,
    y: printAreaRecord.y,
    width: printAreaRecord.width,
    height: printAreaRecord.height,
    rotation: printAreaRecord.rotation,
    locked: printAreaRecord.locked
  } : asPrintArea(view.printArea, defaultPrintArea(view.width, view.height));
  return {
    id: view.id,
    name: view.name,
    type: view.type,
    imageUrl: view.imageUrl,
    sortOrder: view.sortOrder,
    width: view.width,
    height: view.height,
    printArea,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt
  };
}
function serializeCustomizer(customizer) {
  return {
    id: customizer.id,
    storeId: customizer.storeId,
    shopifyProductId: customizer.shopifyProductId,
    enabled: customizer.enabled,
    name: customizer.name,
    configuration: mergeConfiguration(customizer.configuration),
    createdAt: customizer.createdAt,
    updatedAt: customizer.updatedAt,
    views: (customizer.views || []).slice().sort((a, b) => a.sortOrder - b.sortOrder).map(serializeView)
  };
}
const viewInclude = { printAreas: true };
async function listCustomizers(storeId) {
  const rows = await prisma.productCustomizer.findMany({
    where: { storeId },
    include: { views: { include: viewInclude } },
    orderBy: { updatedAt: "desc" }
  });
  return rows.map(serializeCustomizer);
}
async function getCustomizerByProduct(storeId, shopifyProductId) {
  const customizer = await prisma.productCustomizer.findUnique({
    where: {
      storeId_shopifyProductId: {
        storeId,
        shopifyProductId: toGid(shopifyProductId)
      }
    },
    include: { views: { include: viewInclude } }
  });
  return customizer ? serializeCustomizer(customizer) : null;
}
async function getCustomizerMap(storeId) {
  const rows = await prisma.productCustomizer.findMany({
    where: { storeId },
    select: {
      shopifyProductId: true,
      enabled: true,
      id: true,
      name: true
    }
  });
  return Object.fromEntries(
    rows.map((row) => [row.shopifyProductId, row])
  );
}
async function createDefaultView(customizerId, name = "Front", type = "front") {
  const printArea = defaultPrintArea();
  return prisma.productView.create({
    data: {
      customizerId,
      name,
      type,
      sortOrder: 0,
      width: 800,
      height: 800,
      printArea,
      printAreas: { create: printArea }
    },
    include: viewInclude
  });
}
async function upsertCustomizer(storeId, { shopifyProductId, name, enabled }) {
  const productGid = toGid(shopifyProductId);
  const existing = await prisma.productCustomizer.findUnique({
    where: {
      storeId_shopifyProductId: { storeId, shopifyProductId: productGid }
    }
  });
  if (existing) {
    const updated = await prisma.productCustomizer.update({
      where: { id: existing.id },
      data: {
        name: name || existing.name,
        enabled: enabled ?? existing.enabled
      },
      include: { views: { include: viewInclude } }
    });
    return serializeCustomizer(updated);
  }
  const created = await prisma.productCustomizer.create({
    data: {
      storeId,
      shopifyProductId: productGid,
      name: name || "Customizable product",
      enabled: Boolean(enabled),
      configuration: defaultCustomizerConfiguration()
    },
    include: { views: { include: viewInclude } }
  });
  if (!created.views.length) {
    await createDefaultView(created.id);
  }
  const withViews = await prisma.productCustomizer.findUnique({
    where: { id: created.id },
    include: { views: { include: viewInclude } }
  });
  return serializeCustomizer(withViews);
}
async function setCustomizerEnabled(storeId, shopifyProductId, enabled) {
  const customizer = await upsertCustomizer(storeId, {
    shopifyProductId,
    enabled
  });
  const updated = await prisma.productCustomizer.update({
    where: { id: customizer.id },
    data: { enabled: Boolean(enabled) },
    include: { views: { include: viewInclude } }
  });
  return serializeCustomizer(updated);
}
async function saveCustomizerConfiguration(storeId, shopifyProductId, payload) {
  const current = await upsertCustomizer(storeId, {
    shopifyProductId,
    name: payload.name
  });
  const configuration = mergeConfiguration(payload.configuration);
  await prisma.productCustomizer.update({
    where: { id: current.id },
    data: {
      name: payload.name || current.name,
      enabled: payload.enabled ?? current.enabled,
      configuration
    }
  });
  if (Array.isArray(payload.views)) {
    await syncViews(current.id, payload.views);
  }
  const saved = await prisma.productCustomizer.findUnique({
    where: { id: current.id },
    include: { views: { include: viewInclude } }
  });
  return serializeCustomizer(saved);
}
async function syncViews(customizerId, views) {
  const existing = await prisma.productView.findMany({
    where: { customizerId },
    include: viewInclude
  });
  const incomingIds = new Set(views.map((view) => view.id).filter(Boolean));
  const toDelete = existing.filter((view) => !incomingIds.has(view.id));
  if (toDelete.length) {
    await prisma.productView.deleteMany({
      where: { id: { in: toDelete.map((view) => view.id) } }
    });
  }
  for (const [index2, view] of views.entries()) {
    const printArea = asPrintArea(
      view.printArea,
      defaultPrintArea(view.width, view.height)
    );
    const data = {
      name: view.name || `View ${index2 + 1}`,
      type: view.type || "custom",
      imageUrl: view.imageUrl || null,
      sortOrder: Number.isFinite(view.sortOrder) ? view.sortOrder : index2,
      width: Number(view.width) || 800,
      height: Number(view.height) || 800,
      printArea
    };
    if (view.id && existing.some((row) => row.id === view.id)) {
      await prisma.productView.update({
        where: { id: view.id },
        data
      });
      const currentAreas = await prisma.printArea.findMany({
        where: { productViewId: view.id }
      });
      if (currentAreas[0]) {
        await prisma.printArea.update({
          where: { id: currentAreas[0].id },
          data: printArea
        });
      } else {
        await prisma.printArea.create({
          data: { productViewId: view.id, ...printArea }
        });
      }
    } else {
      await prisma.productView.create({
        data: {
          customizerId,
          ...data,
          printAreas: { create: printArea }
        }
      });
    }
  }
}
async function getDashboardStats(storeId) {
  const [customizableProducts, savedDesigns, customizations, recentCustomizations, recentCustomizers] = await Promise.all([
    prisma.productCustomizer.count({ where: { storeId, enabled: true } }),
    prisma.customizerTemplate.count({ where: { storeId } }),
    prisma.customization.count({ where: { storeId } }),
    prisma.customization.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      take: 8
    }),
    prisma.productCustomizer.findMany({
      where: { storeId },
      orderBy: { updatedAt: "desc" },
      take: 6
    })
  ]);
  return {
    customizableProducts,
    savedDesigns,
    customizations,
    recentCustomizations,
    recentCustomizers
  };
}
class StorageProvider {
  /**
   * @param {string} key
   * @param {Buffer|Uint8Array} _buffer
   * @param {string} _contentType
   * @returns {Promise<{ key: string, url: string }>}
   */
  async put(key, buffer, contentType) {
    throw new Error(
      `put() is not implemented for key ${key} (${contentType}, ${(buffer == null ? void 0 : buffer.length) || 0} bytes)`
    );
  }
  /**
   * @param {string} key
   * @returns {Promise<void>}
   */
  async delete(key) {
    throw new Error(`delete() is not implemented for key ${key}`);
  }
  /**
   * @param {string} key
   * @param {string} [appUrl]
   * @returns {string}
   */
  getPublicUrl(key, appUrl = "") {
    const normalized = String(key).replace(/^\/+/, "");
    const origin = String(appUrl || "").replace(/\/$/, "");
    return origin ? `${origin}/${normalized}` : `/${normalized}`;
  }
}
class LocalStorageProvider extends StorageProvider {
  constructor(rootDir = path.join(process.cwd(), "public", "uploads")) {
    super();
    __privateAdd(this, _LocalStorageProvider_instances);
    this.rootDir = rootDir;
    this.publicPrefix = "uploads";
  }
  async put(key, buffer) {
    const safeKey = __privateMethod(this, _LocalStorageProvider_instances, safeKey_fn).call(this, key);
    const absolute = path.join(this.rootDir, safeKey);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, buffer);
    return {
      key: `${this.publicPrefix}/${safeKey}`,
      url: `/${this.publicPrefix}/${safeKey}`
    };
  }
  async delete(key) {
    const withoutPrefix = String(key).replace(/^uploads\//, "");
    const safeKey = __privateMethod(this, _LocalStorageProvider_instances, safeKey_fn).call(this, withoutPrefix);
    const absolute = path.join(this.rootDir, safeKey);
    try {
      await fs.unlink(absolute);
    } catch (error) {
      if (error && error.code !== "ENOENT") throw error;
    }
  }
  getPublicUrl(key, appUrl = "") {
    const normalized = String(key).replace(/^\/+/, "");
    const withPrefix = normalized.startsWith("uploads/") ? normalized : `${this.publicPrefix}/${normalized}`;
    return super.getPublicUrl(withPrefix, appUrl);
  }
}
_LocalStorageProvider_instances = new WeakSet();
safeKey_fn = function(key) {
  const normalized = String(key).replace(/\\/g, "/").replace(/^\/+/, "").split("/").filter((part) => part && part !== "." && part !== "..").join("/");
  if (!normalized) {
    throw new Error("Invalid storage key.");
  }
  return normalized;
};
let storageSingleton;
function getStorage() {
  if (storageSingleton) return storageSingleton;
  storageSingleton = new LocalStorageProvider();
  return storageSingleton;
}
function absoluteAssetUrl(url, appUrl = "") {
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  const origin = String(appUrl || "").replace(/\/$/, "");
  if (!origin) return url;
  return `${origin}${url.startsWith("/") ? url : `/${url}`}`;
}
const PNG_SIGNATURE = [137, 80, 78, 71];
const JPEG_SIGNATURE = [255, 216, 255];
const SVG_DANGEROUS = /<script|on\w+\s*=|javascript:|xlink:href\s*=\s*["']\s*javascript/i;
const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/svg+xml",
  "image/webp"
];
function detectImageMime(buffer, declaredType = "") {
  if (!buffer || buffer.length < 4) return null;
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (PNG_SIGNATURE.every((value, index2) => bytes[index2] === value)) {
    return "image/png";
  }
  if (JPEG_SIGNATURE.every((value, index2) => bytes[index2] === value)) {
    return "image/jpeg";
  }
  if (bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70) {
    return "image/webp";
  }
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 256)).trim().toLowerCase();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) {
    return "image/svg+xml";
  }
  if (ALLOWED_IMAGE_TYPES.includes(declaredType)) {
    return declaredType === "image/jpg" ? "image/jpeg" : declaredType;
  }
  return null;
}
function isSafeSvg(svgText) {
  if (!svgText) return false;
  return !SVG_DANGEROUS.test(svgText);
}
function validateUpload({
  buffer,
  declaredType,
  filename,
  maxBytes,
  allowSvg = true
}) {
  const mime = detectImageMime(buffer, declaredType);
  if (!mime) {
    return { ok: false, error: "That file type is not supported." };
  }
  if (mime === "image/svg+xml" && !allowSvg) {
    return { ok: false, error: "SVG uploads are not enabled." };
  }
  if (buffer.length > maxBytes) {
    return { ok: false, error: "Your image is too large." };
  }
  if (mime === "image/svg+xml") {
    const text2 = new TextDecoder().decode(buffer);
    if (!isSafeSvg(text2)) {
      return { ok: false, error: "That SVG file contains unsupported content." };
    }
  }
  const extension = extensionForMime(mime, filename);
  return { ok: true, mime, extension };
}
function extensionForMime(mime, filename = "") {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/svg+xml") return "svg";
  const fromName = String(filename).split(".").pop();
  return fromName ? fromName.toLowerCase().replace(/[^a-z0-9]/g, "") : "bin";
}
function validateFontUpload({ buffer, declaredType, filename, maxBytes }) {
  const name = String(filename).toLowerCase();
  const allowed = name.endsWith(".woff2") || name.endsWith(".woff") || name.endsWith(".ttf") || name.endsWith(".otf") || ["font/woff2", "font/woff", "font/ttf", "application/font-woff"].includes(
    declaredType
  );
  if (!allowed) {
    return { ok: false, error: "That font format is not supported." };
  }
  if (buffer.length > maxBytes) {
    return { ok: false, error: "That font file is too large." };
  }
  return {
    ok: true,
    mime: declaredType || "font/woff2",
    extension: name.split(".").pop()
  };
}
function serializeAsset(asset, appUrl) {
  return {
    ...asset,
    url: absoluteAssetUrl(asset.url, appUrl),
    thumbnailUrl: asset.thumbnailUrl ? absoluteAssetUrl(asset.thumbnailUrl, appUrl) : null,
    metadata: parseJsonField(asset.metadata, {})
  };
}
async function listAssets(storeId, { type, category, appUrl } = {}) {
  const assets = await prisma.designAsset.findMany({
    where: {
      storeId,
      ...type ? { type } : {},
      ...category ? { category } : {}
    },
    orderBy: { createdAt: "desc" }
  });
  return assets.map((asset) => serializeAsset(asset, appUrl));
}
async function createAsset(store, file, { name, type, category, metadata, appUrl }) {
  const settings = parseJsonField(store.settings, defaultStoreSettings());
  const maxBytes = Math.max(1, Number(settings.maxUploadMb) || 8) * 1024 * 1024;
  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = file.name || "upload";
  const declaredType = file.type || "";
  const validation = type === "font" ? validateFontUpload({
    buffer,
    declaredType,
    filename,
    maxBytes
  }) : validateUpload({
    buffer,
    declaredType,
    filename,
    maxBytes,
    allowSvg: settings.allowSvg !== false
  });
  if (!validation.ok) {
    return { error: validation.error };
  }
  const key = `${store.id}/${type || "graphic"}/${crypto.randomUUID()}.${validation.extension}`;
  const stored = await getStorage().put(key, buffer, validation.mime);
  const asset = await prisma.designAsset.create({
    data: {
      storeId: store.id,
      name: name || filename.replace(/\.[^.]+$/, ""),
      type: type || "graphic",
      url: stored.url,
      thumbnailUrl: stored.url,
      category: category || "Other",
      metadata: {
        mime: validation.mime,
        size: buffer.length,
        originalName: filename,
        ...metadata || {}
      }
    }
  });
  return { asset: serializeAsset(asset, appUrl) };
}
async function deleteAsset(storeId, assetId) {
  const asset = await prisma.designAsset.findFirst({
    where: { id: assetId, storeId }
  });
  if (!asset) return false;
  await getStorage().delete(asset.url.replace(/^\//, ""));
  await prisma.designAsset.delete({ where: { id: asset.id } });
  return true;
}
async function listTemplates(storeId) {
  return prisma.customizerTemplate.findMany({
    where: { storeId },
    orderBy: { updatedAt: "desc" }
  });
}
async function createTemplate(storeId, { name, configuration }) {
  return prisma.customizerTemplate.create({
    data: {
      storeId,
      name: name || "Untitled template",
      configuration: configuration || {}
    }
  });
}
async function deleteTemplate(storeId, templateId) {
  const existing = await prisma.customizerTemplate.findFirst({
    where: { id: templateId, storeId }
  });
  if (!existing) return false;
  await prisma.customizerTemplate.delete({ where: { id: existing.id } });
  return true;
}
function logError(context, error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[product-customizer:${context}]`, message);
}
const USER_ERRORS = {
  configLoad: "Unable to load product configuration.",
  configSave: "Unable to save product configuration.",
  uploadFailed: "Image upload failed.",
  imageTooLarge: "Your image is too large.",
  invalidImage: "That file type is not supported.",
  saveCustomization: "Unable to save customization.",
  loadCustomization: "Unable to load customization.",
  notEnabled: "Product customizer is not enabled for this product.",
  previewFailed: "Unable to generate preview.",
  printFailed: "Unable to generate print file.",
  cartFailed: "Unable to add the customized product to the cart.",
  notFound: "The requested resource was not found.",
  unauthorized: "You are not authorized to perform this action."
};
const PRODUCTS_QUERY = `#graphql
  query CustomizerProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      pageInfo {
        hasNextPage
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
const PRODUCT_QUERY = `#graphql
  query CustomizerProduct($id: ID!) {
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
        values
      }
      variants(first: 50) {
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
            altText
          }
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
        customer {
          displayName
        }
        lineItems(first: 50) {
          nodes {
            title
            quantity
            variant {
              id
              title
            }
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
async function fetchShopifyProducts(admin, { query = "", after = null, first = 25 } = {}) {
  var _a2;
  const response = await admin.graphql(PRODUCTS_QUERY, {
    variables: { first, after, query: query || null }
  });
  const json = await response.json();
  if (json.errors) {
    logError("products.query", json.errors[0]);
    throw new Error("Unable to load products from Shopify.");
  }
  const products = (_a2 = json.data) == null ? void 0 : _a2.products;
  return {
    pageInfo: (products == null ? void 0 : products.pageInfo) || { hasNextPage: false, endCursor: null },
    nodes: ((products == null ? void 0 : products.nodes) || []).map((product) => {
      var _a3, _b, _c, _d, _e, _f, _g;
      return {
        id: product.id,
        numericId: toNumericId(product.id),
        title: product.title,
        handle: product.handle,
        status: product.status,
        imageUrl: ((_c = (_b = (_a3 = product.featuredMedia) == null ? void 0 : _a3.preview) == null ? void 0 : _b.image) == null ? void 0 : _c.url) || "",
        imageAlt: ((_f = (_e = (_d = product.featuredMedia) == null ? void 0 : _d.preview) == null ? void 0 : _e.image) == null ? void 0 : _f.altText) || product.title,
        variantCount: ((_g = product.variantsCount) == null ? void 0 : _g.count) || 0
      };
    })
  };
}
async function fetchShopifyProduct(admin, productId) {
  var _a2, _b, _c, _d, _e, _f, _g, _h;
  const response = await admin.graphql(PRODUCT_QUERY, {
    variables: { id: toGid(productId) }
  });
  const json = await response.json();
  if (json.errors) {
    logError("product.query", json.errors[0]);
    throw new Error("Unable to load product from Shopify.");
  }
  const product = (_a2 = json.data) == null ? void 0 : _a2.product;
  if (!product) return null;
  return {
    id: product.id,
    numericId: toNumericId(product.id),
    title: product.title,
    handle: product.handle,
    status: product.status,
    description: product.description,
    imageUrl: ((_d = (_c = (_b = product.featuredMedia) == null ? void 0 : _b.preview) == null ? void 0 : _c.image) == null ? void 0 : _d.url) || "",
    imageAlt: ((_g = (_f = (_e = product.featuredMedia) == null ? void 0 : _e.preview) == null ? void 0 : _f.image) == null ? void 0 : _g.altText) || product.title,
    options: product.options || [],
    variants: (((_h = product.variants) == null ? void 0 : _h.nodes) || []).map((variant) => {
      var _a3;
      return {
        id: variant.id,
        numericId: toNumericId(variant.id),
        title: variant.title,
        availableForSale: variant.availableForSale,
        price: variant.price,
        selectedOptions: variant.selectedOptions,
        imageUrl: ((_a3 = variant.image) == null ? void 0 : _a3.url) || ""
      };
    })
  };
}
async function fetchCustomizerOrders(admin, first = 40) {
  var _a2, _b;
  const response = await admin.graphql(ORDERS_QUERY, {
    variables: { first }
  });
  const json = await response.json();
  if (json.errors) {
    logError("orders.query", json.errors[0]);
    return [];
  }
  const orders = ((_b = (_a2 = json.data) == null ? void 0 : _a2.orders) == null ? void 0 : _b.nodes) || [];
  return orders.map((order) => {
    var _a3, _b2;
    const customizedItems = (((_a3 = order.lineItems) == null ? void 0 : _a3.nodes) || []).filter(
      (item) => (item.customAttributes || []).some(
        (attribute) => attribute.key === "_customizationId" || attribute.key === "Customization ID"
      )
    );
    return {
      id: order.id,
      name: order.name,
      createdAt: order.createdAt,
      financialStatus: order.displayFinancialStatus,
      fulfillmentStatus: order.displayFulfillmentStatus,
      customerName: ((_b2 = order.customer) == null ? void 0 : _b2.displayName) || "Guest",
      items: customizedItems.map((item) => {
        var _a4;
        const attributes = Object.fromEntries(
          (item.customAttributes || []).map((attribute) => [
            attribute.key,
            attribute.value
          ])
        );
        return {
          title: item.title,
          quantity: item.quantity,
          variantTitle: (_a4 = item.variant) == null ? void 0 : _a4.title,
          customizationId: attributes._customizationId || attributes["Customization ID"],
          previewUrl: attributes._previewUrl || attributes.Preview,
          color: attributes.Color
        };
      })
    };
  }).filter((order) => order.items.length > 0);
}
function createCustomizationPublicId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let token = "";
  for (const byte of bytes) {
    token += alphabet[byte % alphabet.length];
  }
  return `CUS-${token}`;
}
function serializeCustomization(row, appUrl) {
  if (!row) return null;
  return {
    id: row.id,
    publicId: row.publicId,
    storeId: row.storeId,
    shopifyProductId: row.shopifyProductId,
    shopifyVariantId: row.shopifyVariantId,
    customerId: row.customerId,
    configuration: row.configuration,
    previewUrl: absoluteAssetUrl(row.previewUrl, appUrl),
    printFileUrl: absoluteAssetUrl(row.printFileUrl, appUrl),
    quantity: row.quantity,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}
async function storeDataUrl(storeId, folder, dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|svg\+xml));base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const buffer = Buffer.from(match[2], "base64");
  const extension = mime.includes("svg") ? "svg" : mime.includes("jpeg") ? "jpg" : "png";
  const key = `${storeId}/${folder}/${crypto.randomUUID()}.${extension}`;
  const stored = await getStorage().put(key, buffer, mime);
  return stored.url;
}
async function createCustomization(store, payload, appUrl) {
  const publicId = payload.publicId || createCustomizationPublicId();
  const previewUrl = payload.previewUrl && !String(payload.previewUrl).startsWith("data:") ? payload.previewUrl : await storeDataUrl(store.id, "previews", payload.previewDataUrl || payload.previewUrl);
  const printFileUrl = payload.printFileUrl && !String(payload.printFileUrl).startsWith("data:") ? payload.printFileUrl : await storeDataUrl(store.id, "print-files", payload.printFileDataUrl || payload.printFileUrl);
  const row = await prisma.customization.create({
    data: {
      publicId,
      storeId: store.id,
      shopifyProductId: toGid(payload.shopifyProductId),
      shopifyVariantId: payload.shopifyVariantId ? toGid(payload.shopifyVariantId, "ProductVariant") : null,
      customerId: payload.customerId || null,
      configuration: payload.configuration || {},
      previewUrl,
      printFileUrl,
      quantity: Math.max(1, Number(payload.quantity) || 1)
    }
  });
  return serializeCustomization(row, appUrl);
}
async function updateCustomization(storeId, publicId, payload, appUrl) {
  const existing = await prisma.customization.findFirst({
    where: { storeId, publicId }
  });
  if (!existing) return null;
  const previewUrl = payload.previewDataUrl ? await storeDataUrl(storeId, "previews", payload.previewDataUrl) : payload.previewUrl ?? existing.previewUrl;
  const printFileUrl = payload.printFileDataUrl ? await storeDataUrl(storeId, "print-files", payload.printFileDataUrl) : payload.printFileUrl ?? existing.printFileUrl;
  const row = await prisma.customization.update({
    where: { id: existing.id },
    data: {
      shopifyVariantId: payload.shopifyVariantId ? toGid(payload.shopifyVariantId, "ProductVariant") : existing.shopifyVariantId,
      customerId: payload.customerId ?? existing.customerId,
      configuration: payload.configuration ?? existing.configuration,
      previewUrl,
      printFileUrl,
      quantity: payload.quantity ?? existing.quantity
    }
  });
  return serializeCustomization(row, appUrl);
}
async function getCustomizationByPublicId(storeId, publicId, appUrl) {
  const row = await prisma.customization.findFirst({
    where: { storeId, publicId }
  });
  return serializeCustomization(row, appUrl);
}
async function savePreview(store, payload, appUrl) {
  const existing = payload.publicId ? await prisma.customization.findFirst({
    where: { storeId: store.id, publicId: payload.publicId }
  }) : null;
  if (existing) {
    return updateCustomization(store.id, existing.publicId, payload, appUrl);
  }
  return createCustomization(store, payload, appUrl);
}
async function generatePreview(store, payload, appUrl) {
  const customization = await savePreview(
    store,
    {
      ...payload,
      previewDataUrl: payload.previewDataUrl || payload.imageDataUrl
    },
    appUrl
  );
  return {
    customizationId: customization.publicId,
    previewUrl: customization.previewUrl,
    customization
  };
}
async function generatePrintFile(store, payload, appUrl) {
  const publicId = payload.publicId || payload.customizationId;
  if (!publicId) {
    const created = await savePreview(
      store,
      {
        ...payload,
        printFileDataUrl: payload.printFileDataUrl || payload.imageDataUrl
      },
      appUrl
    );
    return {
      customizationId: created.publicId,
      printFileUrl: created.printFileUrl,
      customization: created
    };
  }
  const updated = await updateCustomization(
    store.id,
    publicId,
    {
      printFileDataUrl: payload.printFileDataUrl || payload.imageDataUrl,
      configuration: payload.configuration
    },
    appUrl
  );
  return {
    customizationId: updated == null ? void 0 : updated.publicId,
    printFileUrl: updated == null ? void 0 : updated.printFileUrl,
    customization: updated
  };
}
function requireFields(payload, fields) {
  const missing = fields.filter((field) => {
    const value = payload == null ? void 0 : payload[field];
    return value == null || value === "";
  });
  if (!missing.length) return null;
  return `Missing required field: ${missing.join(", ")}.`;
}
function validateConfigurationPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Configuration payload is invalid.";
  }
  if (payload.views && !Array.isArray(payload.views)) {
    return "Views must be an array.";
  }
  if (Array.isArray(payload.views)) {
    for (const view of payload.views) {
      if (!view.name) return "Each view needs a name.";
      if (view.type && !VIEW_TYPES.some((item) => item.value === view.type) && view.type !== "custom") {
        return `Unsupported view type: ${view.type}.`;
      }
      if (view.printArea) {
        const { x, y, width, height } = view.printArea;
        if ([x, y, width, height].some((value) => Number.isNaN(Number(value)))) {
          return "Print area coordinates must be numeric.";
        }
      }
    }
  }
  return null;
}
function validateCustomizationPayload(payload) {
  const missing = requireFields(payload, ["shopifyProductId", "configuration"]);
  if (missing) return missing;
  if (typeof payload.configuration !== "object") {
    return "Customization configuration must be an object.";
  }
  return null;
}
function validateAssetCategory(category) {
  if (!category) return "Other";
  return GRAPHIC_CATEGORIES.includes(category) ? category : "Other";
}
function storefrontCorsHeaders(request) {
  const origin = request.headers.get("Origin");
  const headers2 = new Headers();
  headers2.set("Access-Control-Allow-Origin", origin || "*");
  headers2.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  headers2.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );
  headers2.set("Access-Control-Max-Age", "86400");
  headers2.set("Vary", "Origin");
  return headers2;
}
function jsonWithCors(request, data, init = {}) {
  const headers2 = storefrontCorsHeaders(request);
  if (init.headers) {
    const extra = new Headers(init.headers);
    extra.forEach((value, key) => headers2.set(key, value));
  }
  return Response.json(data, { ...init, headers: headers2 });
}
function optionsResponse(request) {
  return new Response(null, {
    status: 204,
    headers: storefrontCorsHeaders(request)
  });
}
function apiError(message, status = 400, request, cors = false) {
  const body = { ok: false, error: message };
  if (cors && request) {
    return jsonWithCors(request, body, { status });
  }
  return Response.json(body, { status });
}
function apiOk(data, init = {}, request, cors = false) {
  const body = { ok: true, ...data };
  if (cors && request) {
    return jsonWithCors(request, body, init);
  }
  return Response.json(body, init);
}
function getAppUrl(request) {
  return process.env.SHOPIFY_APP_URL || new URL(request.url).origin;
}
function getShopFromRequest(request, fallbackShop) {
  const url = new URL(request.url);
  return parseShopDomain(
    fallbackShop || url.searchParams.get("shop") || request.headers.get("x-shop-domain") || ""
  );
}
async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
async function loadStorefrontProduct(shop, productId) {
  try {
    const { admin } = await unauthenticated.admin(shop);
    return await fetchShopifyProduct(admin, productId);
  } catch (error) {
    logError("storefront.product", error);
    return null;
  }
}
async function handleStorefrontApi(request, path2, { shop: shopOverride, cors = true } = {}) {
  if (request.method === "OPTIONS") {
    return optionsResponse(request);
  }
  const shop = getShopFromRequest(request, shopOverride);
  const appUrl = getAppUrl(request);
  const segments = String(path2 || "").split("/").filter(Boolean);
  try {
    if (!shop) {
      return apiError("Shop is required.", 400, request, cors);
    }
    if (segments[0] === "bootstrap") {
      const url = new URL(request.url);
      const productId = url.searchParams.get("product_id") || url.searchParams.get("productId");
      const store = await getStoreByShop(shop);
      if (!store) {
        return apiOk(
          { enabled: false, shop, appUrl, productId },
          {},
          request,
          cors
        );
      }
      const customizer = productId ? await getCustomizerByProduct(store.id, productId) : null;
      const shopifyProduct = productId ? await loadStorefrontProduct(shop, productId) : null;
      return apiOk(
        {
          shop,
          appUrl,
          productId: productId ? toGid(productId) : null,
          enabled: Boolean(customizer == null ? void 0 : customizer.enabled),
          customizer,
          product: shopifyProduct
        },
        {},
        request,
        cors
      );
    }
    if (segments[0] === "products" && segments[2] === "configuration") {
      const productId = segments[1];
      if (request.method === "GET") {
        const store = await getStoreByShop(shop);
        if (!store) {
          return apiError(USER_ERRORS.notEnabled, 404, request, cors);
        }
        const customizer = await getCustomizerByProduct(store.id, productId);
        if (!(customizer == null ? void 0 : customizer.enabled)) {
          return apiError(USER_ERRORS.notEnabled, 404, request, cors);
        }
        const shopifyProduct = await loadStorefrontProduct(shop, productId);
        const assets = await listAssets(store.id, { type: "graphic", appUrl });
        const fonts = await listAssets(store.id, { type: "font", appUrl });
        return apiOk(
          { customizer, product: shopifyProduct, assets, fonts, shop, appUrl },
          {},
          request,
          cors
        );
      }
    }
    if (segments[0] === "assets" && request.method === "GET") {
      const store = await getStoreByShop(shop);
      if (!store) return apiOk({ assets: [] }, {}, request, cors);
      const url = new URL(request.url);
      const assets = await listAssets(store.id, {
        type: url.searchParams.get("type") || "graphic",
        category: url.searchParams.get("category") || void 0,
        appUrl
      });
      return apiOk({ assets }, {}, request, cors);
    }
    if (segments[0] === "assets" && request.method === "POST") {
      const store = await getOrCreateStore(shop);
      const formData = await request.formData();
      const file = formData.get("file");
      if (!file || typeof file === "string") {
        return apiError("A file is required.", 400, request, cors);
      }
      const result = await createAsset(store, file, {
        name: String(formData.get("name") || ""),
        type: String(formData.get("type") || "upload"),
        category: validateAssetCategory(String(formData.get("category") || "Other")),
        appUrl
      });
      if (result.error) {
        return apiError(result.error, 400, request, cors);
      }
      return apiOk({ asset: result.asset }, { status: 201 }, request, cors);
    }
    if (segments[0] === "customizations" && segments[1] === "preview" && request.method === "POST") {
      const store = await getOrCreateStore(shop);
      const payload = await readJson(request);
      const preview = await generatePreview(store, payload, appUrl);
      return apiOk(preview, {}, request, cors);
    }
    if (segments[0] === "customizations" && segments[1] === "print-file" && request.method === "POST") {
      const store = await getOrCreateStore(shop);
      const payload = await readJson(request);
      const printFile = await generatePrintFile(store, payload, appUrl);
      return apiOk(printFile, {}, request, cors);
    }
    if (segments[0] === "customizations" && request.method === "POST" && !segments[1]) {
      const store = await getOrCreateStore(shop);
      const payload = await readJson(request);
      const invalid = validateCustomizationPayload(payload);
      if (invalid) return apiError(invalid, 400, request, cors);
      const customization = await createCustomization(store, payload, appUrl);
      return apiOk({ customization }, { status: 201 }, request, cors);
    }
    if (segments[0] === "customizations" && segments[1] && request.method === "GET") {
      const store = await getStoreByShop(shop);
      if (!store) return apiError(USER_ERRORS.notFound, 404, request, cors);
      const customization = await getCustomizationByPublicId(store.id, segments[1], appUrl);
      if (!customization) return apiError(USER_ERRORS.notFound, 404, request, cors);
      return apiOk({ customization }, {}, request, cors);
    }
    if (segments[0] === "customizations" && segments[1] && request.method === "PUT") {
      const store = await getStoreByShop(shop);
      if (!store) return apiError(USER_ERRORS.notFound, 404, request, cors);
      const payload = await readJson(request);
      const customization = await updateCustomization(store.id, segments[1], payload, appUrl);
      if (!customization) return apiError(USER_ERRORS.notFound, 404, request, cors);
      return apiOk({ customization }, {}, request, cors);
    }
    if (segments[0] === "cart" && segments[1] === "add" && request.method === "POST") {
      const payload = await readJson(request);
      if (!payload.customizationId || !payload.variantId) {
        return apiError("A customization ID and variant ID are required.", 400, request, cors);
      }
      return apiOk(
        {
          cartPayload: {
            id: payload.variantIdNumeric || payload.variantId,
            quantity: Math.max(1, Number(payload.quantity) || 1),
            properties: {
              _customizationId: payload.customizationId,
              "Customization ID": payload.customizationId,
              _previewUrl: payload.previewUrl || "",
              Preview: payload.previewUrl || "",
              Color: payload.color || "",
              View: payload.viewName || ""
            }
          }
        },
        {},
        request,
        cors
      );
    }
    return apiError(USER_ERRORS.notFound, 404, request, cors);
  } catch (error) {
    logError("storefront.api", error);
    return apiError("Something went wrong. Please try again.", 500, request, cors);
  }
}
async function handleAdminAssetUpload(store, request) {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return { error: "A file is required." };
  }
  return createAsset(store, file, {
    name: String(formData.get("name") || ""),
    type: String(formData.get("type") || "graphic"),
    category: validateAssetCategory(String(formData.get("category") || "Other")),
    appUrl: getAppUrl(request)
  });
}
function CustomizerCanvas(props) {
  const [Client, setClient] = useState(null);
  useEffect(() => {
    let active = true;
    import("./assets/CustomizerCanvas.client-9CyKfGv2.js").then((mod) => {
      if (active) setClient(() => mod.default);
    });
    return () => {
      active = false;
    };
  }, []);
  if (!Client) {
    return /* @__PURE__ */ jsx("div", { className: "canvas-skeleton", "aria-busy": "true", children: "Loading editor…" });
  }
  return /* @__PURE__ */ jsx(Client, { ...props });
}
function CanvasToolbar({
  canUndo,
  canRedo,
  zoom,
  onUndo,
  onRedo,
  onZoom,
  onDelete,
  onDuplicate,
  onAlign
}) {
  return /* @__PURE__ */ jsxs("div", { className: "canvas-toolbar", role: "toolbar", "aria-label": "Canvas tools", children: [
    /* @__PURE__ */ jsx("button", { type: "button", onClick: onUndo, disabled: !canUndo, title: "Undo", children: "Undo" }),
    /* @__PURE__ */ jsx("button", { type: "button", onClick: onRedo, disabled: !canRedo, title: "Redo", children: "Redo" }),
    /* @__PURE__ */ jsx("span", { className: "toolbar-divider" }),
    /* @__PURE__ */ jsx("button", { type: "button", onClick: () => onAlign("left"), title: "Align left", children: "Left" }),
    /* @__PURE__ */ jsx("button", { type: "button", onClick: () => onAlign("center"), title: "Align center", children: "Center" }),
    /* @__PURE__ */ jsx("button", { type: "button", onClick: () => onAlign("right"), title: "Align right", children: "Right" }),
    /* @__PURE__ */ jsx("span", { className: "toolbar-divider" }),
    /* @__PURE__ */ jsx("button", { type: "button", onClick: onDuplicate, title: "Duplicate", children: "Duplicate" }),
    /* @__PURE__ */ jsx("button", { type: "button", onClick: onDelete, title: "Delete", children: "Delete" }),
    /* @__PURE__ */ jsx("span", { className: "toolbar-divider" }),
    /* @__PURE__ */ jsx("button", { type: "button", onClick: () => onZoom(zoom - 0.1), title: "Zoom out", children: "−" }),
    /* @__PURE__ */ jsxs("span", { className: "zoom-label", children: [
      Math.round(zoom * 100),
      "%"
    ] }),
    /* @__PURE__ */ jsx("button", { type: "button", onClick: () => onZoom(zoom + 0.1), title: "Zoom in", children: "+" })
  ] });
}
function LayerManager({ layers, onSelect, onLayer, onLock, onHide, onDelete }) {
  const designLayers = (layers || []).filter(
    (layer) => !["background", "colorOverlay", "printArea", "guide"].includes(layer.type)
  );
  if (!designLayers.length) {
    return /* @__PURE__ */ jsx("div", { className: "layer-empty", children: "No design layers yet. Add text or a graphic to get started." });
  }
  return /* @__PURE__ */ jsx("ul", { className: "layer-list", children: designLayers.map((layer) => /* @__PURE__ */ jsxs("li", { children: [
    /* @__PURE__ */ jsx("button", { type: "button", className: "layer-name", onClick: () => onSelect(layer.id), children: layer.name }),
    /* @__PURE__ */ jsxs("div", { className: "layer-actions", children: [
      /* @__PURE__ */ jsx("button", { type: "button", title: "Move up", onClick: () => onLayer("up", layer.id), children: "↑" }),
      /* @__PURE__ */ jsx("button", { type: "button", title: "Move down", onClick: () => onLayer("down", layer.id), children: "↓" }),
      /* @__PURE__ */ jsx("button", { type: "button", title: "Bring to front", onClick: () => onLayer("front", layer.id), children: "⤒" }),
      /* @__PURE__ */ jsx("button", { type: "button", title: "Send to back", onClick: () => onLayer("back", layer.id), children: "⤓" }),
      /* @__PURE__ */ jsx("button", { type: "button", title: layer.locked ? "Unlock" : "Lock", onClick: () => onLock(layer.id), children: layer.locked ? "Unlock" : "Lock" }),
      /* @__PURE__ */ jsx("button", { type: "button", title: layer.visible ? "Hide" : "Show", onClick: () => onHide(layer.id), children: layer.visible === false ? "Show" : "Hide" }),
      /* @__PURE__ */ jsx("button", { type: "button", title: "Delete", onClick: () => onDelete(layer.id), children: "✕" })
    ] })
  ] }, layer.id)) });
}
const STARTER_GRAPHICS = [
  {
    id: "starter-star",
    name: "Star",
    category: "Symbols",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><polygon fill="#111111" points="32,4 40,24 62,24 44,38 52,58 32,46 12,58 20,38 2,24 24,24"/></svg>`
  },
  {
    id: "starter-heart",
    name: "Heart",
    category: "Symbols",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="#c81e1e" d="M32 58S6 40 6 22a14 14 0 0 1 26-7 14 14 0 0 1 26 7c0 18-26 36-26 36z"/></svg>`
  },
  {
    id: "starter-bolt",
    name: "Bolt",
    category: "Symbols",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><polygon fill="#eab308" points="38,2 18,36 32,36 24,62 50,26 34,26"/></svg>`
  },
  {
    id: "starter-circle",
    name: "Circle",
    category: "Shapes",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" fill="#1d4ed8"/></svg>`
  },
  {
    id: "starter-badge",
    name: "Badge",
    category: "Sports",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="#15803d" d="M32 4l10 8 12-2-2 12 8 10-8 10 2 12-12-2-10 8-10-8-12 2 2-12-8-10 8-10-2-12 12 2z"/></svg>`
  }
];
function svgDataUrl(svg) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
const ALL_FONTS = [...WEB_SAFE_FONTS, ...GOOGLE_FONTS];
function LeftPanel({
  product,
  variants,
  selectedVariantId,
  onVariantChange,
  colors,
  selectedColor,
  onColorChange,
  tools,
  assets,
  fonts,
  activeTool,
  onToolChange,
  onAddText,
  onAddGraphic,
  onAddQr,
  onAddNamesNumbers,
  onUpload,
  uploadProgress,
  uploadError,
  textProps,
  onTextPropsChange,
  layerManager
}) {
  const availableFonts = [
    ...ALL_FONTS,
    ...fonts.map((font) => font.name)
  ].filter((value, index2, list2) => list2.indexOf(value) === index2);
  return /* @__PURE__ */ jsxs("aside", { className: "customizer-left", children: [
    /* @__PURE__ */ jsxs("div", { className: "panel-section", children: [
      /* @__PURE__ */ jsx("h2", { children: "Product option" }),
      /* @__PURE__ */ jsxs("label", { children: [
        "Select product",
        /* @__PURE__ */ jsxs("select", { value: selectedVariantId, onChange: (event) => onVariantChange(event.target.value), children: [
          (variants || []).map((variant) => /* @__PURE__ */ jsx("option", { value: variant.id, children: variant.title }, variant.id)),
          !(variants == null ? void 0 : variants.length) && product ? /* @__PURE__ */ jsx("option", { value: product.id, children: product.title }) : null
        ] })
      ] }),
      (tools == null ? void 0 : tools.color) !== false ? /* @__PURE__ */ jsxs("div", { className: "color-grid", children: [
        /* @__PURE__ */ jsx("p", { children: "Edit color" }),
        /* @__PURE__ */ jsx("div", { className: "swatches", children: (colors || []).map((color) => /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: (selectedColor == null ? void 0 : selectedColor.hex) === color.hex ? "swatch active" : "swatch",
            style: { background: color.hex },
            title: color.name,
            "aria-label": color.name,
            onClick: () => onColorChange(color)
          },
          color.id || color.hex
        )) })
      ] }) : null
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "panel-section", children: [
      /* @__PURE__ */ jsx("h2", { children: "Add design object" }),
      /* @__PURE__ */ jsxs("div", { className: "tool-grid", children: [
        (tools == null ? void 0 : tools.text) !== false && /* @__PURE__ */ jsx("button", { type: "button", className: activeTool === "text" ? "active" : "", onClick: () => onToolChange("text"), children: "Add text" }),
        (tools == null ? void 0 : tools.graphic) !== false && /* @__PURE__ */ jsx("button", { type: "button", className: activeTool === "graphic" ? "active" : "", onClick: () => onToolChange("graphic"), children: "Add graphic" }),
        (tools == null ? void 0 : tools.qrCode) !== false && /* @__PURE__ */ jsx("button", { type: "button", className: activeTool === "qr" ? "active" : "", onClick: () => onToolChange("qr"), children: "Add QR code" }),
        (tools == null ? void 0 : tools.upload) !== false && /* @__PURE__ */ jsx("button", { type: "button", className: activeTool === "upload" ? "active" : "", onClick: () => onToolChange("upload"), children: "Upload file" }),
        (tools == null ? void 0 : tools.namesNumbers) !== false && /* @__PURE__ */ jsx("button", { type: "button", className: activeTool === "names" ? "active" : "", onClick: () => onToolChange("names"), children: "Names or #s" }),
        (tools == null ? void 0 : tools.designIdeas) !== false && /* @__PURE__ */ jsx("button", { type: "button", className: activeTool === "ideas" ? "active" : "", onClick: () => onToolChange("ideas"), children: "Design ideas" })
      ] })
    ] }),
    activeTool === "text" && /* @__PURE__ */ jsxs("div", { className: "panel-section", children: [
      /* @__PURE__ */ jsx("h3", { children: "Text" }),
      /* @__PURE__ */ jsxs("label", { children: [
        "Content",
        /* @__PURE__ */ jsx(
          "textarea",
          {
            value: textProps.text,
            onChange: (event) => onTextPropsChange({ ...textProps, text: event.target.value })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("label", { children: [
        "Font",
        /* @__PURE__ */ jsx(
          "select",
          {
            value: textProps.fontFamily,
            onChange: (event) => onTextPropsChange({ ...textProps, fontFamily: event.target.value }),
            children: availableFonts.map((font) => /* @__PURE__ */ jsx("option", { value: font, children: font }, font))
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("label", { children: [
        "Size",
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "number",
            min: "8",
            max: "200",
            value: textProps.fontSize,
            onChange: (event) => onTextPropsChange({ ...textProps, fontSize: Number(event.target.value) })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("label", { children: [
        "Color",
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "color",
            value: textProps.fill,
            onChange: (event) => onTextPropsChange({ ...textProps, fill: event.target.value })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "inline-actions", children: [
        /* @__PURE__ */ jsx("button", { type: "button", className: textProps.fontWeight === "bold" ? "active" : "", onClick: () => onTextPropsChange({ ...textProps, fontWeight: textProps.fontWeight === "bold" ? "normal" : "bold" }), children: "Bold" }),
        /* @__PURE__ */ jsx("button", { type: "button", className: textProps.fontStyle === "italic" ? "active" : "", onClick: () => onTextPropsChange({ ...textProps, fontStyle: textProps.fontStyle === "italic" ? "normal" : "italic" }), children: "Italic" }),
        /* @__PURE__ */ jsx("button", { type: "button", className: textProps.underline ? "active" : "", onClick: () => onTextPropsChange({ ...textProps, underline: !textProps.underline }), children: "Underline" })
      ] }),
      /* @__PURE__ */ jsxs("label", { children: [
        "Alignment",
        /* @__PURE__ */ jsxs(
          "select",
          {
            value: textProps.textAlign,
            onChange: (event) => onTextPropsChange({ ...textProps, textAlign: event.target.value }),
            children: [
              /* @__PURE__ */ jsx("option", { value: "left", children: "Left" }),
              /* @__PURE__ */ jsx("option", { value: "center", children: "Center" }),
              /* @__PURE__ */ jsx("option", { value: "right", children: "Right" })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("label", { children: [
        "Letter spacing",
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "number",
            value: textProps.charSpacing,
            onChange: (event) => onTextPropsChange({ ...textProps, charSpacing: Number(event.target.value) })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("label", { children: [
        "Line height",
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "number",
            step: "0.05",
            value: textProps.lineHeight,
            onChange: (event) => onTextPropsChange({ ...textProps, lineHeight: Number(event.target.value) })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("label", { children: [
        "Rotation",
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "number",
            value: textProps.angle,
            onChange: (event) => onTextPropsChange({ ...textProps, angle: Number(event.target.value) })
          }
        )
      ] }),
      /* @__PURE__ */ jsx("button", { type: "button", className: "primary", onClick: onAddText, children: "Add text to design" })
    ] }),
    activeTool === "graphic" && /* @__PURE__ */ jsxs("div", { className: "panel-section", children: [
      /* @__PURE__ */ jsx("h3", { children: "Graphics" }),
      GRAPHIC_CATEGORIES.map((category) => {
        const items = [
          ...STARTER_GRAPHICS.filter((item) => item.category === category),
          ...assets.filter((asset) => asset.category === category)
        ];
        if (!items.length) return null;
        return /* @__PURE__ */ jsxs("div", { className: "graphic-group", children: [
          /* @__PURE__ */ jsx("h4", { children: category }),
          /* @__PURE__ */ jsx("div", { className: "graphic-grid", children: items.map((item) => /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => onAddGraphic(item.svg ? svgDataUrl(item.svg) : item.url, item.name),
              children: /* @__PURE__ */ jsx("img", { src: item.svg ? svgDataUrl(item.svg) : item.thumbnailUrl || item.url, alt: item.name })
            },
            item.id
          )) })
        ] }, category);
      })
    ] }),
    activeTool === "qr" && /* @__PURE__ */ jsx(QrForm, { onAdd: onAddQr }),
    activeTool === "upload" && /* @__PURE__ */ jsxs("div", { className: "panel-section", children: [
      /* @__PURE__ */ jsx("h3", { children: "Upload file" }),
      /* @__PURE__ */ jsx("p", { children: "PNG, JPG, or SVG. Max size is set by the merchant." }),
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "file",
          accept: "image/png,image/jpeg,image/svg+xml",
          onChange: (event) => {
            var _a2;
            const file = (_a2 = event.target.files) == null ? void 0 : _a2[0];
            if (file) onUpload(file);
          }
        }
      ),
      uploadProgress > 0 && uploadProgress < 100 ? /* @__PURE__ */ jsx("div", { className: "progress", "aria-valuenow": uploadProgress, children: /* @__PURE__ */ jsx("span", { style: { width: `${uploadProgress}%` } }) }) : null,
      uploadError ? /* @__PURE__ */ jsx("p", { className: "error", children: uploadError }) : null
    ] }),
    activeTool === "names" && /* @__PURE__ */ jsx(NamesForm, { onAdd: onAddNamesNumbers, fonts: availableFonts }),
    activeTool === "ideas" && /* @__PURE__ */ jsxs("div", { className: "panel-section", children: [
      /* @__PURE__ */ jsx("h3", { children: "Design ideas" }),
      /* @__PURE__ */ jsx("p", { children: "Start with a simple layout, then customize it." }),
      /* @__PURE__ */ jsx("button", { type: "button", onClick: () => onAddText("CUSTOM"), children: "Bold wordmark" }),
      /* @__PURE__ */ jsx("button", { type: "button", onClick: () => onAddNamesNumbers({ name: "PLAYER", number: "10" }), children: "Name and number" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "panel-section", children: [
      /* @__PURE__ */ jsx("h2", { children: "Layers" }),
      layerManager
    ] })
  ] });
}
function QrForm({ onAdd }) {
  const kinds = [
    { id: "url", label: "URL", placeholder: "https://" },
    { id: "text", label: "Text", placeholder: "Your message" },
    { id: "email", label: "Email", placeholder: "name@example.com" },
    { id: "phone", label: "Phone", placeholder: "+1 555 0100" }
  ];
  return /* @__PURE__ */ jsxs(
    "form",
    {
      className: "panel-section",
      onSubmit: (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const kind = String(data.get("kind") || "url");
        const value = String(data.get("value") || "");
        const encoded = kind === "email" ? `mailto:${value}` : kind === "phone" ? `tel:${value}` : value;
        onAdd({ kind, value: encoded });
      },
      children: [
        /* @__PURE__ */ jsx("h3", { children: "QR code" }),
        /* @__PURE__ */ jsxs("label", { children: [
          "Type",
          /* @__PURE__ */ jsx("select", { name: "kind", defaultValue: "url", children: kinds.map((kind) => /* @__PURE__ */ jsx("option", { value: kind.id, children: kind.label }, kind.id)) })
        ] }),
        /* @__PURE__ */ jsxs("label", { children: [
          "Content",
          /* @__PURE__ */ jsx("input", { name: "value", required: true, placeholder: "https://your-site.com" })
        ] }),
        /* @__PURE__ */ jsx("button", { type: "submit", className: "primary", children: "Add QR code" })
      ]
    }
  );
}
function NamesForm({ onAdd, fonts }) {
  return /* @__PURE__ */ jsxs(
    "form",
    {
      className: "panel-section",
      onSubmit: (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onAdd({
          name: String(data.get("name") || "NAME"),
          number: String(data.get("number") || "00"),
          fill: String(data.get("fill") || "#111111"),
          fontFamily: String(data.get("fontFamily") || "Arial"),
          fontSize: Number(data.get("fontSize") || 28)
        });
      },
      children: [
        /* @__PURE__ */ jsx("h3", { children: "Names or #s" }),
        /* @__PURE__ */ jsxs("label", { children: [
          "Name",
          /* @__PURE__ */ jsx("input", { name: "name", defaultValue: "AKHIL" })
        ] }),
        /* @__PURE__ */ jsxs("label", { children: [
          "Number",
          /* @__PURE__ */ jsx("input", { name: "number", defaultValue: "10" })
        ] }),
        /* @__PURE__ */ jsxs("label", { children: [
          "Font",
          /* @__PURE__ */ jsx("select", { name: "fontFamily", defaultValue: "Arial", children: fonts.map((font) => /* @__PURE__ */ jsx("option", { value: font, children: font }, font)) })
        ] }),
        /* @__PURE__ */ jsxs("label", { children: [
          "Color",
          /* @__PURE__ */ jsx("input", { type: "color", name: "fill", defaultValue: "#111111" })
        ] }),
        /* @__PURE__ */ jsxs("label", { children: [
          "Size",
          /* @__PURE__ */ jsx("input", { type: "number", name: "fontSize", defaultValue: "28", min: "10" })
        ] }),
        /* @__PURE__ */ jsx("button", { type: "submit", className: "primary", children: "Add to design" })
      ]
    }
  );
}
function RightViews({ views, activeViewId, onSelect }) {
  return /* @__PURE__ */ jsxs("aside", { className: "customizer-right", children: [
    /* @__PURE__ */ jsx("h2", { children: "Views" }),
    /* @__PURE__ */ jsx("div", { className: "view-list", children: (views || []).map((view) => /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        className: view.id === activeViewId ? "view-thumb active" : "view-thumb",
        onClick: () => onSelect(view.id),
        children: [
          view.imageUrl ? /* @__PURE__ */ jsx("img", { src: view.imageUrl, alt: view.name }) : /* @__PURE__ */ jsx("span", { children: view.name }),
          /* @__PURE__ */ jsx("strong", { children: view.name })
        ]
      },
      view.id
    )) })
  ] });
}
function CartBar({
  quantity,
  onQuantityChange,
  price,
  saving,
  adding,
  error,
  onSave,
  onAddToCart,
  minQuantity = 1,
  maxQuantity = 99
}) {
  return /* @__PURE__ */ jsxs("div", { className: "cart-bar", children: [
    /* @__PURE__ */ jsxs("label", { className: "qty", children: [
      "Qty",
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "number",
          min: minQuantity,
          max: maxQuantity,
          value: quantity,
          onChange: (event) => onQuantityChange(Number(event.target.value))
        }
      )
    ] }),
    /* @__PURE__ */ jsx("div", { className: "cart-price", children: price }),
    error ? /* @__PURE__ */ jsx("p", { className: "error", children: error }) : null,
    /* @__PURE__ */ jsx("button", { type: "button", className: "ghost", onClick: onSave, disabled: saving, children: saving ? "Saving…" : "Save design" }),
    /* @__PURE__ */ jsx("button", { type: "button", className: "primary", onClick: onAddToCart, disabled: adding, children: adding ? "Adding…" : "Add to cart" })
  ] });
}
const DEFAULT_TEXT = {
  text: "Your text",
  fontFamily: "Arial",
  fontSize: 32,
  fill: "#111111",
  fontWeight: "normal",
  fontStyle: "normal",
  underline: false,
  textAlign: "left",
  charSpacing: 0,
  lineHeight: 1.16,
  angle: 0
};
async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.ok === false) {
    throw new Error(json.error || "Request failed.");
  }
  return json;
}
function CustomizerApp({
  shop,
  appUrl,
  customizer,
  product,
  assets,
  fonts,
  apiBase
}) {
  var _a2, _b, _c, _d, _e, _f, _g, _h;
  const canvasRef = useRef(null);
  const views = (customizer == null ? void 0 : customizer.views) || [];
  const configuration = (customizer == null ? void 0 : customizer.configuration) || {};
  const [activeViewId, setActiveViewId] = useState((_a2 = views[0]) == null ? void 0 : _a2.id);
  const [viewStates, setViewStates] = useState({});
  const [activeTool, setActiveTool] = useState("text");
  const [mobilePanel, setMobilePanel] = useState(null);
  const [textProps, setTextProps] = useState(DEFAULT_TEXT);
  const [selectedColor, setSelectedColor] = useState(((_b = configuration.colors) == null ? void 0 : _b[0]) || null);
  const [selectedVariantId, setSelectedVariantId] = useState(((_d = (_c = product == null ? void 0 : product.variants) == null ? void 0 : _c[0]) == null ? void 0 : _d.id) || "");
  const [quantity, setQuantity] = useState(((_e = configuration.customerOptions) == null ? void 0 : _e.minQuantity) || 1);
  const [layers, setLayers] = useState([]);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [publicId, setPublicId] = useState("");
  const activeView = views.find((view) => view.id === activeViewId) || views[0];
  const variant = ((product == null ? void 0 : product.variants) || []).find((item) => item.id === selectedVariantId);
  const colorImageUrl = (selectedColor == null ? void 0 : selectedColor.imageUrl) || null;
  const tools = configuration.tools || {};
  const priceLabel = useMemo(() => {
    var _a3;
    const base = Number((variant == null ? void 0 : variant.price) || ((_a3 = configuration.pricing) == null ? void 0 : _a3.basePrice) || 0);
    return base ? `$${base.toFixed(2)}` : "Add to cart";
  }, [variant, configuration.pricing]);
  useEffect(() => {
    document.body.classList.add("customizer-page");
    return () => document.body.classList.remove("customizer-page");
  }, []);
  useEffect(() => {
    const families = [
      textProps.fontFamily,
      ...(fonts || []).map((font) => font.name) || []
    ];
    const google = families.filter(
      (family) => ["Anton", "Bebas Neue", "Lato", "Montserrat", "Oswald", "Playfair Display", "Poppins", "Roboto", "Source Sans 3"].includes(family)
    );
    if (!google.length) return void 0;
    const id = "customizer-fonts";
    let link = document.getElementById(id);
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = `https://fonts.googleapis.com/css2?${google.map((family) => `family=${encodeURIComponent(family)}`).join("&")}&display=swap`;
    return void 0;
  }, [textProps.fontFamily, fonts]);
  const persistActiveView = () => {
    if (!activeView || !canvasRef.current) return;
    setViewStates((current) => ({
      ...current,
      [activeView.id]: canvasRef.current.getJSON()
    }));
  };
  const switchView = async (viewId) => {
    var _a3;
    persistActiveView();
    setActiveViewId(viewId);
    const next = viewStates[viewId];
    if (next) {
      await ((_a3 = canvasRef.current) == null ? void 0 : _a3.loadJSON(next));
    }
  };
  const endpoint = (path2) => {
    const base = apiBase || `${appUrl}/api/storefront`;
    const url = new URL(`${base}${path2.startsWith("/") ? path2 : `/${path2}`}`);
    url.searchParams.set("shop", shop);
    return url.toString();
  };
  const collectConfiguration = async () => {
    var _a3;
    persistActiveView();
    const currentJson = (_a3 = canvasRef.current) == null ? void 0 : _a3.getJSON();
    const states = { ...viewStates, [activeView == null ? void 0 : activeView.id]: currentJson };
    return {
      selectedColor,
      selectedVariantId,
      quantity,
      views: views.map((view) => ({
        id: view.id,
        name: view.name,
        type: view.type,
        canvas: states[view.id] || null
      }))
    };
  };
  const saveDesign = async ({ withPreview = true, withPrint = false } = {}) => {
    var _a3, _b2, _c2;
    setSaving(true);
    setError("");
    try {
      const configurationPayload = await collectConfiguration();
      let previewDataUrl = null;
      let printFileDataUrl = null;
      if (withPreview) previewDataUrl = await ((_a3 = canvasRef.current) == null ? void 0 : _a3.exportPreview());
      if (withPrint) {
        printFileDataUrl = await ((_c2 = canvasRef.current) == null ? void 0 : _c2.exportPrintFile({
          dpi: ((_b2 = configuration.print) == null ? void 0 : _b2.dpi) || 300
        }));
      }
      const payload = {
        publicId: publicId || void 0,
        shopifyProductId: customizer.shopifyProductId,
        shopifyVariantId: selectedVariantId,
        quantity,
        configuration: configurationPayload,
        previewDataUrl,
        printFileDataUrl
      };
      const json = publicId ? await apiRequest(endpoint(`/customizations/${publicId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }) : await apiRequest(endpoint("/customizations"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const saved = json.customization;
      setPublicId(saved.publicId);
      return saved;
    } catch (err) {
      setError(err.message || "Unable to save customization.");
      return null;
    } finally {
      setSaving(false);
    }
  };
  const addToCart = async () => {
    setAdding(true);
    setError("");
    try {
      const saved = await saveDesign({ withPreview: true, withPrint: true });
      if (!saved) return;
      const variantNumeric = toNumericId(selectedVariantId);
      const cartBody = {
        items: [
          {
            id: Number(variantNumeric),
            quantity,
            properties: {
              _customizationId: saved.publicId,
              "Customization ID": saved.publicId,
              _previewUrl: saved.previewUrl || "",
              Preview: saved.previewUrl || "",
              Color: (selectedColor == null ? void 0 : selectedColor.name) || "",
              View: (activeView == null ? void 0 : activeView.name) || ""
            }
          }
        ]
      };
      const sameOriginCart = await fetch("/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cartBody)
      }).catch(() => null);
      if (sameOriginCart == null ? void 0 : sameOriginCart.ok) {
        window.dispatchEvent(new Event("cart:updated"));
        window.location.href = "/cart";
        return;
      }
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          {
            source: "product-customizer",
            type: "ADD_TO_CART",
            payload: cartBody
          },
          "*"
        );
        return;
      }
      const form2 = document.createElement("form");
      form2.method = "POST";
      form2.action = `https://${shop}/cart/add`;
      form2.target = "_top";
      const fields = {
        id: variantNumeric,
        quantity: String(quantity),
        "properties[_customizationId]": saved.publicId,
        "properties[Customization ID]": saved.publicId,
        "properties[_previewUrl]": saved.previewUrl || "",
        "properties[Preview]": saved.previewUrl || "",
        "properties[Color]": (selectedColor == null ? void 0 : selectedColor.name) || ""
      };
      Object.entries(fields).forEach(([name, value]) => {
        const input2 = document.createElement("input");
        input2.type = "hidden";
        input2.name = name;
        input2.value = value;
        form2.appendChild(input2);
      });
      document.body.appendChild(form2);
      form2.submit();
    } catch (err) {
      setError(err.message || "Unable to add the customized product to the cart.");
    } finally {
      setAdding(false);
    }
  };
  const handleUpload = async (file) => {
    var _a3;
    setUploadError("");
    setUploadProgress(15);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "upload");
      formData.append("name", file.name);
      setUploadProgress(45);
      const json = await apiRequest(endpoint("/assets"), {
        method: "POST",
        body: formData
      });
      setUploadProgress(100);
      await ((_a3 = canvasRef.current) == null ? void 0 : _a3.addImage(json.asset.url, { name: json.asset.name, customType: "upload" }));
    } catch (err) {
      setUploadError(err.message || "Image upload failed.");
    } finally {
      setTimeout(() => setUploadProgress(0), 400);
    }
  };
  if (!(customizer == null ? void 0 : customizer.enabled)) {
    return /* @__PURE__ */ jsx("div", { className: "customizer-error", children: "Product customizer is not enabled for this product." });
  }
  const left = /* @__PURE__ */ jsx(
    LeftPanel,
    {
      product,
      variants: (product == null ? void 0 : product.variants) || [],
      selectedVariantId,
      onVariantChange: setSelectedVariantId,
      colors: configuration.colors || [],
      selectedColor,
      onColorChange: setSelectedColor,
      tools,
      assets: assets || [],
      fonts: fonts || [],
      activeTool,
      onToolChange: setActiveTool,
      textProps,
      onTextPropsChange: (next) => {
        var _a3;
        setTextProps(next);
        (_a3 = canvasRef.current) == null ? void 0 : _a3.updateActive({
          text: next.text,
          fontFamily: next.fontFamily,
          fontSize: next.fontSize,
          fill: next.fill,
          fontWeight: next.fontWeight,
          fontStyle: next.fontStyle,
          underline: next.underline,
          textAlign: next.textAlign,
          charSpacing: next.charSpacing,
          lineHeight: next.lineHeight,
          angle: next.angle
        });
      },
      onAddText: (preset) => {
        var _a3;
        return (_a3 = canvasRef.current) == null ? void 0 : _a3.addText({
          ...textProps,
          text: typeof preset === "string" ? preset : textProps.text
        });
      },
      onAddGraphic: (url, name) => {
        var _a3;
        return (_a3 = canvasRef.current) == null ? void 0 : _a3.addImage(url, { name, customType: "graphic" });
      },
      onAddQr: (payload) => {
        var _a3;
        return (_a3 = canvasRef.current) == null ? void 0 : _a3.addQrCode(payload);
      },
      onAddNamesNumbers: (payload) => {
        var _a3;
        return (_a3 = canvasRef.current) == null ? void 0 : _a3.addNamesNumbers(payload);
      },
      onUpload: handleUpload,
      uploadProgress,
      uploadError,
      layerManager: /* @__PURE__ */ jsx(
        LayerManager,
        {
          layers,
          onSelect: (id) => {
            var _a3;
            return (_a3 = canvasRef.current) == null ? void 0 : _a3.selectLayer(id);
          },
          onLayer: (action2, id) => {
            var _a3;
            return (_a3 = canvasRef.current) == null ? void 0 : _a3.layer(action2, id);
          },
          onLock: (id) => {
            var _a3;
            return (_a3 = canvasRef.current) == null ? void 0 : _a3.toggleLock(id);
          },
          onHide: (id) => {
            var _a3;
            return (_a3 = canvasRef.current) == null ? void 0 : _a3.toggleVisible(id);
          },
          onDelete: (id) => {
            var _a3;
            return (_a3 = canvasRef.current) == null ? void 0 : _a3.deleteLayer(id);
          }
        }
      )
    }
  );
  return /* @__PURE__ */ jsxs("div", { className: `customizer-shell ${mobilePanel ? "sheet-open" : ""}`, children: [
    /* @__PURE__ */ jsx("div", { className: "customizer-left-slot", children: left }),
    /* @__PURE__ */ jsxs("main", { className: "customizer-center", children: [
      /* @__PURE__ */ jsx(
        CanvasToolbar,
        {
          canUndo: history.canUndo,
          canRedo: history.canRedo,
          zoom,
          onUndo: () => {
            var _a3;
            return (_a3 = canvasRef.current) == null ? void 0 : _a3.undo();
          },
          onRedo: () => {
            var _a3;
            return (_a3 = canvasRef.current) == null ? void 0 : _a3.redo();
          },
          onZoom: (value) => {
            var _a3;
            const next = Math.max(0.4, Math.min(2.5, value));
            setZoom(next);
            (_a3 = canvasRef.current) == null ? void 0 : _a3.zoom(next);
          },
          onDelete: () => {
            var _a3;
            return (_a3 = canvasRef.current) == null ? void 0 : _a3.deleteActive();
          },
          onDuplicate: () => {
            var _a3;
            return (_a3 = canvasRef.current) == null ? void 0 : _a3.duplicateActive();
          },
          onAlign: (direction) => {
            var _a3;
            return (_a3 = canvasRef.current) == null ? void 0 : _a3.align(direction);
          }
        }
      ),
      /* @__PURE__ */ jsx(
        CustomizerCanvas,
        {
          ref: canvasRef,
          width: (activeView == null ? void 0 : activeView.width) || 800,
          height: (activeView == null ? void 0 : activeView.height) || 800,
          backgroundImage: (activeView == null ? void 0 : activeView.imageUrl) || (product == null ? void 0 : product.imageUrl),
          printArea: activeView == null ? void 0 : activeView.printArea,
          allowOverflow: Boolean((_f = configuration.customerOptions) == null ? void 0 : _f.allowOverflow),
          productColor: selectedColor == null ? void 0 : selectedColor.hex,
          colorMode: configuration.colorMode || "tint",
          colorImageUrl,
          onLayersChange: setLayers,
          onHistoryChange: setHistory
        }
      )
    ] }),
    /* @__PURE__ */ jsx(RightViews, { views, activeViewId: activeView == null ? void 0 : activeView.id, onSelect: switchView }),
    /* @__PURE__ */ jsx(
      CartBar,
      {
        quantity,
        onQuantityChange: setQuantity,
        price: priceLabel,
        saving,
        adding,
        error,
        onSave: () => saveDesign({ withPreview: true }),
        onAddToCart: addToCart,
        minQuantity: ((_g = configuration.customerOptions) == null ? void 0 : _g.minQuantity) || 1,
        maxQuantity: ((_h = configuration.customerOptions) == null ? void 0 : _h.maxQuantity) || 99
      }
    ),
    /* @__PURE__ */ jsxs("nav", { className: "mobile-toolbar", children: [
      /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setMobilePanel("tools"), children: "Tools" }),
      /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setMobilePanel("views"), children: "Views" }),
      /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setMobilePanel("layers"), children: "Layers" })
    ] }),
    mobilePanel ? /* @__PURE__ */ jsxs("div", { className: "bottom-sheet", children: [
      /* @__PURE__ */ jsx("button", { type: "button", className: "sheet-close", onClick: () => setMobilePanel(null), children: "Close" }),
      mobilePanel === "tools" ? left : null,
      mobilePanel === "views" ? /* @__PURE__ */ jsx(RightViews, { views, activeViewId: activeView == null ? void 0 : activeView.id, onSelect: switchView }) : null,
      mobilePanel === "layers" ? /* @__PURE__ */ jsx(
        LayerManager,
        {
          layers,
          onSelect: (id) => {
            var _a3;
            return (_a3 = canvasRef.current) == null ? void 0 : _a3.selectLayer(id);
          },
          onLayer: (action2, id) => {
            var _a3;
            return (_a3 = canvasRef.current) == null ? void 0 : _a3.layer(action2, id);
          },
          onLock: (id) => {
            var _a3;
            return (_a3 = canvasRef.current) == null ? void 0 : _a3.toggleLock(id);
          },
          onHide: (id) => {
            var _a3;
            return (_a3 = canvasRef.current) == null ? void 0 : _a3.toggleVisible(id);
          },
          onDelete: (id) => {
            var _a3;
            return (_a3 = canvasRef.current) == null ? void 0 : _a3.deleteLayer(id);
          }
        }
      ) : null
    ] }) : null
  ] });
}
const customizerStyles = "/assets/customizer-Bp7KLCSH.css";
const links$1 = () => [{
  rel: "stylesheet",
  href: customizerStyles
}];
const loader$i = async ({
  request,
  params
}) => {
  const url = new URL(request.url);
  const shop = parseShopDomain(url.searchParams.get("shop"));
  const appUrl = getAppUrl(request);
  if (!shop) {
    return {
      error: "Shop is required.",
      shop: "",
      appUrl,
      customizer: null,
      product: null,
      assets: [],
      fonts: []
    };
  }
  const store = await getStoreByShop(shop);
  if (!store) {
    return {
      error: "Product customizer is not enabled for this product.",
      shop,
      appUrl,
      customizer: null,
      product: null,
      assets: [],
      fonts: []
    };
  }
  const customizer = await getCustomizerByProduct(store.id, params.productId);
  let product = null;
  try {
    const {
      admin
    } = await unauthenticated.admin(shop);
    product = await fetchShopifyProduct(admin, params.productId);
  } catch (error) {
    logError("storefront.product", error);
  }
  const [assets, fonts] = await Promise.all([listAssets(store.id, {
    type: "graphic",
    appUrl
  }), listAssets(store.id, {
    type: "font",
    appUrl
  })]);
  return {
    error: (customizer == null ? void 0 : customizer.enabled) ? null : "Product customizer is not enabled for this product.",
    shop,
    appUrl,
    customizer,
    product,
    assets,
    fonts
  };
};
const headers$a = () => ({
  "Content-Security-Policy": "frame-ancestors https://*.myshopify.com https://admin.shopify.com https://*.shopify.com;"
});
const storefront_$productId = UNSAFE_withComponentProps(function StorefrontCustomizer() {
  const data = useLoaderData();
  if (data.error || !data.customizer) {
    return /* @__PURE__ */ jsx("div", {
      className: "customizer-error",
      children: data.error || "Unable to load product configuration."
    });
  }
  return /* @__PURE__ */ jsx(CustomizerApp, {
    shop: data.shop,
    appUrl: data.appUrl,
    customizer: data.customizer,
    product: data.product,
    assets: data.assets,
    fonts: data.fonts,
    apiBase: `${data.appUrl}/api/storefront`
  });
});
const route3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: storefront_$productId,
  headers: headers$a,
  links: links$1,
  loader: loader$i
}, Symbol.toStringTag, { value: "Module" }));
const action$g = async ({
  request
}) => {
  const {
    session
  } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  if (request.method !== "POST") return apiError("Method not allowed.", 405);
  const payload = await request.json();
  const invalid = validateCustomizationPayload(payload);
  if (invalid) return apiError(invalid, 400);
  try {
    const customization = await createCustomization(store, payload, getAppUrl(request));
    return apiOk({
      customization
    }, {
      status: 201
    });
  } catch (error) {
    logError("api.customizations", error);
    return apiError(USER_ERRORS.saveCustomization, 500);
  }
};
const route4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$g
}, Symbol.toStringTag, { value: "Module" }));
const action$f = async ({
  request
}) => {
  const {
    session
  } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  if (request.method !== "POST") return apiError("Method not allowed.", 405);
  try {
    const payload = await request.json();
    const result = await generatePrintFile(store, payload, getAppUrl(request));
    return apiOk(result);
  } catch (error) {
    logError("api.printFile", error);
    return apiError(USER_ERRORS.printFailed, 500);
  }
};
const route5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$f
}, Symbol.toStringTag, { value: "Module" }));
const action$e = async ({
  request
}) => {
  const {
    session
  } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  if (request.method !== "POST") return apiError("Method not allowed.", 405);
  try {
    const payload = await request.json();
    const result = await generatePreview(store, payload, getAppUrl(request));
    return apiOk(result);
  } catch (error) {
    logError("api.preview", error);
    return apiError(USER_ERRORS.previewFailed, 500);
  }
};
const route6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$e
}, Symbol.toStringTag, { value: "Module" }));
const loader$h = async ({
  request,
  params
}) => {
  const {
    session
  } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const customization = await getCustomizationByPublicId(store.id, params.id, getAppUrl(request));
  if (!customization) return apiError(USER_ERRORS.notFound, 404);
  return apiOk({
    customization
  });
};
const action$d = async ({
  request,
  params
}) => {
  const {
    session
  } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  if (request.method !== "PUT" && request.method !== "POST") {
    return apiError("Method not allowed.", 405);
  }
  const payload = await request.json();
  const customization = await updateCustomization(store.id, params.id, payload, getAppUrl(request));
  if (!customization) return apiError(USER_ERRORS.notFound, 404);
  return apiOk({
    customization
  });
};
const route7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$d,
  loader: loader$h
}, Symbol.toStringTag, { value: "Module" }));
const loader$g = async ({
  request,
  params
}) => {
  if (request.method === "OPTIONS") return optionsResponse(request);
  return handleStorefrontApi(request, params["*"] || "", {
    cors: true
  });
};
const action$c = async ({
  request,
  params
}) => {
  if (request.method === "OPTIONS") return optionsResponse(request);
  return handleStorefrontApi(request, params["*"] || "", {
    cors: true
  });
};
const route8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$c,
  loader: loader$g
}, Symbol.toStringTag, { value: "Module" }));
const action$b = async ({
  request
}) => {
  await authenticate.admin(request);
  if (request.method !== "POST") return apiError("Method not allowed.", 405);
  const payload = await request.json();
  if (!payload.customizationId || !payload.variantId) {
    return apiError("A customization ID and variant ID are required.");
  }
  return apiOk({
    cartPayload: {
      id: toNumericId(payload.variantId),
      quantity: Math.max(1, Number(payload.quantity) || 1),
      properties: {
        _customizationId: payload.customizationId,
        "Customization ID": payload.customizationId,
        _previewUrl: payload.previewUrl || "",
        Preview: payload.previewUrl || "",
        Color: payload.color || ""
      }
    }
  });
};
const route9 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$b
}, Symbol.toStringTag, { value: "Module" }));
const loader$f = async ({
  request
}) => {
  const {
    admin,
    session
  } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const url = new URL(request.url);
  try {
    const products = await fetchShopifyProducts(admin, {
      query: url.searchParams.get("q") || "",
      first: Number(url.searchParams.get("first") || 25)
    });
    const customizerMap = await getCustomizerMap(store.id);
    return apiOk({
      products: products.nodes,
      customizerMap,
      pageInfo: products.pageInfo
    });
  } catch (error) {
    logError("api.products", error);
    return apiError(USER_ERRORS.configLoad, 500);
  }
};
const route10 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$f
}, Symbol.toStringTag, { value: "Module" }));
const loader$e = async ({
  request,
  params
}) => {
  const {
    session
  } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const customizer = await getCustomizerByProduct(store.id, params.id);
  if (!customizer) return apiError(USER_ERRORS.notFound, 404);
  return apiOk({
    customizer
  });
};
const action$a = async ({
  request,
  params
}) => {
  const {
    session
  } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  if (request.method !== "POST" && request.method !== "PUT") {
    return apiError("Method not allowed.", 405);
  }
  const payload = await request.json();
  const invalid = validateConfigurationPayload(payload);
  if (invalid) return apiError(invalid, 400);
  try {
    const customizer = await saveCustomizerConfiguration(store.id, params.id, payload);
    return apiOk({
      customizer
    });
  } catch (error) {
    logError("api.configuration", error);
    return apiError(USER_ERRORS.configSave, 500);
  }
};
const route11 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$a,
  loader: loader$e
}, Symbol.toStringTag, { value: "Module" }));
const loader$d = async ({
  request,
  params
}) => {
  if (request.method === "OPTIONS") return optionsResponse(request);
  const {
    session
  } = await authenticate.public.appProxy(request);
  return handleStorefrontApi(request, params["*"] || "", {
    shop: session == null ? void 0 : session.shop,
    cors: false
  });
};
const action$9 = async ({
  request,
  params
}) => {
  if (request.method === "OPTIONS") return optionsResponse(request);
  const {
    session
  } = await authenticate.public.appProxy(request);
  return handleStorefrontApi(request, params["*"] || "", {
    shop: session == null ? void 0 : session.shop,
    cors: false
  });
};
const route12 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$9,
  loader: loader$d
}, Symbol.toStringTag, { value: "Module" }));
const loader$c = async ({
  request
}) => {
  const {
    session
  } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const url = new URL(request.url);
  const assets = await listAssets(store.id, {
    type: url.searchParams.get("type") || void 0,
    category: url.searchParams.get("category") || void 0,
    appUrl: getAppUrl(request)
  });
  return apiOk({
    assets
  });
};
const action$8 = async ({
  request
}) => {
  const {
    session
  } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  if (request.method !== "POST") return apiError("Method not allowed.", 405);
  const result = await handleAdminAssetUpload(store, request);
  if (result.error) return apiError(result.error, 400);
  return apiOk({
    asset: result.asset
  }, {
    status: 201
  });
};
const route13 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$8,
  loader: loader$c
}, Symbol.toStringTag, { value: "Module" }));
const action$7 = async ({
  request,
  params
}) => {
  const {
    session
  } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  if (request.method !== "DELETE" && request.method !== "POST") {
    return apiError("Method not allowed.", 405);
  }
  const deleted = await deleteAsset(store.id, params.id);
  if (!deleted) return apiError(USER_ERRORS.notFound, 404);
  return apiOk({
    deleted: true
  });
};
const route14 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$7
}, Symbol.toStringTag, { value: "Module" }));
function AppProvider(props) {
  return jsxs(Fragment, { children: [props.embedded && jsx(AppBridge, { apiKey: props.apiKey }), jsx("script", { src: "https://cdn.shopify.com/shopifycloud/polaris.js" }), props.children] });
}
function AppBridge({ apiKey }) {
  const navigate = useNavigate();
  useEffect(() => {
    const handleNavigate = (event) => {
      var _a2;
      const href = (_a2 = event.target) == null ? void 0 : _a2.getAttribute("href");
      if (href) {
        navigate(href);
      }
    };
    document.addEventListener("shopify:navigate", handleNavigate);
    return () => {
      document.removeEventListener("shopify:navigate", handleNavigate);
    };
  }, [navigate]);
  return jsx("script", { src: "https://cdn.shopify.com/shopifycloud/app-bridge.js", "data-api-key": apiKey });
}
const AppProxyProviderContext = createContext(null);
forwardRef(function AppProxyLink(props, ref) {
  const context = useContext(AppProxyProviderContext);
  if (!context) {
    throw new Error("AppProxyLink must be used within an AppProxyProvider component");
  }
  const { children, href, ...otherProps } = props;
  return jsx("a", { href: context.formatUrl(href), ...otherProps, ref, children });
});
function loginErrorMessage(loginErrors) {
  if ((loginErrors == null ? void 0 : loginErrors.shop) === LoginErrorType.MissingShop) {
    return { shop: "Please enter your shop domain to log in" };
  } else if ((loginErrors == null ? void 0 : loginErrors.shop) === LoginErrorType.InvalidShop) {
    return { shop: "Please enter a valid shop domain to log in" };
  }
  return {};
}
const loader$b = async ({
  request
}) => {
  const errors = loginErrorMessage(await login(request));
  return {
    errors
  };
};
const action$6 = async ({
  request
}) => {
  const errors = loginErrorMessage(await login(request));
  return {
    errors
  };
};
const route$1 = UNSAFE_withComponentProps(function Auth() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const [shop, setShop] = useState("");
  const {
    errors
  } = actionData || loaderData;
  return /* @__PURE__ */ jsx(AppProvider, {
    embedded: false,
    children: /* @__PURE__ */ jsx("s-page", {
      children: /* @__PURE__ */ jsx(Form, {
        method: "post",
        children: /* @__PURE__ */ jsxs("s-section", {
          heading: "Log in",
          children: [/* @__PURE__ */ jsx("s-text-field", {
            name: "shop",
            label: "Shop domain",
            details: "example.myshopify.com",
            value: shop,
            onChange: (e) => setShop(e.currentTarget.value),
            autocomplete: "on",
            error: errors.shop
          }), /* @__PURE__ */ jsx("s-button", {
            type: "submit",
            children: "Log in"
          })]
        })
      })
    })
  });
});
const route15 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$6,
  default: route$1,
  loader: loader$b
}, Symbol.toStringTag, { value: "Module" }));
const loader$a = async ({
  request
}) => {
  await authenticate.admin(request);
  return null;
};
const headers$9 = (headersArgs) => {
  return boundary.headers(headersArgs);
};
const route16 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  headers: headers$9,
  loader: loader$a
}, Symbol.toStringTag, { value: "Module" }));
const index = "_index_1hqgz_1";
const heading = "_heading_1hqgz_21";
const text = "_text_1hqgz_23";
const content = "_content_1hqgz_43";
const form = "_form_1hqgz_53";
const label = "_label_1hqgz_69";
const input = "_input_1hqgz_85";
const button = "_button_1hqgz_93";
const list = "_list_1hqgz_101";
const styles = {
  index,
  heading,
  text,
  content,
  form,
  label,
  input,
  button,
  list
};
const loader$9 = async ({
  request
}) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return {
    showForm: Boolean(login)
  };
};
const route = UNSAFE_withComponentProps(function App2() {
  const {
    showForm
  } = useLoaderData();
  return /* @__PURE__ */ jsx("div", {
    className: styles.index,
    children: /* @__PURE__ */ jsxs("div", {
      className: styles.content,
      children: [/* @__PURE__ */ jsx("h1", {
        className: styles.heading,
        children: "A short heading about [your app]"
      }), /* @__PURE__ */ jsx("p", {
        className: styles.text,
        children: "A tagline about [your app] that describes your value proposition."
      }), showForm && /* @__PURE__ */ jsxs(Form, {
        className: styles.form,
        method: "post",
        action: "/auth/login",
        children: [/* @__PURE__ */ jsxs("label", {
          className: styles.label,
          children: [/* @__PURE__ */ jsx("span", {
            children: "Shop domain"
          }), /* @__PURE__ */ jsx("input", {
            className: styles.input,
            type: "text",
            name: "shop"
          }), /* @__PURE__ */ jsx("span", {
            children: "e.g: my-shop-domain.myshopify.com"
          })]
        }), /* @__PURE__ */ jsx("button", {
          className: styles.button,
          type: "submit",
          children: "Log in"
        })]
      }), /* @__PURE__ */ jsxs("ul", {
        className: styles.list,
        children: [/* @__PURE__ */ jsxs("li", {
          children: [/* @__PURE__ */ jsx("strong", {
            children: "Product feature"
          }), ". Some detail about your feature and its benefit to your customer."]
        }), /* @__PURE__ */ jsxs("li", {
          children: [/* @__PURE__ */ jsx("strong", {
            children: "Product feature"
          }), ". Some detail about your feature and its benefit to your customer."]
        }), /* @__PURE__ */ jsxs("li", {
          children: [/* @__PURE__ */ jsx("strong", {
            children: "Product feature"
          }), ". Some detail about your feature and its benefit to your customer."]
        })]
      })]
    })
  });
});
const route17 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: route,
  loader: loader$9
}, Symbol.toStringTag, { value: "Module" }));
const adminStyles = "/assets/admin-C8bp_AdF.css";
const links = () => [{
  rel: "stylesheet",
  href: adminStyles
}];
const loader$8 = async ({
  request
}) => {
  await authenticate.admin(request);
  return {
    apiKey: process.env.SHOPIFY_API_KEY || ""
  };
};
const app = UNSAFE_withComponentProps(function App3() {
  const {
    apiKey
  } = useLoaderData();
  return /* @__PURE__ */ jsxs(AppProvider, {
    embedded: true,
    apiKey,
    children: [/* @__PURE__ */ jsxs("s-app-nav", {
      children: [/* @__PURE__ */ jsx("s-link", {
        href: "/app",
        children: "Dashboard"
      }), /* @__PURE__ */ jsx("s-link", {
        href: "/app/products",
        children: "Products"
      }), /* @__PURE__ */ jsx("s-link", {
        href: "/app/graphics",
        children: "Graphics"
      }), /* @__PURE__ */ jsx("s-link", {
        href: "/app/fonts",
        children: "Fonts"
      }), /* @__PURE__ */ jsx("s-link", {
        href: "/app/templates",
        children: "Templates"
      }), /* @__PURE__ */ jsx("s-link", {
        href: "/app/orders",
        children: "Orders"
      }), /* @__PURE__ */ jsx("s-link", {
        href: "/app/settings",
        children: "Settings"
      })]
    }), /* @__PURE__ */ jsx(Outlet, {})]
  });
});
const ErrorBoundary = UNSAFE_withErrorBoundaryProps(function ErrorBoundary2() {
  return boundary.error(useRouteError());
});
const headers$8 = (headersArgs) => {
  return boundary.headers(headersArgs);
};
const route18 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ErrorBoundary,
  default: app,
  headers: headers$8,
  links,
  loader: loader$8
}, Symbol.toStringTag, { value: "Module" }));
const loader$7 = async ({
  request
}) => {
  const {
    session
  } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const [templates, customizers] = await Promise.all([listTemplates(store.id), listCustomizers(store.id)]);
  return {
    templates,
    customizers
  };
};
const action$5 = async ({
  request
}) => {
  const {
    session
  } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  if (intent === "create") {
    await createTemplate(store.id, {
      name: String(formData.get("name") || "Template"),
      configuration: JSON.parse(String(formData.get("configuration") || "{}"))
    });
  }
  if (intent === "delete") {
    await deleteTemplate(store.id, String(formData.get("id")));
  }
  return {
    ok: true
  };
};
const app_templates = UNSAFE_withComponentProps(function TemplatesPage() {
  const {
    templates,
    customizers
  } = useLoaderData();
  const fetcher = useFetcher();
  return /* @__PURE__ */ jsxs("s-page", {
    heading: "Templates",
    children: [/* @__PURE__ */ jsx("s-section", {
      heading: "Save a product configuration as a template",
      children: /* @__PURE__ */ jsxs(fetcher.Form, {
        method: "post",
        children: [/* @__PURE__ */ jsx("input", {
          type: "hidden",
          name: "intent",
          value: "create"
        }), /* @__PURE__ */ jsxs("s-stack", {
          direction: "block",
          gap: "base",
          children: [/* @__PURE__ */ jsx("input", {
            name: "name",
            placeholder: "Template name",
            required: true
          }), /* @__PURE__ */ jsxs("select", {
            name: "configuration",
            defaultValue: "",
            children: [/* @__PURE__ */ jsx("option", {
              value: "",
              children: "Select a configured product"
            }), customizers.map((item) => /* @__PURE__ */ jsx("option", {
              value: JSON.stringify(item.configuration),
              children: item.name
            }, item.id))]
          }), /* @__PURE__ */ jsx("s-button", {
            type: "submit",
            children: "Save template"
          })]
        })]
      })
    }), /* @__PURE__ */ jsx("s-section", {
      heading: "Saved designs",
      children: !templates.length ? /* @__PURE__ */ jsx("s-paragraph", {
        children: "No templates yet."
      }) : /* @__PURE__ */ jsx("s-unordered-list", {
        children: templates.map((template) => /* @__PURE__ */ jsxs("s-list-item", {
          children: [template.name, /* @__PURE__ */ jsxs(fetcher.Form, {
            method: "post",
            children: [/* @__PURE__ */ jsx("input", {
              type: "hidden",
              name: "intent",
              value: "delete"
            }), /* @__PURE__ */ jsx("input", {
              type: "hidden",
              name: "id",
              value: template.id
            }), /* @__PURE__ */ jsx("s-button", {
              type: "submit",
              variant: "secondary",
              children: "Delete"
            })]
          })]
        }, template.id))
      })
    })]
  });
});
const headers$7 = (headersArgs) => boundary.headers(headersArgs);
const route19 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$5,
  default: app_templates,
  headers: headers$7,
  loader: loader$7
}, Symbol.toStringTag, { value: "Module" }));
const loader$6 = async ({
  request
}) => {
  const {
    session
  } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const assets = await listAssets(store.id, {
    type: "graphic",
    appUrl: getAppUrl(request)
  });
  return {
    assets
  };
};
const action$4 = async ({
  request
}) => {
  const {
    session
  } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const result = await handleAdminAssetUpload(store, request);
    return result.error ? {
      ok: false,
      error: result.error
    } : {
      ok: true,
      asset: result.asset
    };
  }
  const formData = await request.formData();
  if (formData.get("intent") === "delete") {
    await deleteAsset(store.id, String(formData.get("id")));
    return {
      ok: true
    };
  }
  return {
    ok: false
  };
};
const app_graphics = UNSAFE_withComponentProps(function GraphicsPage() {
  const {
    assets
  } = useLoaderData();
  const fetcher = useFetcher();
  const shopify2 = useAppBridge();
  useEffect(() => {
    var _a2, _b;
    if ((_a2 = fetcher.data) == null ? void 0 : _a2.ok) shopify2.toast.show("Graphics updated");
    if ((_b = fetcher.data) == null ? void 0 : _b.error) shopify2.toast.show(fetcher.data.error, {
      isError: true
    });
  }, [fetcher.data, shopify2]);
  return /* @__PURE__ */ jsxs("s-page", {
    heading: "Graphics",
    children: [/* @__PURE__ */ jsx("s-section", {
      heading: "Upload a graphic",
      children: /* @__PURE__ */ jsxs(fetcher.Form, {
        method: "post",
        encType: "multipart/form-data",
        children: [/* @__PURE__ */ jsx("input", {
          type: "hidden",
          name: "type",
          value: "graphic"
        }), /* @__PURE__ */ jsxs("s-stack", {
          direction: "block",
          gap: "base",
          children: [/* @__PURE__ */ jsx("input", {
            name: "name",
            placeholder: "Name"
          }), /* @__PURE__ */ jsx("select", {
            name: "category",
            defaultValue: "Other",
            children: GRAPHIC_CATEGORIES.map((category) => /* @__PURE__ */ jsx("option", {
              value: category,
              children: category
            }, category))
          }), /* @__PURE__ */ jsx("input", {
            type: "file",
            name: "file",
            accept: "image/png,image/jpeg,image/svg+xml",
            required: true
          }), /* @__PURE__ */ jsx("s-button", {
            type: "submit",
            children: "Upload"
          })]
        })]
      })
    }), /* @__PURE__ */ jsx("s-section", {
      heading: "Library",
      children: !assets.length ? /* @__PURE__ */ jsx("s-paragraph", {
        children: "No graphics yet. Upload logos and clip art for customers to use."
      }) : /* @__PURE__ */ jsx("div", {
        className: "graphic-admin-grid",
        children: assets.map((asset) => /* @__PURE__ */ jsxs("div", {
          className: "graphic-admin-card",
          children: [/* @__PURE__ */ jsx("img", {
            src: asset.thumbnailUrl || asset.url,
            alt: asset.name
          }), /* @__PURE__ */ jsx("strong", {
            children: asset.name
          }), /* @__PURE__ */ jsx("p", {
            children: asset.category
          }), /* @__PURE__ */ jsxs(fetcher.Form, {
            method: "post",
            children: [/* @__PURE__ */ jsx("input", {
              type: "hidden",
              name: "intent",
              value: "delete"
            }), /* @__PURE__ */ jsx("input", {
              type: "hidden",
              name: "id",
              value: asset.id
            }), /* @__PURE__ */ jsx("s-button", {
              type: "submit",
              variant: "secondary",
              children: "Delete"
            })]
          })]
        }, asset.id))
      })
    })]
  });
});
const headers$6 = (headersArgs) => boundary.headers(headersArgs);
const route20 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$4,
  default: app_graphics,
  headers: headers$6,
  loader: loader$6
}, Symbol.toStringTag, { value: "Module" }));
const loader$5 = async ({
  request
}) => {
  const {
    admin,
    session
  } = await authenticate.admin(request);
  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "";
  const store = await getOrCreateStore(session.shop);
  try {
    const [products, customizerMap] = await Promise.all([fetchShopifyProducts(admin, {
      query,
      first: 40
    }), getCustomizerMap(store.id)]);
    return {
      products: products.nodes,
      query,
      customizerMap
    };
  } catch (error) {
    logError("admin.products", error);
    return {
      products: [],
      query,
      customizerMap: {},
      error: USER_ERRORS.configLoad
    };
  }
};
const action$3 = async ({
  request
}) => {
  const {
    session
  } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const formData = await request.formData();
  const productId = String(formData.get("productId") || "");
  const intent = String(formData.get("intent") || "");
  const enabled = intent === "enable";
  await setCustomizerEnabled(store.id, productId, enabled);
  return {
    ok: true,
    enabled
  };
};
const app_products = UNSAFE_withComponentProps(function ProductsPage() {
  const {
    products,
    query,
    customizerMap,
    error
  } = useLoaderData();
  const fetcher = useFetcher();
  const navigation = useNavigation();
  const shopify2 = useAppBridge();
  const loading = navigation.state !== "idle";
  useEffect(() => {
    var _a2;
    if ((_a2 = fetcher.data) == null ? void 0 : _a2.ok) {
      shopify2.toast.show(fetcher.data.enabled ? "Customizer enabled" : "Customizer disabled");
    }
  }, [fetcher.data, shopify2]);
  return /* @__PURE__ */ jsxs("s-page", {
    heading: "Products",
    children: [/* @__PURE__ */ jsx("s-section", {
      children: /* @__PURE__ */ jsx(Form, {
        method: "get",
        children: /* @__PURE__ */ jsxs("s-stack", {
          direction: "inline",
          gap: "base",
          children: [/* @__PURE__ */ jsx("input", {
            name: "q",
            defaultValue: query,
            placeholder: "Search products"
          }), /* @__PURE__ */ jsx("s-button", {
            type: "submit",
            children: "Search"
          })]
        })
      })
    }), error ? /* @__PURE__ */ jsx("s-banner", {
      tone: "critical",
      children: error
    }) : null, /* @__PURE__ */ jsxs("s-section", {
      heading: "Shopify products",
      children: [loading ? /* @__PURE__ */ jsx("s-paragraph", {
        children: "Loading products…"
      }) : null, !loading && !products.length ? /* @__PURE__ */ jsx("s-paragraph", {
        children: "No products found. Create a product in Shopify Admin first."
      }) : /* @__PURE__ */ jsx("div", {
        className: "admin-table-wrap",
        children: /* @__PURE__ */ jsxs("table", {
          children: [/* @__PURE__ */ jsx("thead", {
            children: /* @__PURE__ */ jsxs("tr", {
              children: [/* @__PURE__ */ jsx("th", {
                children: "Product"
              }), /* @__PURE__ */ jsx("th", {
                children: "Status"
              }), /* @__PURE__ */ jsx("th", {
                children: "Variants"
              }), /* @__PURE__ */ jsx("th", {
                children: "Customizer"
              }), /* @__PURE__ */ jsx("th", {
                children: "Actions"
              })]
            })
          }), /* @__PURE__ */ jsx("tbody", {
            children: products.map((product) => {
              const customizer = customizerMap[product.id];
              return /* @__PURE__ */ jsxs("tr", {
                children: [/* @__PURE__ */ jsx("td", {
                  children: /* @__PURE__ */ jsxs("div", {
                    className: "admin-product-cell",
                    children: [product.imageUrl ? /* @__PURE__ */ jsx("img", {
                      src: product.imageUrl,
                      alt: product.imageAlt
                    }) : /* @__PURE__ */ jsx("img", {
                      alt: "",
                      src: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
                    }), /* @__PURE__ */ jsx("strong", {
                      children: product.title
                    })]
                  })
                }), /* @__PURE__ */ jsx("td", {
                  children: product.status
                }), /* @__PURE__ */ jsx("td", {
                  children: product.variantCount
                }), /* @__PURE__ */ jsx("td", {
                  children: (customizer == null ? void 0 : customizer.enabled) ? "Enabled" : "Disabled"
                }), /* @__PURE__ */ jsx("td", {
                  children: /* @__PURE__ */ jsxs("s-stack", {
                    direction: "inline",
                    gap: "base",
                    children: [/* @__PURE__ */ jsx("s-button", {
                      href: `/app/products/${product.numericId}`,
                      variant: "secondary",
                      children: "Configure"
                    }), /* @__PURE__ */ jsxs(fetcher.Form, {
                      method: "post",
                      children: [/* @__PURE__ */ jsx("input", {
                        type: "hidden",
                        name: "productId",
                        value: product.id
                      }), /* @__PURE__ */ jsx("input", {
                        type: "hidden",
                        name: "intent",
                        value: (customizer == null ? void 0 : customizer.enabled) ? "disable" : "enable"
                      }), /* @__PURE__ */ jsx("button", {
                        type: "submit",
                        children: (customizer == null ? void 0 : customizer.enabled) ? "Disable" : "Enable"
                      })]
                    })]
                  })
                })]
              }, product.id);
            })
          })]
        })
      })]
    })]
  });
});
const headers$5 = (headersArgs) => boundary.headers(headersArgs);
const route21 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$3,
  default: app_products,
  headers: headers$5,
  loader: loader$5
}, Symbol.toStringTag, { value: "Module" }));
function PrintAreaEditor({
  imageUrl,
  width = 800,
  height = 800,
  printArea,
  onChange
}) {
  const canvasRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const printAreaRef = useRef(printArea);
  onChangeRef.current = onChange;
  printAreaRef.current = printArea;
  useEffect(() => {
    const timer = setInterval(() => {
      var _a2, _b;
      const next = (_b = (_a2 = canvasRef.current) == null ? void 0 : _a2.getPrintArea) == null ? void 0 : _b.call(_a2);
      if (!next || !onChangeRef.current) return;
      const current = printAreaRef.current || {};
      if (Math.round(next.x) !== Math.round(current.x) || Math.round(next.y) !== Math.round(current.y) || Math.round(next.width) !== Math.round(current.width) || Math.round(next.height) !== Math.round(current.height) || Math.round(next.rotation) !== Math.round(current.rotation || 0)) {
        onChangeRef.current({
          x: Math.round(next.x),
          y: Math.round(next.y),
          width: Math.round(next.width),
          height: Math.round(next.height),
          rotation: Math.round(next.rotation || 0),
          locked: Boolean(current.locked)
        });
      }
    }, 400);
    return () => clearInterval(timer);
  }, []);
  return /* @__PURE__ */ jsxs("div", { className: "admin-canvas-wrap", children: [
    /* @__PURE__ */ jsx(
      CustomizerCanvas,
      {
        ref: canvasRef,
        width,
        height,
        backgroundImage: imageUrl,
        printArea,
        allowOverflow: true,
        merchantMode: true
      }
    ),
    /* @__PURE__ */ jsx("s-paragraph", { children: "Drag the dashed rectangle to set the printable area. Coordinates are saved relative to the product image." })
  ] });
}
function ViewConfigurator({ views, onChange, onUpload }) {
  const [uploadingId, setUploadingId] = useState("");
  const updateView = (id, patch) => {
    onChange(views.map((view) => view.id === id ? { ...view, ...patch } : view));
  };
  const addView = () => {
    onChange([
      ...views,
      {
        id: `tmp-${crypto.randomUUID()}`,
        name: "Custom view",
        type: "custom",
        imageUrl: "",
        sortOrder: views.length,
        width: 800,
        height: 800,
        printArea: defaultPrintArea()
      }
    ]);
  };
  return /* @__PURE__ */ jsxs("s-stack", { direction: "block", gap: "base", children: [
    views.map((view) => {
      var _a2;
      return /* @__PURE__ */ jsx("div", { className: "admin-view-card", children: /* @__PURE__ */ jsxs("s-stack", { direction: "block", gap: "base", children: [
        /* @__PURE__ */ jsx("s-heading", { children: view.name }),
        /* @__PURE__ */ jsxs("div", { className: "admin-form-grid", children: [
          /* @__PURE__ */ jsxs("label", { children: [
            "Name",
            /* @__PURE__ */ jsx(
              "input",
              {
                value: view.name,
                onChange: (event) => updateView(view.id, { name: event.target.value })
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("label", { children: [
            "Type",
            /* @__PURE__ */ jsx(
              "select",
              {
                value: view.type,
                onChange: (event) => updateView(view.id, { type: event.target.value }),
                children: VIEW_TYPES.map((type) => /* @__PURE__ */ jsx("option", { value: type.value, children: type.label }, type.value))
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("label", { children: [
            "Width",
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "number",
                value: view.width,
                onChange: (event) => updateView(view.id, { width: Number(event.target.value) || 800 })
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("label", { children: [
            "Height",
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "number",
                value: view.height,
                onChange: (event) => updateView(view.id, { height: Number(event.target.value) || 800 })
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs("label", { children: [
          "Product image",
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "file",
              accept: "image/png,image/jpeg,image/svg+xml,image/webp",
              onChange: async (event) => {
                var _a3;
                const file = (_a3 = event.target.files) == null ? void 0 : _a3[0];
                if (!file) return;
                setUploadingId(view.id);
                const url = await onUpload(file);
                setUploadingId("");
                if (url) updateView(view.id, { imageUrl: url });
              }
            }
          ),
          uploadingId === view.id ? /* @__PURE__ */ jsx("span", { children: "Uploading…" }) : null
        ] }),
        /* @__PURE__ */ jsx(
          PrintAreaEditor,
          {
            imageUrl: view.imageUrl,
            width: view.width,
            height: view.height,
            printArea: view.printArea || defaultPrintArea(view.width, view.height),
            onChange: (printArea) => updateView(view.id, { printArea })
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "admin-form-grid", children: [
          ["x", "y", "width", "height", "rotation"].map((key) => {
            var _a3;
            return /* @__PURE__ */ jsxs("label", { children: [
              key,
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "number",
                  value: ((_a3 = view.printArea) == null ? void 0 : _a3[key]) ?? 0,
                  onChange: (event) => updateView(view.id, {
                    printArea: {
                      ...view.printArea || defaultPrintArea(),
                      [key]: Number(event.target.value) || 0
                    }
                  })
                }
              )
            ] }, key);
          }),
          /* @__PURE__ */ jsxs("label", { children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "checkbox",
                checked: Boolean((_a2 = view.printArea) == null ? void 0 : _a2.locked),
                onChange: (event) => updateView(view.id, {
                  printArea: {
                    ...view.printArea || defaultPrintArea(),
                    locked: event.target.checked
                  }
                })
              }
            ),
            "Lock print area"
          ] })
        ] }),
        /* @__PURE__ */ jsx(
          "s-button",
          {
            variant: "secondary",
            onClick: () => onChange(views.filter((item) => item.id !== view.id)),
            children: "Remove view"
          }
        )
      ] }) }, view.id);
    }),
    /* @__PURE__ */ jsx("s-button", { onClick: addView, children: "Add view" })
  ] });
}
const loader$4 = async ({
  request,
  params
}) => {
  const {
    admin,
    session
  } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const product = await fetchShopifyProduct(admin, params.productId);
  if (!product) {
    throw new Response("Product not found", {
      status: 404
    });
  }
  const customizer = await upsertCustomizer(store.id, {
    shopifyProductId: product.id,
    name: product.title
  });
  return {
    product,
    customizer
  };
};
const action$2 = async ({
  request,
  params
}) => {
  const {
    session
  } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const result = await handleAdminAssetUpload(store, request);
    if (result.error) return {
      ok: false,
      error: result.error
    };
    return {
      ok: true,
      asset: result.asset
    };
  }
  const payload = await request.json();
  const invalid = validateConfigurationPayload(payload);
  if (invalid) return {
    ok: false,
    error: invalid
  };
  try {
    const customizer = await saveCustomizerConfiguration(store.id, params.productId, payload);
    return {
      ok: true,
      customizer
    };
  } catch (error) {
    logError("admin.saveConfiguration", error);
    return {
      ok: false,
      error: USER_ERRORS.configSave
    };
  }
};
const app_products_$productId = UNSAFE_withComponentProps(function ProductConfigurePage() {
  var _a2, _b, _c, _d, _e, _f;
  const {
    product,
    customizer
  } = useLoaderData();
  const fetcher = useFetcher();
  const shopify2 = useAppBridge();
  const navigate = useNavigate();
  const [name, setName] = useState(customizer.name);
  const [enabled, setEnabled] = useState(customizer.enabled);
  const [configuration, setConfiguration] = useState(mergeConfiguration(customizer.configuration || defaultCustomizerConfiguration()));
  const [views, setViews] = useState(((_a2 = customizer.views) == null ? void 0 : _a2.length) ? customizer.views : [{
    id: `tmp-${crypto.randomUUID()}`,
    name: "Front",
    type: "front",
    imageUrl: product.imageUrl,
    sortOrder: 0,
    width: 800,
    height: 800,
    printArea: defaultPrintArea()
  }]);
  useEffect(() => {
    var _a3, _b2;
    if (((_a3 = fetcher.data) == null ? void 0 : _a3.ok) && fetcher.data.customizer) {
      shopify2.toast.show("Customizer saved");
    } else if ((_b2 = fetcher.data) == null ? void 0 : _b2.error) {
      shopify2.toast.show(fetcher.data.error, {
        isError: true
      });
    }
  }, [fetcher.data, shopify2]);
  const saving = fetcher.state !== "idle";
  const colors = configuration.colors || [];
  const save = () => {
    fetcher.submit({
      name,
      enabled,
      configuration,
      views: views.map((view, index2) => ({
        ...view,
        sortOrder: index2
      }))
    }, {
      method: "POST",
      encType: "application/json"
    });
  };
  const uploadViewImage = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", "product-image");
    formData.append("name", file.name);
    const response = await fetch(window.location.pathname, {
      method: "POST",
      body: formData
    });
    const json = await response.json();
    if (!json.ok) {
      shopify2.toast.show(json.error || "Image upload failed.", {
        isError: true
      });
      return "";
    }
    return json.asset.url;
  };
  const toolEntries = useMemo(() => [["text", "Add text"], ["graphic", "Add graphic"], ["upload", "Upload file"], ["qrCode", "QR code"], ["namesNumbers", "Names or #s"], ["designIdeas", "Design ideas"]], []);
  return /* @__PURE__ */ jsxs("s-page", {
    heading: product.title,
    children: [/* @__PURE__ */ jsx("s-button", {
      slot: "secondary-actions",
      onClick: () => navigate("/app/products"),
      variant: "secondary",
      children: "Back"
    }), /* @__PURE__ */ jsx("s-button", {
      slot: "primary-action",
      onClick: save,
      ...saving ? {
        loading: true
      } : {},
      children: "Save"
    }), /* @__PURE__ */ jsxs("s-section", {
      heading: "Product information",
      children: [/* @__PURE__ */ jsxs("s-paragraph", {
        children: [product.status, " · ", product.variants.length, " variants"]
      }), /* @__PURE__ */ jsxs("label", {
        children: ["Customizer name", /* @__PURE__ */ jsx("input", {
          value: name,
          onChange: (event) => setName(event.target.value)
        })]
      }), /* @__PURE__ */ jsxs("label", {
        children: [/* @__PURE__ */ jsx("input", {
          type: "checkbox",
          checked: enabled,
          onChange: (event) => setEnabled(event.target.checked)
        }), "Enable customizer on the storefront"]
      })]
    }), /* @__PURE__ */ jsx("s-section", {
      heading: "Product views",
      children: /* @__PURE__ */ jsx(ViewConfigurator, {
        views,
        onChange: setViews,
        onUpload: uploadViewImage
      })
    }), /* @__PURE__ */ jsxs("s-section", {
      heading: "Colors",
      children: [/* @__PURE__ */ jsx("p", {
        className: "admin-muted",
        children: "Use a separate image per color, or leave images empty to tint the product mockup."
      }), /* @__PURE__ */ jsxs("label", {
        children: ["Color mode", /* @__PURE__ */ jsxs("select", {
          value: configuration.colorMode,
          onChange: (event) => setConfiguration({
            ...configuration,
            colorMode: event.target.value
          }),
          children: [/* @__PURE__ */ jsx("option", {
            value: "tint",
            children: "Image colorization"
          }), /* @__PURE__ */ jsx("option", {
            value: "image",
            children: "Separate image per color"
          })]
        })]
      }), /* @__PURE__ */ jsx("div", {
        className: "swatch-row",
        children: colors.map((color, index2) => /* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("input", {
            value: color.name,
            onChange: (event) => {
              const next = colors.slice();
              next[index2] = {
                ...color,
                name: event.target.value
              };
              setConfiguration({
                ...configuration,
                colors: next
              });
            }
          }), /* @__PURE__ */ jsx("input", {
            type: "color",
            value: color.hex,
            onChange: (event) => {
              const next = colors.slice();
              next[index2] = {
                ...color,
                hex: event.target.value
              };
              setConfiguration({
                ...configuration,
                colors: next
              });
            }
          }), /* @__PURE__ */ jsx("input", {
            placeholder: "Optional image URL",
            value: color.imageUrl || "",
            onChange: (event) => {
              const next = colors.slice();
              next[index2] = {
                ...color,
                imageUrl: event.target.value
              };
              setConfiguration({
                ...configuration,
                colors: next
              });
            }
          }), /* @__PURE__ */ jsx("s-button", {
            variant: "secondary",
            onClick: () => setConfiguration({
              ...configuration,
              colors: colors.filter((_, colorIndex) => colorIndex !== index2)
            }),
            children: "Remove"
          })]
        }, color.id || index2))
      }), /* @__PURE__ */ jsx("s-button", {
        onClick: () => setConfiguration({
          ...configuration,
          colors: [...colors, {
            id: crypto.randomUUID(),
            name: "New color",
            hex: "#888888",
            imageUrl: ""
          }]
        }),
        children: "Add color"
      })]
    }), /* @__PURE__ */ jsx("s-section", {
      heading: "Allowed customization tools",
      children: toolEntries.map(([key, label2]) => {
        var _a3;
        return /* @__PURE__ */ jsxs("label", {
          children: [/* @__PURE__ */ jsx("input", {
            type: "checkbox",
            checked: ((_a3 = configuration.tools) == null ? void 0 : _a3[key]) !== false,
            onChange: (event) => setConfiguration({
              ...configuration,
              tools: {
                ...configuration.tools,
                [key]: event.target.checked
              }
            })
          }), label2]
        }, key);
      })
    }), /* @__PURE__ */ jsx("s-section", {
      heading: "Pricing",
      children: /* @__PURE__ */ jsx("div", {
        className: "admin-form-grid",
        children: ["basePrice", "textPrice", "graphicPrice", "uploadPrice"].map((key) => {
          var _a3;
          return /* @__PURE__ */ jsxs("label", {
            children: [key, /* @__PURE__ */ jsx("input", {
              type: "number",
              step: "0.01",
              value: ((_a3 = configuration.pricing) == null ? void 0 : _a3[key]) || 0,
              onChange: (event) => setConfiguration({
                ...configuration,
                pricing: {
                  ...configuration.pricing,
                  [key]: Number(event.target.value) || 0
                }
              })
            })]
          }, key);
        })
      })
    }), /* @__PURE__ */ jsxs("s-section", {
      heading: "Customer options",
      children: [/* @__PURE__ */ jsxs("label", {
        children: [/* @__PURE__ */ jsx("input", {
          type: "checkbox",
          checked: Boolean((_b = configuration.customerOptions) == null ? void 0 : _b.allowOverflow),
          onChange: (event) => setConfiguration({
            ...configuration,
            customerOptions: {
              ...configuration.customerOptions,
              allowOverflow: event.target.checked
            }
          })
        }), "Allow design to overflow the print area"]
      }), /* @__PURE__ */ jsxs("label", {
        children: [/* @__PURE__ */ jsx("input", {
          type: "checkbox",
          checked: ((_c = configuration.customerOptions) == null ? void 0 : _c.showQuantity) !== false,
          onChange: (event) => setConfiguration({
            ...configuration,
            customerOptions: {
              ...configuration.customerOptions,
              showQuantity: event.target.checked
            }
          })
        }), "Show quantity selector"]
      }), /* @__PURE__ */ jsxs("div", {
        className: "admin-form-grid",
        children: [/* @__PURE__ */ jsxs("label", {
          children: ["Min quantity", /* @__PURE__ */ jsx("input", {
            type: "number",
            value: ((_d = configuration.customerOptions) == null ? void 0 : _d.minQuantity) || 1,
            onChange: (event) => setConfiguration({
              ...configuration,
              customerOptions: {
                ...configuration.customerOptions,
                minQuantity: Number(event.target.value) || 1
              }
            })
          })]
        }), /* @__PURE__ */ jsxs("label", {
          children: ["Max quantity", /* @__PURE__ */ jsx("input", {
            type: "number",
            value: ((_e = configuration.customerOptions) == null ? void 0 : _e.maxQuantity) || 99,
            onChange: (event) => setConfiguration({
              ...configuration,
              customerOptions: {
                ...configuration.customerOptions,
                maxQuantity: Number(event.target.value) || 99
              }
            })
          })]
        }), /* @__PURE__ */ jsxs("label", {
          children: ["Print DPI", /* @__PURE__ */ jsx("input", {
            type: "number",
            value: ((_f = configuration.print) == null ? void 0 : _f.dpi) || 300,
            onChange: (event) => setConfiguration({
              ...configuration,
              print: {
                ...configuration.print,
                dpi: Number(event.target.value) || 300
              }
            })
          })]
        })]
      })]
    })]
  });
});
const headers$4 = (headersArgs) => boundary.headers(headersArgs);
const route22 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$2,
  default: app_products_$productId,
  headers: headers$4,
  loader: loader$4
}, Symbol.toStringTag, { value: "Module" }));
const loader$3 = async ({
  request
}) => {
  const {
    session
  } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  return {
    shop: session.shop,
    settings: parseJsonField(store.settings, defaultStoreSettings()),
    // eslint-disable-next-line no-undef
    appUrl: process.env.SHOPIFY_APP_URL || ""
  };
};
const action$1 = async ({
  request
}) => {
  const {
    session
  } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const formData = await request.formData();
  const settings = {
    ...defaultStoreSettings(),
    maxUploadMb: Number(formData.get("maxUploadMb") || 8),
    defaultDpi: Number(formData.get("defaultDpi") || 300),
    allowSvg: formData.get("allowSvg") === "on"
  };
  await updateStoreSettings(store.id, settings);
  return {
    ok: true
  };
};
const app_settings = UNSAFE_withComponentProps(function SettingsPage() {
  const {
    shop,
    settings,
    appUrl
  } = useLoaderData();
  const fetcher = useFetcher();
  return /* @__PURE__ */ jsxs("s-page", {
    heading: "Settings",
    children: [/* @__PURE__ */ jsx("s-section", {
      heading: "Store",
      children: /* @__PURE__ */ jsx("s-paragraph", {
        children: shop
      })
    }), /* @__PURE__ */ jsx("s-section", {
      heading: "Uploads and print files",
      children: /* @__PURE__ */ jsx(fetcher.Form, {
        method: "post",
        children: /* @__PURE__ */ jsxs("s-stack", {
          direction: "block",
          gap: "base",
          children: [/* @__PURE__ */ jsxs("label", {
            children: ["Max upload size (MB)", /* @__PURE__ */ jsx("input", {
              type: "number",
              name: "maxUploadMb",
              defaultValue: settings.maxUploadMb
            })]
          }), /* @__PURE__ */ jsxs("label", {
            children: ["Default print DPI", /* @__PURE__ */ jsx("input", {
              type: "number",
              name: "defaultDpi",
              defaultValue: settings.defaultDpi
            })]
          }), /* @__PURE__ */ jsxs("label", {
            children: [/* @__PURE__ */ jsx("input", {
              type: "checkbox",
              name: "allowSvg",
              defaultChecked: settings.allowSvg
            }), "Allow SVG uploads"]
          }), /* @__PURE__ */ jsx("s-button", {
            type: "submit",
            children: "Save settings"
          })]
        })
      })
    }), /* @__PURE__ */ jsxs("s-section", {
      heading: "Theme app extension",
      children: [/* @__PURE__ */ jsx("s-paragraph", {
        children: "In the Shopify theme editor, open a product template and add the Product Customizer block. Customers will see the customizer on that product page."
      }), /* @__PURE__ */ jsxs("s-paragraph", {
        children: ["App URL used by the storefront: ", appUrl || "Set during shopify app dev / deploy"]
      })]
    })]
  });
});
const headers$3 = (headersArgs) => boundary.headers(headersArgs);
const route23 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$1,
  default: app_settings,
  headers: headers$3,
  loader: loader$3
}, Symbol.toStringTag, { value: "Module" }));
const loader$2 = async ({
  request
}) => {
  const {
    admin
  } = await authenticate.admin(request);
  try {
    const orders = await fetchCustomizerOrders(admin);
    return {
      orders,
      error: null
    };
  } catch (error) {
    logError("admin.orders", error);
    return {
      orders: [],
      error: "Unable to load customized orders."
    };
  }
};
const app_orders = UNSAFE_withComponentProps(function OrdersPage() {
  const {
    orders,
    error
  } = useLoaderData();
  return /* @__PURE__ */ jsxs("s-page", {
    heading: "Orders",
    children: [error ? /* @__PURE__ */ jsx("s-banner", {
      tone: "critical",
      children: error
    }) : null, /* @__PURE__ */ jsx("s-section", {
      heading: "Customized orders",
      children: !orders.length ? /* @__PURE__ */ jsx("s-paragraph", {
        children: "Orders with a customization ID in the line item properties will appear here."
      }) : /* @__PURE__ */ jsx("div", {
        className: "admin-table-wrap",
        children: /* @__PURE__ */ jsxs("table", {
          children: [/* @__PURE__ */ jsx("thead", {
            children: /* @__PURE__ */ jsxs("tr", {
              children: [/* @__PURE__ */ jsx("th", {
                children: "Order"
              }), /* @__PURE__ */ jsx("th", {
                children: "Customer"
              }), /* @__PURE__ */ jsx("th", {
                children: "Customization"
              }), /* @__PURE__ */ jsx("th", {
                children: "Preview"
              })]
            })
          }), /* @__PURE__ */ jsx("tbody", {
            children: orders.map((order) => order.items.map((item) => /* @__PURE__ */ jsxs("tr", {
              children: [/* @__PURE__ */ jsx("td", {
                children: order.name
              }), /* @__PURE__ */ jsx("td", {
                children: order.customerName
              }), /* @__PURE__ */ jsxs("td", {
                children: [item.customizationId, /* @__PURE__ */ jsx("div", {
                  className: "admin-muted",
                  children: item.title
                })]
              }), /* @__PURE__ */ jsx("td", {
                children: item.previewUrl ? /* @__PURE__ */ jsx("a", {
                  href: item.previewUrl,
                  target: "_blank",
                  rel: "noreferrer",
                  children: "View preview"
                }) : "—"
              })]
            }, `${order.id}-${item.customizationId}`)))
          })]
        })
      })
    })]
  });
});
const headers$2 = (headersArgs) => boundary.headers(headersArgs);
const route24 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: app_orders,
  headers: headers$2,
  loader: loader$2
}, Symbol.toStringTag, { value: "Module" }));
const loader$1 = async ({
  request
}) => {
  const {
    session
  } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const stats = await getDashboardStats(store.id);
  return {
    shop: session.shop,
    stats
  };
};
const app__index = UNSAFE_withComponentProps(function Dashboard() {
  const {
    stats
  } = useLoaderData();
  return /* @__PURE__ */ jsxs("s-page", {
    heading: "Product Customizer",
    children: [/* @__PURE__ */ jsx("s-button", {
      slot: "primary-action",
      href: "/app/products",
      children: "Configure products"
    }), /* @__PURE__ */ jsx("s-section", {
      heading: "Overview",
      children: /* @__PURE__ */ jsxs("div", {
        className: "admin-grid",
        children: [/* @__PURE__ */ jsxs("s-section", {
          heading: "Customizable products",
          children: [/* @__PURE__ */ jsx("s-heading", {
            children: stats.customizableProducts
          }), /* @__PURE__ */ jsx("s-paragraph", {
            children: "Enabled for storefront customization"
          })]
        }), /* @__PURE__ */ jsxs("s-section", {
          heading: "Saved designs",
          children: [/* @__PURE__ */ jsx("s-heading", {
            children: stats.savedDesigns
          }), /* @__PURE__ */ jsx("s-paragraph", {
            children: "Reusable merchant templates"
          })]
        }), /* @__PURE__ */ jsxs("s-section", {
          heading: "Total customizations",
          children: [/* @__PURE__ */ jsx("s-heading", {
            children: stats.customizations
          }), /* @__PURE__ */ jsx("s-paragraph", {
            children: "Customer designs saved"
          })]
        })]
      })
    }), /* @__PURE__ */ jsx("s-section", {
      heading: "Quick actions",
      children: /* @__PURE__ */ jsxs("s-stack", {
        direction: "inline",
        gap: "base",
        children: [/* @__PURE__ */ jsx("s-button", {
          href: "/app/products",
          children: "Products"
        }), /* @__PURE__ */ jsx("s-button", {
          href: "/app/graphics",
          variant: "secondary",
          children: "Upload graphics"
        }), /* @__PURE__ */ jsx("s-button", {
          href: "/app/templates",
          variant: "secondary",
          children: "Templates"
        }), /* @__PURE__ */ jsx("s-button", {
          href: "/app/settings",
          variant: "secondary",
          children: "Settings"
        })]
      })
    }), /* @__PURE__ */ jsx("s-section", {
      heading: "Recent customized products",
      children: stats.recentCustomizers.length ? /* @__PURE__ */ jsx("s-unordered-list", {
        children: stats.recentCustomizers.map((item) => /* @__PURE__ */ jsxs("s-list-item", {
          children: [/* @__PURE__ */ jsx("s-link", {
            href: `/app/products/${item.shopifyProductId.split("/").pop()}`,
            children: item.name
          }), item.enabled ? " · Enabled" : " · Disabled"]
        }, item.id))
      }) : /* @__PURE__ */ jsxs("s-paragraph", {
        children: ["No customizable products yet. Open", " ", /* @__PURE__ */ jsx("s-link", {
          href: "/app/products",
          children: "Products"
        }), " to enable the customizer."]
      })
    }), /* @__PURE__ */ jsx("s-section", {
      heading: "Recent orders",
      children: stats.recentCustomizations.length ? /* @__PURE__ */ jsx("s-unordered-list", {
        children: stats.recentCustomizations.map((item) => /* @__PURE__ */ jsxs("s-list-item", {
          children: [item.publicId, " · qty ", item.quantity]
        }, item.id))
      }) : /* @__PURE__ */ jsx("s-paragraph", {
        children: "Customer customizations will appear here after checkout."
      })
    }), /* @__PURE__ */ jsxs("s-section", {
      slot: "aside",
      heading: "Theme setup",
      children: [/* @__PURE__ */ jsx("s-paragraph", {
        children: "Add the Product Customizer app block to your product template in Online Store → Themes → Customize."
      }), /* @__PURE__ */ jsx("s-paragraph", {
        children: /* @__PURE__ */ jsx(Link, {
          to: "/app/settings",
          children: "Open settings"
        })
      })]
    })]
  });
});
const headers$1 = (headersArgs) => boundary.headers(headersArgs);
const route25 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: app__index,
  headers: headers$1,
  loader: loader$1
}, Symbol.toStringTag, { value: "Module" }));
const loader = async ({
  request
}) => {
  const {
    session
  } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const fonts = await listAssets(store.id, {
    type: "font",
    appUrl: getAppUrl(request)
  });
  return {
    fonts,
    systemFonts: WEB_SAFE_FONTS,
    googleFonts: GOOGLE_FONTS
  };
};
const action = async ({
  request
}) => {
  const {
    session
  } = await authenticate.admin(request);
  const store = await getOrCreateStore(session.shop);
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const result = await handleAdminAssetUpload(store, request);
    return result.error ? {
      ok: false,
      error: result.error
    } : {
      ok: true
    };
  }
  const formData = await request.formData();
  if (formData.get("intent") === "delete") {
    await deleteAsset(store.id, String(formData.get("id")));
  }
  return {
    ok: true
  };
};
const app_fonts = UNSAFE_withComponentProps(function FontsPage() {
  const {
    fonts,
    systemFonts,
    googleFonts
  } = useLoaderData();
  const fetcher = useFetcher();
  return /* @__PURE__ */ jsxs("s-page", {
    heading: "Fonts",
    children: [/* @__PURE__ */ jsxs("s-section", {
      heading: "Available fonts",
      children: [/* @__PURE__ */ jsxs("s-paragraph", {
        children: ["System fonts: ", systemFonts.join(", ")]
      }), /* @__PURE__ */ jsxs("s-paragraph", {
        children: ["Google fonts: ", googleFonts.join(", ")]
      })]
    }), /* @__PURE__ */ jsx("s-section", {
      heading: "Upload a custom font",
      children: /* @__PURE__ */ jsxs(fetcher.Form, {
        method: "post",
        encType: "multipart/form-data",
        children: [/* @__PURE__ */ jsx("input", {
          type: "hidden",
          name: "type",
          value: "font"
        }), /* @__PURE__ */ jsxs("s-stack", {
          direction: "block",
          gap: "base",
          children: [/* @__PURE__ */ jsx("input", {
            name: "name",
            placeholder: "Font family name"
          }), /* @__PURE__ */ jsx("input", {
            type: "file",
            name: "file",
            accept: ".woff,.woff2,.ttf,.otf",
            required: true
          }), /* @__PURE__ */ jsx("s-button", {
            type: "submit",
            children: "Upload font"
          })]
        })]
      })
    }), /* @__PURE__ */ jsx("s-section", {
      heading: "Uploaded fonts",
      children: !fonts.length ? /* @__PURE__ */ jsx("s-paragraph", {
        children: "No custom fonts uploaded."
      }) : /* @__PURE__ */ jsx("s-unordered-list", {
        children: fonts.map((font) => /* @__PURE__ */ jsxs("s-list-item", {
          children: [font.name, /* @__PURE__ */ jsxs(fetcher.Form, {
            method: "post",
            children: [/* @__PURE__ */ jsx("input", {
              type: "hidden",
              name: "intent",
              value: "delete"
            }), /* @__PURE__ */ jsx("input", {
              type: "hidden",
              name: "id",
              value: font.id
            }), /* @__PURE__ */ jsx("s-button", {
              type: "submit",
              variant: "secondary",
              children: "Delete"
            })]
          })]
        }, font.id))
      })
    })]
  });
});
const headers = (headersArgs) => boundary.headers(headersArgs);
const route26 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action,
  default: app_fonts,
  headers,
  loader
}, Symbol.toStringTag, { value: "Module" }));
const serverManifest = { "entry": { "module": "/assets/entry.client-J3dd5SXr.js", "imports": ["/assets/jsx-runtime-BeiFytVE.js"], "css": [] }, "routes": { "root": { "id": "root", "parentId": void 0, "path": "", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/root-u4FtEaqh.js", "imports": ["/assets/jsx-runtime-BeiFytVE.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.app.scopes_update": { "id": "routes/webhooks.app.scopes_update", "parentId": "root", "path": "webhooks/app/scopes_update", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.scopes_update-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.app.uninstalled": { "id": "routes/webhooks.app.uninstalled", "parentId": "root", "path": "webhooks/app/uninstalled", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.uninstalled-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/storefront.$productId": { "id": "routes/storefront.$productId", "parentId": "root", "path": "storefront/:productId", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/storefront._productId-BCDH_3Hs.js", "imports": ["/assets/jsx-runtime-BeiFytVE.js", "/assets/CustomizerCanvas-BvNL-xbq.js", "/assets/customizer-defaults-LaT-QX9a.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.customizations": { "id": "routes/api.customizations", "parentId": "root", "path": "api/customizations", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.customizations-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.customizations.print-file": { "id": "routes/api.customizations.print-file", "parentId": "routes/api.customizations", "path": "print-file", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.customizations.print-file-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.customizations.preview": { "id": "routes/api.customizations.preview", "parentId": "routes/api.customizations", "path": "preview", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.customizations.preview-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.customizations.$id": { "id": "routes/api.customizations.$id", "parentId": "routes/api.customizations", "path": ":id", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.customizations._id-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.storefront.$": { "id": "routes/api.storefront.$", "parentId": "root", "path": "api/storefront/*", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.storefront._-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.cart.add": { "id": "routes/api.cart.add", "parentId": "root", "path": "api/cart/add", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.cart.add-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.products": { "id": "routes/api.products", "parentId": "root", "path": "api/products", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.products-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.products.$id.configuration": { "id": "routes/api.products.$id.configuration", "parentId": "routes/api.products", "path": ":id/configuration", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.products._id.configuration-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.proxy.$": { "id": "routes/api.proxy.$", "parentId": "root", "path": "api/proxy/*", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.proxy._-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.assets": { "id": "routes/api.assets", "parentId": "root", "path": "api/assets", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.assets-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.assets.$id": { "id": "routes/api.assets.$id", "parentId": "routes/api.assets", "path": ":id", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.assets._id-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/auth.login": { "id": "routes/auth.login", "parentId": "root", "path": "auth/login", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/route-DlYDUzO8.js", "imports": ["/assets/jsx-runtime-BeiFytVE.js", "/assets/AppProxyLink-1uPmHyl5.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/auth.$": { "id": "routes/auth.$", "parentId": "root", "path": "auth/*", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/auth._-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/_index": { "id": "routes/_index", "parentId": "root", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/route-DDxVQs8i.js", "imports": ["/assets/jsx-runtime-BeiFytVE.js"], "css": ["/assets/route-CNPfFM0M.css"], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app": { "id": "routes/app", "parentId": "root", "path": "app", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": true, "module": "/assets/app-C3OVEApn.js", "imports": ["/assets/jsx-runtime-BeiFytVE.js", "/assets/AppProxyLink-1uPmHyl5.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.templates": { "id": "routes/app.templates", "parentId": "routes/app", "path": "templates", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.templates-BApzLlRB.js", "imports": ["/assets/jsx-runtime-BeiFytVE.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.graphics": { "id": "routes/app.graphics", "parentId": "routes/app", "path": "graphics", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.graphics-B2LHwJdy.js", "imports": ["/assets/jsx-runtime-BeiFytVE.js", "/assets/customizer-defaults-LaT-QX9a.js", "/assets/useAppBridge-Bj34gXAL.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.products": { "id": "routes/app.products", "parentId": "routes/app", "path": "products", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.products-BZx8kT3D.js", "imports": ["/assets/jsx-runtime-BeiFytVE.js", "/assets/useAppBridge-Bj34gXAL.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.products.$productId": { "id": "routes/app.products.$productId", "parentId": "routes/app.products", "path": ":productId", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.products._productId-DPPe3zZq.js", "imports": ["/assets/jsx-runtime-BeiFytVE.js", "/assets/CustomizerCanvas-BvNL-xbq.js", "/assets/customizer-defaults-LaT-QX9a.js", "/assets/useAppBridge-Bj34gXAL.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.settings": { "id": "routes/app.settings", "parentId": "routes/app", "path": "settings", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.settings-DawfmHdF.js", "imports": ["/assets/jsx-runtime-BeiFytVE.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.orders": { "id": "routes/app.orders", "parentId": "routes/app", "path": "orders", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.orders-ColcVqKu.js", "imports": ["/assets/jsx-runtime-BeiFytVE.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app._index": { "id": "routes/app._index", "parentId": "routes/app", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app._index-Dlsf7RIR.js", "imports": ["/assets/jsx-runtime-BeiFytVE.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.fonts": { "id": "routes/app.fonts", "parentId": "routes/app", "path": "fonts", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.fonts-DZMYya6a.js", "imports": ["/assets/jsx-runtime-BeiFytVE.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 } }, "url": "/assets/manifest-4fc76e8a.js", "version": "4fc76e8a", "sri": void 0 };
const assetsBuildDirectory = "build\\client";
const basename = "/";
const future = { "unstable_optimizeDeps": false, "v8_passThroughRequests": false, "v8_trailingSlashAwareDataRequests": false, "unstable_previewServerPrerendering": false, "v8_middleware": false, "v8_splitRouteModules": false, "v8_viteEnvironmentApi": false };
const ssr = true;
const isSpaMode = false;
const prerender = [];
const routeDiscovery = { "mode": "lazy", "manifestPath": "/__manifest" };
const publicPath = "/";
const entry = { module: entryServer };
const routes = {
  "root": {
    id: "root",
    parentId: void 0,
    path: "",
    index: void 0,
    caseSensitive: void 0,
    module: route0
  },
  "routes/webhooks.app.scopes_update": {
    id: "routes/webhooks.app.scopes_update",
    parentId: "root",
    path: "webhooks/app/scopes_update",
    index: void 0,
    caseSensitive: void 0,
    module: route1
  },
  "routes/webhooks.app.uninstalled": {
    id: "routes/webhooks.app.uninstalled",
    parentId: "root",
    path: "webhooks/app/uninstalled",
    index: void 0,
    caseSensitive: void 0,
    module: route2
  },
  "routes/storefront.$productId": {
    id: "routes/storefront.$productId",
    parentId: "root",
    path: "storefront/:productId",
    index: void 0,
    caseSensitive: void 0,
    module: route3
  },
  "routes/api.customizations": {
    id: "routes/api.customizations",
    parentId: "root",
    path: "api/customizations",
    index: void 0,
    caseSensitive: void 0,
    module: route4
  },
  "routes/api.customizations.print-file": {
    id: "routes/api.customizations.print-file",
    parentId: "routes/api.customizations",
    path: "print-file",
    index: void 0,
    caseSensitive: void 0,
    module: route5
  },
  "routes/api.customizations.preview": {
    id: "routes/api.customizations.preview",
    parentId: "routes/api.customizations",
    path: "preview",
    index: void 0,
    caseSensitive: void 0,
    module: route6
  },
  "routes/api.customizations.$id": {
    id: "routes/api.customizations.$id",
    parentId: "routes/api.customizations",
    path: ":id",
    index: void 0,
    caseSensitive: void 0,
    module: route7
  },
  "routes/api.storefront.$": {
    id: "routes/api.storefront.$",
    parentId: "root",
    path: "api/storefront/*",
    index: void 0,
    caseSensitive: void 0,
    module: route8
  },
  "routes/api.cart.add": {
    id: "routes/api.cart.add",
    parentId: "root",
    path: "api/cart/add",
    index: void 0,
    caseSensitive: void 0,
    module: route9
  },
  "routes/api.products": {
    id: "routes/api.products",
    parentId: "root",
    path: "api/products",
    index: void 0,
    caseSensitive: void 0,
    module: route10
  },
  "routes/api.products.$id.configuration": {
    id: "routes/api.products.$id.configuration",
    parentId: "routes/api.products",
    path: ":id/configuration",
    index: void 0,
    caseSensitive: void 0,
    module: route11
  },
  "routes/api.proxy.$": {
    id: "routes/api.proxy.$",
    parentId: "root",
    path: "api/proxy/*",
    index: void 0,
    caseSensitive: void 0,
    module: route12
  },
  "routes/api.assets": {
    id: "routes/api.assets",
    parentId: "root",
    path: "api/assets",
    index: void 0,
    caseSensitive: void 0,
    module: route13
  },
  "routes/api.assets.$id": {
    id: "routes/api.assets.$id",
    parentId: "routes/api.assets",
    path: ":id",
    index: void 0,
    caseSensitive: void 0,
    module: route14
  },
  "routes/auth.login": {
    id: "routes/auth.login",
    parentId: "root",
    path: "auth/login",
    index: void 0,
    caseSensitive: void 0,
    module: route15
  },
  "routes/auth.$": {
    id: "routes/auth.$",
    parentId: "root",
    path: "auth/*",
    index: void 0,
    caseSensitive: void 0,
    module: route16
  },
  "routes/_index": {
    id: "routes/_index",
    parentId: "root",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route17
  },
  "routes/app": {
    id: "routes/app",
    parentId: "root",
    path: "app",
    index: void 0,
    caseSensitive: void 0,
    module: route18
  },
  "routes/app.templates": {
    id: "routes/app.templates",
    parentId: "routes/app",
    path: "templates",
    index: void 0,
    caseSensitive: void 0,
    module: route19
  },
  "routes/app.graphics": {
    id: "routes/app.graphics",
    parentId: "routes/app",
    path: "graphics",
    index: void 0,
    caseSensitive: void 0,
    module: route20
  },
  "routes/app.products": {
    id: "routes/app.products",
    parentId: "routes/app",
    path: "products",
    index: void 0,
    caseSensitive: void 0,
    module: route21
  },
  "routes/app.products.$productId": {
    id: "routes/app.products.$productId",
    parentId: "routes/app.products",
    path: ":productId",
    index: void 0,
    caseSensitive: void 0,
    module: route22
  },
  "routes/app.settings": {
    id: "routes/app.settings",
    parentId: "routes/app",
    path: "settings",
    index: void 0,
    caseSensitive: void 0,
    module: route23
  },
  "routes/app.orders": {
    id: "routes/app.orders",
    parentId: "routes/app",
    path: "orders",
    index: void 0,
    caseSensitive: void 0,
    module: route24
  },
  "routes/app._index": {
    id: "routes/app._index",
    parentId: "routes/app",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route25
  },
  "routes/app.fonts": {
    id: "routes/app.fonts",
    parentId: "routes/app",
    path: "fonts",
    index: void 0,
    caseSensitive: void 0,
    module: route26
  }
};
const allowedActionOrigins = false;
export {
  allowedActionOrigins,
  serverManifest as assets,
  assetsBuildDirectory,
  basename,
  entry,
  future,
  isSpaMode,
  prerender,
  publicPath,
  routeDiscovery,
  routes,
  ssr
};
