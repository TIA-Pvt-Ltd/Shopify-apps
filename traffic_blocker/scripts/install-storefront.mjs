import { createDecipheriv } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { MongoClient } from "mongodb";

const shop = normalizeShop(process.argv[2]);
const origin = process.argv[3]?.replace(/\/$/, "");
if (!shop || !origin) {
  console.error("Usage: node scripts/install-storefront.mjs <shop.myshopify.com> <https-origin>");
  console.error("Example: node scripts/install-storefront.mjs test-swsiowz0.myshopify.com https://xxxx.trycloudflare.com");
  process.exit(1);
}

function normalizeShop(value) {
  if (!value) return "";
  return String(value)
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), ".env"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);
const version = env.SHOPIFY_API_VERSION || "2026-10";
const requiredScopes = ["read_themes", "write_themes"];
const declareScopes = (env.SHOPIFY_SCOPES || requiredScopes.join(","))
  .split(",")
  .map((scope) => scope.trim())
  .filter(Boolean);

const snippet = `<!-- traffic-blocker:native -->
<script>
(function () {
  if (window.Shopify && window.Shopify.designMode) return;
  var root = document.documentElement;
  root.classList.add("tb-hold");
  try {
    var prior = sessionStorage.getItem("tb_decision");
    if (prior === "block" || prior === "rate_limit") root.classList.add("tb-blocked");
  } catch (error) { /* storage can be blocked */ }
  setTimeout(function () {
    if (!root.classList.contains("tb-decided")) {
      root.classList.remove("tb-hold");
      if (window.__tbAnalytics) window.__tbAnalytics.release();
    }
  }, 12000);
})();
</script>
<style>
  html.tb-hold, html.tb-blocked { background: #0f172a !important; }
  html.tb-hold body, html.tb-blocked body { display: none !important; }
</style>
<script src="${origin}/storefront/embed.js" data-shop="{{ shop.permanent_domain }}"></script>
<!-- /traffic-blocker:native -->`;
const marker = /<!-- traffic-blocker:native -->[\s\S]*?<!-- \/traffic-blocker:native -->/;

const { token, source, scope } = await resolveToken();
console.log(`Using ${source} token. Scopes: ${scope || "(none)"}`);
assertThemeScopes(scope);

