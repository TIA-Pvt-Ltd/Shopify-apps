import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banner, BlockStack, Button, Card, EmptyState, InlineStack, Page, SkeletonBodyText, TextField } from "@shopify/polaris";
import { api, withQuery } from "../api";

interface EventRow {
  id: string;
  occurredAt: string;
  action: string;
  reason: string;
  countryCode: string | null;
  asn: number | null;
  browser: string;
  device: string;
  path: string;
  enforcementMode: string;
  ip: string | null;
  ipHash: string;
}

const PAGE_SIZE = 25;

const REASONS: Record<string, string> = {
  country_blocked: "Country blocked",
  datacenter_network: "Datacenter",
  vpn_detected: "VPN",
  proxy_detected: "Proxy",
  tor_detected: "Tor",
  ip_blocked: "IP blocked",
  asn_blocked: "Network blocked",
  bot_detected: "Bot",
  malicious_bot: "Malicious bot",
  rate_limited: "Rate limited",
};

export function EventsPage() {
  const [country, setCountry] = useState("");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["events", country, page],
    queryFn: () => api<EventRow[]>(withQuery("/api/v1/events", { country, page, pageSize: PAGE_SIZE })),
  });
  const rows = query.data ?? [];
  return (
    <Page title="Blocked visitors" subtitle="Denied requests are listed here and are excluded from clean sessions.">
      <BlockStack gap="400">
        <div className="tb-filter">
          <TextField
            label="Country"
            placeholder="IN"
            value={country}
            onChange={(value) => { setCountry(value.toUpperCase().slice(0, 2)); setPage(1); }}
            autoComplete="off"
            helpText="ISO code. Leave blank to show every country."
          />
        </div>
        {query.isError ? <Banner tone="critical" title={query.error instanceof Error ? query.error.message : "Blocked visitors could not be loaded"} /> : (
        <Card padding="0">
          {query.isLoading ? <div className="tb-pad"><SkeletonBodyText lines={6} /></div> : rows.length === 0 ? (
            <EmptyState heading={country ? `No denied visitors from ${country}` : "No denied visitors"} image="">Blocked and rate-limited requests will appear here.</EmptyState>
          ) : (
            <div className="tb-table-wrap">
              <table className="tb-table tb-events">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Visitor</th>
                    <th>Reason</th>
                    <th>Page</th>
                    <th>Enforcement</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const when = new Date(row.occurredAt);
                    const code = row.countryCode && /^[A-Za-z]{2}$/.test(row.countryCode) ? row.countryCode.toUpperCase() : null;
                    const identity = row.ip ?? row.ipHash;
                    return (
                      <tr key={row.id}>
                        <td>
                          <div className="tb-stack">
                            <strong>{when.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</strong>
                            <span>{when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
                          </div>
                        </td>
                        <td>
                          <div className="tb-visitor">
                            {code ? <img className="tb-flag" alt="" src={`https://flagcdn.com/24x18/${code.toLowerCase()}.png`} /> : <span className="tb-flag tb-flag-empty" />}
                            <div className="tb-stack">
                              <strong>{code ?? "Unknown"}{row.asn ? ` · AS${row.asn}` : ""}</strong>
                              <span className="tb-mono" title={identity}>{identity.slice(0, 8)}</span>
                            </div>
                          </div>
                        </td>
                        <td><span className={row.action === "rate_limit" ? "tb-pill tb-pill-warn" : "tb-pill tb-pill-block"}>{reasonLabel(row.reason)}</span></td>
                        <td>
                          <div className="tb-stack">
                            <span className="tb-mono tb-path" title={row.path}>{row.path || "/"}</span>
                            <span>{[row.device, row.browser].filter(Boolean).join(" · ") || "Unknown client"}</span>
                          </div>
                        </td>
                        <td><span className="tb-pill tb-pill-muted">{modeLabel(row.enforcementMode)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        )}
        <InlineStack gap="200" blockAlign="center">
          <Button disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <Button disabled={rows.length < PAGE_SIZE} onClick={() => setPage(page + 1)}>Next</Button>
          <span className="tb-page">Page {page}</span>
        </InlineStack>
      </BlockStack>
    </Page>
  );
}

function reasonLabel(reason: string): string {
  if (REASONS[reason]) return REASONS[reason];
  if (reason.startsWith("custom_rule:")) return reason.slice("custom_rule:".length);
  const text = reason.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function modeLabel(mode: string): string {
  if (mode === "shopify_native") return "Shopify native";
  if (mode === "edge" || mode === "cloudflare") return "Edge";
  const text = mode.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
