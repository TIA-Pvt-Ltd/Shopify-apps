import { createHmac } from "node:crypto";
import type { CompiledRuleset } from "./rules.js";
import { isRuleActive } from "./rules.js";

export interface CompatibilityCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface EdgeProbeResult {
  blockedBeforeOrigin: boolean;
  originUntouchedForAllowed: boolean;
  detail: string;
}

export interface EdgeDenial {
  ip: string;
  countryCode: string | null;
  path: string;
  action: string;
  occurredAt: string;
  rayId?: string;
}

export interface EdgeDeployRequest {
  shopDomain: string;
  hostname: string;
  zoneId?: string;
  apiToken?: string;
  ruleset: CompiledRuleset;
  previousRulesetId?: string | null;
  probeNonce: string;
}

export interface EdgeProvider {
  readonly name: "cloudflare" | "mock";
  readonly simulated: boolean;
  verify(input: EdgeDeployRequest): Promise<CompatibilityCheck[]>;
  deploy(input: EdgeDeployRequest, expression: string): Promise<{ rulesetId: string }>;
  probe(input: EdgeDeployRequest): Promise<EdgeProbeResult>;
  rollback(input: EdgeDeployRequest): Promise<void>;
  disconnect(input: EdgeDeployRequest): Promise<void>;
  applyDns?(input: EdgeDeployRequest & { recordType: "A" | "AAAA" | "CNAME"; name: string; content: string }): Promise<void>;
  pullDenials?(input: EdgeDeployRequest, since: string): Promise<EdgeDenial[]>;
}

export function signEdgeExpression(secret: string, version: number, expression: string): string {
  return createHmac("sha256", secret).update(`${version}.${expression}`).digest("hex");
}

export function buildCloudflareExpression(ruleset: CompiledRuleset, now = new Date()): string {
  const countries = ruleset.countryBlocks
    .filter((rule) => isRuleActive(rule, now))
    .map((rule) => rule.countryCode);
  const ips = ruleset.ipBlocks.filter((rule) => isRuleActive(rule, now)).map((rule) => rule.cidr);
  const asns = ruleset.asnBlocks.filter((rule) => isRuleActive(rule, now)).map((rule) => String(rule.asn));
  const parts: string[] = [];
  if (countries.length > 0) {
    parts.push(`(ip.src.country in {${countries.map((code) => `"${code}"`).join(" ")}})`);
  }
  if (ips.length > 0) {
    parts.push(`(ip.src in {${ips.map((cidr) => cidr).join(" ")}})`);
  }
  if (asns.length > 0) {
    parts.push(`(ip.src.asnum in {${asns.join(" ")}})`);
  }
  if (parts.length === 0) return "false";
  return parts.join(" or ");
}

export function probeExpression(nonce: string): string {
  if (!/^[a-f0-9]{16,64}$/.test(nonce)) throw new Error("Probe nonce is invalid");
  return `(any(http.request.headers["x-tb-probe"][*] eq "${nonce}"))`;
}

export function requiredCompatibilityFailures(checks: CompatibilityCheck[]): CompatibilityCheck[] {
  return checks.filter((check) => !check.ok);
}

const SHOPIFY_HOST = /\.myshopify\.com$/i;

export function staticCompatibility(input: { provider: string; hostname: string; zoneId?: string; apiToken?: string }): CompatibilityCheck[] {
  const checks: CompatibilityCheck[] = [
    {
      id: "custom-domain",
      label: "Custom domain",
      ok: !SHOPIFY_HOST.test(input.hostname) && input.hostname.includes("."),
      detail: SHOPIFY_HOST.test(input.hostname)
        ? "Edge enforcement cannot be attached to a myshopify.com hostname because the merchant does not control its DNS."
        : "Hostname is a custom domain.",
    },
  ];
  if (input.provider === "mock") {
    checks.push({
      id: "real-provider",
      label: "Provider",
      ok: false,
      detail: "The mock adapter does not provide real pre-storefront protection.",
    });
    return checks;
  }
  checks.push({
    id: "credentials",
    label: "Cloudflare credentials",
    ok: Boolean(input.zoneId && input.apiToken),
    detail: input.zoneId && input.apiToken ? "Zone and API token are present." : "A Cloudflare zone id and API token are required.",
  });
  return checks;
}

export class MockEdgeProvider implements EdgeProvider {
  readonly name = "mock" as const;
  readonly simulated = true;
  deployments: string[] = [];
  rolledBackTo: Array<string | null> = [];

  async verify(input: EdgeDeployRequest): Promise<CompatibilityCheck[]> {
    return staticCompatibility({ provider: "mock", hostname: input.hostname });
  }

  async deploy(input: EdgeDeployRequest): Promise<{ rulesetId: string }> {
    const rulesetId = `simulated-${input.ruleset.version}`;
    this.deployments.push(rulesetId);
    return { rulesetId };
  }

