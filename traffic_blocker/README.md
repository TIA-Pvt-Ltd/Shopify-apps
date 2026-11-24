# Traffic Blocker

Shopify app for country, IP, ASN, bot, and custom traffic rules. Enforcement is split into a client-side Shopify-native mode and an optional Cloudflare edge mode. Native mode is not pre-storefront protection and does not change Shopify's own analytics.

## Architecture

Three independent pieces:

1. **Detection** reads the server-observed IP, MaxMind, ASN/VPN lists, and bot signals.
2. **Rules** return allow, block, challenge, monitor, or rate limit. The order is documented in `apps/backend/src/engines/rules.ts`.
3. **Enforcement** applies that decision. The native embed runs after Shopify received the request. Edge rules are published to Cloudflare and stay inactive until a live probe proves a matching request was rejected before the origin.

Analytics are written after the decision, through BullMQ when Redis is available. A failure there does not change the decision.

Browser-supplied country codes are ignored. GeoIP uses the socket IP, or a forwarded IP only when the socket belongs to a CIDR in `TRUSTED_PROXY_CIDRS`.

## Layout

- `apps/backend` Express API, engines, MongoDB models, workers
- `apps/admin` embedded Polaris dashboard
- `apps/storefront` copies the theme embed script
- `extensions/traffic-protection` theme app embed
- `extensions/traffic-pixel` web pixel for permitted sessions
- `packages/*` shared types, country catalog, rule schemas, analytics helpers

Admin API version is pinned to **2026-10**.

## Local development

```bash
cp .env.example .env
# Fill SHOPIFY_API_KEY, SHOPIFY_API_SECRET, and a 32-byte hex CREDENTIALS_ENCRYPTION_KEY.
docker compose -f infrastructure/docker/docker-compose.yml up mongo redis
npm install
npm run dev
```

Set `ALLOW_DEV_AUTH=true` only on a private machine. The API then accepts `X-Dev-Shop` and will not start in production with that flag set.

Open the admin at `http://localhost:5173`. Shopify embedded installs use `shopify app dev` with `shopify.app.toml`.

`npm run seed:demo` loads a clearly marked demo shop. It refuses to run when `NODE_ENV=production`.

## Enforcement truthfulness

| Mode | Blocks before Shopify | Approved-session analytics | Shopify analytics |
| --- | --- | --- | --- |
| Shopify-native | No | Denied visitors are excluded | Not controlled |
| Edge, probe succeeded | Yes, for matching requests | Denied visitors are excluded | Visits that never reach Shopify are not storefront hits |
| Mock edge adapter | No | Not active protection | Not active protection |

Edge mode is rejected for `*.myshopify.com` hostnames. DNS records change only through `POST /api/v1/edge/dns/apply` with `approved: true`. Checkout, cart, and account traffic is not given a cache rule. A failed deploy rolls back and keeps the previous provider ruleset.

Native mode fails open if the embed cannot reach the API. `failMode=closed` denies a visitor only when the engine itself throws and the embed received that response.

## Plans

Starter, Growth, and Advanced limits live in `apps/backend/src/engines/plans.ts`. New installs get a Growth trial. Edge requires Advanced. Over-limit rules are disabled, not deleted, when a shop moves to a smaller plan.

## Tests

```bash
npm test
```

Unit tests cover CIDR matching, rule precedence, crawler DNS verification, analytics separation, webhook HMAC, OAuth HMAC, session tokens, edge rollback, and the decision path ignoring a client country.

## Production

- `infrastructure/docker/Dockerfile` and `docker-compose.yml`
- `infrastructure/nginx/traffic-blocker.conf`
- `infrastructure/pm2/ecosystem.config.cjs`
- `.github/workflows/ci.yml` and `deploy.yml`

Put the API behind Nginx or another proxy you list in `TRUSTED_PROXY_CIDRS`. Download GeoLite2 City and ASN databases and set `GEOIP_CITY_DB` and `GEOIP_ASN_DB`. Without them, country rules do not match and the dashboard says GeoIP is not configured.

VPN, proxy, and Tor signals come from optional CIDR files. An empty file means that signal is off. Hosting ASNs are a signal, not an automatic block. VPN use alone defaults to monitor.
