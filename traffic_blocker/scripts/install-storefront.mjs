import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const shop = process.argv[2];
const origin = process.argv[3]?.replace(/\/$/, "");
if (!shop || !origin) {
  console.error("Usage: node scripts/install-storefront.mjs <shop.myshopify.com> <https-origin>");
  process.exit(1);
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

const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json" },
  body: JSON.stringify({
    client_id: env.SHOPIFY_API_KEY,
    client_secret: env.SHOPIFY_API_SECRET,
    grant_type: "client_credentials",
  }),
});
const tokenBody = await tokenResponse.json();
if (!tokenResponse.ok || !tokenBody.access_token) {
  console.error(`Token request failed (${tokenResponse.status})`);
  process.exit(1);
}
console.log(`Token scopes: ${tokenBody.scope || "(none returned)"}`);

const token = tokenBody.access_token;
async function graphql(query, variables) {
  const response = await fetch(`https://${shop}/admin/api/${version}/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-shopify-access-token": token },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors?.length) {
    throw new Error(body.errors?.map((error) => error.message).join("; ") || `Shopify returned ${response.status}`);
  }
  return body.data;
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
if (!current.includes("</body>")) throw new Error("layout/theme.liquid has no body tag");

const snippet = `<!-- traffic-blocker:native -->
<script src="${origin}/storefront/embed.js" data-shop="{{ shop.permanent_domain }}" defer></script>
<!-- /traffic-blocker:native -->`;
const marker = /<!-- traffic-blocker:native -->[\s\S]*?<!-- \/traffic-blocker:native -->/;
const next = marker.test(current) ? current.replace(marker, snippet) : current.replace("</body>", `${snippet}\n</body>`);

const saved = await graphql(
  `mutation ($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedFiles { filename }
      userErrors { field message }
    }
  }`,
  { themeId: theme.id, files: [{ filename: "layout/theme.liquid", body: { type: "TEXT", value: next } }] },
);
const errors = saved.themeFilesUpsert.userErrors;
if (errors.length) throw new Error(errors.map((error) => error.message).join("; "));
console.log(`Storefront script installed on ${shop}`);