async function graphql(query, variables) {
  const response = await fetch(`https://${shop}/admin/api/${version}/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-shopify-access-token": token },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors?.length) {
    const message = body.errors?.map((error) => error.message).join("; ") || `Shopify returned ${response.status}`;
    const error = new Error(message);
    error.graphql = true;
    throw error;
  }
  return body.data;
}

function injectSnippet(current, nextSnippet) {
  if (marker.test(current)) return current.replace(marker, nextSnippet);
  if (/<head[^>]*>/i.test(current)) return current.replace(/<head[^>]*>/i, (open) => `${open}\n${nextSnippet}`);
  if (!current.includes("</body>")) throw new Error("layout/theme.liquid has no head or body tag");
  return current.replace("</body>", `${nextSnippet}\n</body>`);
}

const themes = await graphql(`query { themes(first: 20) { nodes { id name role } } }`);
const theme = themes.themes.nodes.find((node) => node.role === "MAIN") ?? themes.themes.nodes[0];
if (!theme) throw new Error("No theme found");
console.log(`Theme: ${theme.name} ${theme.role}`);

const fileData = await graphql(
  `query ($id: ID!) {
    theme(id: $id) {
      files(filenames: ["layout/theme.liquid"]) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  { id: theme.id },
);
const file = fileData.theme.files.nodes[0];
const current = file?.body?.content ?? "";
const next = injectSnippet(current, snippet);

try {
  const saved = await graphql(
    `mutation ($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    { themeId: theme.id, files: [{ filename: "layout/theme.liquid", body: { type: "TEXT", value: next } }] },
  );
  const errors = saved.themeFilesUpsert.userErrors;
  if (errors.length) throw new Error(errors.map((error) => error.message).join("; "));
  const written = saved.themeFilesUpsert.upsertedThemeFiles?.map((entry) => entry.filename).join(", ") || "layout/theme.liquid";
  console.log(`Storefront script installed via Admin API on ${shop} (${written})`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!/exemption|themeFilesUpsert|write_themes and an exemption/i.test(message)) throw error;
  console.warn("Admin API cannot write theme files (Shopify exemption required). Falling back to Shopify CLI...");
  pushWithCli(theme.id, next);
  console.log(`Storefront script installed via Shopify CLI on ${shop}`);
}
console.log(`Embed origin: ${origin}/storefront/embed.js`);

function pushWithCli(themeGid, body) {
  const themeId = String(themeGid).replace(/\D/g, "");
  if (!themeId) throw new Error(`Could not parse theme id from ${themeGid}`);
  const workdir = resolve(tmpdir(), `tb-theme-${themeId}-${Date.now()}`);
  mkdirSync(resolve(workdir, "layout"), { recursive: true });
  writeFileSync(resolve(workdir, "layout", "theme.liquid"), body, "utf8");
  const result = spawnSync(
    "shopify",
    ["theme", "push", "--store", shop, "--theme", themeId, "--only", "layout/theme.liquid", "--path", workdir, "--allow-live"],
    { encoding: "utf8", shell: true },
  );
  rmSync(workdir, { recursive: true, force: true });
  if (result.status !== 0) {
    console.error(result.stdout || "");
    console.error(result.stderr || "");
    throw new Error(`shopify theme push failed with code ${result.status ?? "unknown"}`);
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

async function resolveToken() {
  if (env.SHOPIFY_ADMIN_ACCESS_TOKEN) {
    return { token: env.SHOPIFY_ADMIN_ACCESS_TOKEN, source: "SHOPIFY_ADMIN_ACCESS_TOKEN", scope: env.SHOPIFY_ADMIN_SCOPES || "(unknown)" };
  }

  const installed = await loadInstalledToken();
  if (installed?.token && hasThemeScopes(installed.scope)) {
    return { token: installed.token, source: "MongoDB install token", scope: installed.scope };
  }

  const clientCreds = await requestClientCredentials();
  if (hasThemeScopes(clientCreds.scope)) {
    return { token: clientCreds.token, source: "client_credentials", scope: clientCreds.scope };
  }

  if (installed?.token) {
    console.warn(`Installed shop scopes are "${installed.scope || "(empty)"}"; client_credentials scopes are "${clientCreds.scope || "(empty)"}".`);
  }
  printGrantHelp();
  process.exit(1);
}

async function requestClientCredentials() {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.SHOPIFY_API_KEY,
      client_secret: env.SHOPIFY_API_SECRET,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    console.error(`Token request failed (${response.status}): ${JSON.stringify(body)}`);
    printGrantHelp();
    process.exit(1);
  }
  return { token: body.access_token, scope: body.scope || "" };
}

async function loadInstalledToken() {
  if (!env.MONGODB_URI || !env.CREDENTIALS_ENCRYPTION_KEY) return null;
  const client = new MongoClient(env.MONGODB_URI);
  try {
    await client.connect();
    const doc = await client.db().collection("shops").findOne({ shopDomain: shop, installed: true });
    if (!doc?.accessTokenEncrypted) return null;
    return {
      token: decryptSecret(doc.accessTokenEncrypted, env.CREDENTIALS_ENCRYPTION_KEY),
      scope: doc.scopes || "",
    };
  } catch (error) {
    console.warn(`Could not read installed shop token: ${error instanceof Error ? error.message : error}`);
    return null;
  } finally {
    await client.close().catch(() => undefined);
  }
}

function decryptSecret(payload, keyHex) {
  const key = Buffer.from(keyHex, "hex");
  const [ivHex, tagHex, dataHex] = payload.split(".");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Malformed encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}

function hasThemeScopes(scope) {
  const granted = new Set(
    String(scope || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  return requiredScopes.every((entry) => granted.has(entry) || (entry === "read_themes" && granted.has("write_themes")));
}

function assertThemeScopes(scope) {
  if (hasThemeScopes(scope)) return;
  printGrantHelp();
  process.exit(1);
}

function printGrantHelp() {
  const appUrl = (env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const authorize = new URL(`https://${shop}/admin/oauth/authorize`);
  authorize.searchParams.set("client_id", env.SHOPIFY_API_KEY);
  authorize.searchParams.set("scope", declareScopes.join(","));
  authorize.searchParams.set("redirect_uri", `${appUrl}/api/auth/callback`);
  console.error("");
  console.error("Theme scopes are missing on this shop install.");
  console.error("Your app version declares them, but the store has not approved them yet.");
  console.error("");
  console.error("1. Keep API running (`npm run dev`).");
  console.error("2. Open this URL while logged into the shop admin, approve read_themes + write_themes:");
  console.error(`   ${appUrl}/api/auth?shop=${shop}`);
  console.error("   or:");
  console.error(`   ${authorize.toString()}`);
  console.error("3. Retry:");
  console.error(`   node scripts/install-storefront.mjs ${shop} ${origin}`);
}