  async probe(): Promise<EdgeProbeResult> {
    return {
      blockedBeforeOrigin: false,
      originUntouchedForAllowed: false,
      detail: "Simulated probe did not send a request and cannot prove origin bypass.",
    };
  }

  async rollback(input: EdgeDeployRequest): Promise<void> {
    this.rolledBackTo.push(input.previousRulesetId ?? null);
  }

  async disconnect(): Promise<void> {
    this.deployments = [];
  }
}

export interface FetchLike {
  (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{
    ok: boolean;
    status: number;
    headers: { get(name: string): string | null };
    json(): Promise<unknown>;
    text(): Promise<string>;
  }>;
}

/**
 * Cloudflare custom WAF rules reject matching requests before the origin fetch.
 * This adapter never changes DNS unless applyDns is called with an already-approved request.
 * protectionActive stays false until a separate probe observes a Cloudflare block without Shopify origin headers.
 */
export class CloudflareEdgeProvider implements EdgeProvider {
  readonly name = "cloudflare" as const;
  readonly simulated = false;

  constructor(
    private readonly apiBase: string,
    private readonly fetchImpl: FetchLike = fetch as FetchLike,
  ) {}

  async verify(input: EdgeDeployRequest): Promise<CompatibilityCheck[]> {
    const checks = staticCompatibility({
      provider: "cloudflare",
      hostname: input.hostname,
      zoneId: input.zoneId,
      apiToken: input.apiToken,
    });
    if (!input.zoneId || !input.apiToken) return checks;
    const zone = await this.request<{
      success: boolean;
      result?: { status?: string; name?: string };
    }>(`/zones/${input.zoneId}`, input.apiToken);
    checks.push({
      id: "zone",
      label: "Cloudflare zone",
      ok: zone.ok && Boolean(zone.body.success),
      detail: zone.ok ? `Zone responded for ${zone.body.result?.name ?? input.hostname}.` : "Cloudflare zone lookup failed.",
    });
    const settings = await this.request<{ success: boolean; result?: { value?: string } }>(
      `/zones/${input.zoneId}/settings/ssl`,
      input.apiToken,
    );
    const ssl = settings.body.result?.value ?? "";
    checks.push({
      id: "tls",
      label: "TLS mode",
      ok: ssl === "full" || ssl === "strict",
      detail: ssl ? `SSL mode is ${ssl}.` : "SSL mode could not be read. Full or strict is required.",
    });
    checks.push({
      id: "checkout-cache",
      label: "Sensitive route caching",
      ok: true,
      detail: "Traffic Blocker does not add cache or proxy rules for checkout, cart, or account routes. Allowed traffic continues to Shopify.",
    });
    checks.push({
      id: "dns-untouched",
      label: "DNS",
      ok: true,
      detail: "Verification does not change DNS records.",
    });
    return checks;
  }

  async deploy(input: EdgeDeployRequest, expression: string): Promise<{ rulesetId: string }> {
    if (!input.zoneId || !input.apiToken) throw new Error("Cloudflare is not connected");
    const response = await this.request<{ success: boolean; result?: { id?: string }; errors?: unknown }>(
      `/zones/${input.zoneId}/rulesets/phases/http_request_firewall_custom/entrypoint`,
      input.apiToken,
      "PUT",
      {
        rules: [
          {
            action: "block",
            expression,
            description: `Traffic Blocker v${input.ruleset.version}`,
            enabled: expression !== "false",
          },
        ],
      },
    );
    if (!response.ok || !response.body.success || !response.body.result?.id) {
      throw new Error("Cloudflare ruleset deployment failed");
    }
    return { rulesetId: response.body.result.id };
  }

  async probe(input: EdgeDeployRequest): Promise<EdgeProbeResult> {
    const blocked = await this.fetchImpl(`https://${input.hostname}/`, {
      method: "GET",
      headers: { "x-tb-probe": input.probeNonce, "user-agent": "TrafficBlockerProbe/1.0" },
    });
    const allowed = await this.fetchImpl(`https://${input.hostname}/`, {
      method: "GET",
      headers: { "user-agent": "TrafficBlockerProbe/1.0" },
    });
    const blockedBeforeOrigin = isCloudflareBlock(blocked) && !hasShopifyOrigin(blocked);
    const originUntouchedForAllowed = hasShopifyOrigin(allowed) && !isCloudflareBlock(allowed);
    return {
      blockedBeforeOrigin,
      originUntouchedForAllowed,
      detail: `Probe status ${blocked.status}. Allowed request status ${allowed.status}.`,
    };
  }

  async rollback(input: EdgeDeployRequest): Promise<void> {
    if (!input.zoneId || !input.apiToken) return;
    if (!input.previousRulesetId) {
      await this.disconnect(input);
      return;
    }
    await this.deploy(input, "false");
  }

