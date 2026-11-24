# Architecture

## Decision order

1. Custom rules, lowest priority number first. Same priority uses the more restrictive action and records a conflict.
2. Allowlist bypass when `allowlistOverride` is on. This skips IP, ASN, country, bot, VPN/proxy, and rate-limit denials. It does not skip custom rules.
3. Explicit IP or CIDR block.
4. Verified crawler policy. Verification requires matching published DNS suffixes with reverse and forward DNS, or a merchant-supplied CIDR. The user-agent alone never verifies a crawler.
5. ASN block.
6. Country block, using the server GeoIP country.
7. Bot policy. A VPN flag is not a bot signal.
8. Datacenter, Tor, proxy, then VPN policy. The default VPN action is monitor.
9. Sliding-window rate limit, after exempt IPs and paths.
10. Default allow.

A challenge clearance can turn a `challenge` result into `allow`. It cannot override a block.

## Data

Denied requests go to `BlockEvent`. Approved human or verified-crawler sessions go to `TrafficSession` with `approved: true`. Daily counters live in `AnalyticsDaily`. Bot and suspicious classifications also go to `BotDetection`. Raw IPs are stored only as an encrypted value for the merchant view, plus a salted hash. Shopify access tokens and Cloudflare tokens are encrypted with AES-256-GCM.

Mandatory privacy webhooks are accepted. `shop/redact` deletes the shop and its traffic data. Customer redact records that this app does not keep Shopify customer profiles.

## Edge

`CloudflareEdgeProvider` writes a custom WAF rule. `MockEdgeProvider` always returns `protectionActive: false` and `status: simulated`. A deploy is active only when a probe with `x-tb-probe` is blocked by Cloudflare without Shopify origin headers, and a request without that header still reaches Shopify. The probe rule is not left in place; the customer expression is deployed after the probe succeeds. If that second deploy throws, the previous configuration is restored.