  async disconnect(input: EdgeDeployRequest): Promise<void> {
    if (!input.zoneId || !input.apiToken) return;
    await this.request(
      `/zones/${input.zoneId}/rulesets/phases/http_request_firewall_custom/entrypoint`,
      input.apiToken,
      "PUT",
      { rules: [] },
    );
  }

  async applyDns(input: EdgeDeployRequest & { recordType: "A" | "AAAA" | "CNAME"; name: string; content: string }): Promise<void> {
    if (!input.zoneId || !input.apiToken) throw new Error("Cloudflare is not connected");
    const response = await this.request(`/zones/${input.zoneId}/dns_records`, input.apiToken, "POST", {
      type: input.recordType,
      name: input.name,
      content: input.content,
      proxied: true,
      comment: "Created by Traffic Blocker after explicit merchant approval",
    });
    if (!response.ok) throw new Error("Cloudflare DNS update failed");
  }

  async pullDenials(input: EdgeDeployRequest): Promise<EdgeDenial[]> {
    if (!input.zoneId || !input.apiToken) return [];
    const response = await this.request<{ success: boolean; result?: Array<Record<string, unknown>> }>(
      `/zones/${input.zoneId}/security/events?per_page=50`,
      input.apiToken,
    );
    if (!response.ok || !response.body.success || !Array.isArray(response.body.result)) return [];
    return response.body.result.slice(0, 50).map((event) => ({
      ip: String(event.clientIP ?? ""),
      countryCode: typeof event.clientCountry === "string" ? event.clientCountry : null,
      path: String(event.clientRequestPath ?? "/"),
      action: String(event.action ?? "block"),
      occurredAt: String(event.occurredAt ?? new Date().toISOString()),
      rayId: typeof event.rayName === "string" ? event.rayName : undefined,
    }));
  }

  private async request<T>(path: string, token: string, method = "GET", body?: unknown): Promise<{ ok: boolean; body: T }> {
    const response = await this.fetchImpl(`${this.apiBase}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const parsed = (await response.json().catch(() => ({}))) as T;
    return { ok: response.ok, body: parsed };
  }
}

function isCloudflareBlock(response: { status: number; headers: { get(name: string): string | null } }): boolean {
  const server = response.headers.get("server") ?? "";
  return response.status === 403 && /cloudflare/i.test(server) && Boolean(response.headers.get("cf-ray"));
}

function hasShopifyOrigin(response: { headers: { get(name: string): string | null } }): boolean {
  return Boolean(
    response.headers.get("x-shopid") ||
      response.headers.get("x-shardid") ||
      response.headers.get("x-sorting-hat-shopid") ||
      (response.headers.get("powered-by") ?? "").toLowerCase().includes("shopify"),
  );
}

export async function runEdgeDeployment(input: {
  provider: EdgeProvider;
  request: EdgeDeployRequest;
  expression: string;
  probeExpression: string;
}): Promise<{
  protectionActive: boolean;
  simulated: boolean;
  status: "active" | "failed" | "rolled_back" | "simulated" | "verification_inconclusive";
  rulesetId: string | null;
  message: string;
  checks: CompatibilityCheck[];
}> {
  const checks = await input.provider.verify(input.request);
  if (input.provider.simulated) {
    return {
      protectionActive: false,
      simulated: true,
      status: "simulated",
      rulesetId: null,
      message: "Mock deployment was not activated. No request is blocked before Shopify.",
      checks,
    };
  }
  const failures = requiredCompatibilityFailures(checks);
  if (failures.length > 0) {
    return {
      protectionActive: false,
      simulated: false,
      status: "failed",
      rulesetId: input.request.previousRulesetId ?? null,
      message: failures.map((failure) => failure.detail).join(" "),
      checks,
    };
  }
  try {
    await input.provider.deploy(input.request, `${input.expression} or ${input.probeExpression}`);
    const probe = await input.provider.probe(input.request);
    if (!probe.blockedBeforeOrigin || !probe.originUntouchedForAllowed) {
      await input.provider.rollback(input.request);
      return {
        protectionActive: false,
        simulated: false,
        status: probe.blockedBeforeOrigin ? "verification_inconclusive" : "rolled_back",
        rulesetId: input.request.previousRulesetId ?? null,
        message: probe.detail,
        checks,
      };
    }
    const deployed = await input.provider.deploy(input.request, input.expression);
    return {
      protectionActive: true,
      simulated: false,
      status: "active",
      rulesetId: deployed.rulesetId,
      message: "A probe request was rejected by Cloudflare before it reached Shopify. Allowed traffic still reached the origin.",
      checks,
    };
  } catch (error) {
    await input.provider.rollback(input.request).catch(() => undefined);
    return {
      protectionActive: false,
      simulated: false,
      status: "rolled_back",
      rulesetId: input.request.previousRulesetId ?? null,
      message: error instanceof Error ? error.message : "Deployment failed and the previous configuration was kept.",
      checks,
    };
  }
}
