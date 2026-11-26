import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Card,
  EmptyState,
  IndexTable,
  InlineStack,
  Page,
  SkeletonBodyText,
  Tabs,
  Text,
  TextField,
  Tooltip,
} from "@shopify/polaris";
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

type View = "all" | "blocked" | "rate_limit";

const VIEWS: Array<{ id: View; content: string }> = [
  { id: "all", content: "All" },
  { id: "blocked", content: "Blocked" },
  { id: "rate_limit", content: "Rate limited" },
];

export function EventsPage() {
  const [country, setCountry] = useState("");
  const [page, setPage] = useState(1);
  const [selectedView, setSelectedView] = useState(0);
  const view = VIEWS[selectedView]?.id ?? "all";

  const query = useQuery({
    queryKey: ["events", country, page],
    queryFn: () => api<EventRow[]>(withQuery("/api/v1/events", { country, page, pageSize: PAGE_SIZE })),
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(() => {
    const data = query.data ?? [];
    if (view === "all") return data;
    if (view === "rate_limit") return data.filter((row) => row.action === "rate_limit");
    return data.filter((row) => row.action !== "rate_limit");
  }, [query.data, view]);

  const resourceName = { singular: "blocked visitor", plural: "blocked visitors" };
  const emptyHeading = country
    ? `No denied visitors from ${country}`
    : view === "rate_limit"
      ? "No rate-limited visitors"
      : view === "blocked"
        ? "No blocked visitors"
        : "No denied visitors";

  return (
    <Page title="Blocked visitors" subtitle="Denied requests are listed here and are excluded from clean sessions." fullWidth>
      <BlockStack gap="400">
        {query.isError ? (
          <Banner tone="critical" title={query.error instanceof Error ? query.error.message : "Blocked visitors could not be loaded"} />
        ) : null}

        <Card padding="0">
          <Box paddingInline="300" paddingBlockStart="200" borderBlockEndWidth="025" borderColor="border-secondary">
            <InlineStack align="space-between" blockAlign="center" wrap gap="300">
              <Box minWidth="0">
                <Tabs
                  tabs={VIEWS.map((item) => ({ id: item.id, content: item.content }))}
                  selected={selectedView}
                  onSelect={(index) => {
                    setSelectedView(index);
                    setPage(1);
                  }}
                  fitted={false}
                />
              </Box>
              <Box minWidth="160px" maxWidth="200px" width="100%" paddingBlockEnd="200">
                <TextField
                  label="Country"
                  labelHidden
                  value={country}
                  onChange={(value) => {
                    setCountry(value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2));
                    setPage(1);
                  }}
                  autoComplete="off"
                  placeholder="Country code"
                  prefix={<Text as="span" tone="subdued">ISO</Text>}
                  clearButton
                  onClearButtonClick={() => {
                    setCountry("");
                    setPage(1);
                  }}
                  maxLength={2}
                  autoSize
                />
              </Box>
            </InlineStack>
          </Box>

          {country ? (
            <Box paddingInline="400" paddingBlock="200" background="bg-surface-secondary" borderBlockEndWidth="025" borderColor="border-secondary">
              <InlineStack gap="200" blockAlign="center">
                <Text as="span" variant="bodySm" tone="subdued">
                  Showing
                </Text>
                <Badge tone="info">{country}</Badge>
                <Text as="span" variant="bodySm" tone="subdued">
                  {query.isFetching ? "Updating…" : `${rows.length} on this page`}
                </Text>
              </InlineStack>
            </Box>
          ) : null}

          {query.isLoading ? (
            <Box padding="400">
              <SkeletonBodyText lines={10} />
            </Box>
          ) : rows.length === 0 ? (
            <Box padding="500">
              <EmptyState heading={emptyHeading} image="">
                <p>
                  {country
                    ? "Try another country code, or clear the filter to see every denied request."
                    : "Blocked and rate-limited requests will appear here as traffic is denied."}
                </p>
              </EmptyState>
            </Box>
          ) : (
            <div className={query.isFetching ? "tb-chart-fade is-fetching" : undefined}>
              <IndexTable
                resourceName={resourceName}
                itemCount={rows.length}
                selectable={false}
                hasZebraStriping
                headings={[
                  { title: "When" },
                  { title: "Visitor" },
                  { title: "Reason" },
                  { title: "Page" },
                  { title: "Enforcement" },
                ]}
                pagination={{
                  hasPrevious: page > 1,
                  hasNext: (query.data?.length ?? 0) >= PAGE_SIZE,
                  onPrevious: () => setPage((current) => Math.max(1, current - 1)),
                  onNext: () => setPage((current) => current + 1),
                  label: `Page ${page}`,
                }}
              >
                {rows.map((row, index) => {
                  const when = new Date(row.occurredAt);
                  const code = row.countryCode && /^[A-Za-z]{2}$/.test(row.countryCode) ? row.countryCode.toUpperCase() : null;
                  const identity = row.ip ?? row.ipHash;
                  const client = [capitalize(row.device), row.browser].filter(Boolean).join(" · ") || "Unknown client";
                  return (
                    <IndexTable.Row id={row.id} key={row.id} position={index}>
                      <IndexTable.Cell>
                        <BlockStack gap="050">
                          <Text as="span" variant="bodyMd" fontWeight="medium">
                            {when.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                          </Text>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                          </Text>
                        </BlockStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack gap="300" blockAlign="center" wrap={false}>
                          {code ? (
                            <img className="tb-flag" alt="" src={`https://flagcdn.com/24x18/${code.toLowerCase()}.png`} />
                          ) : (
                            <span className="tb-flag tb-flag-empty" />
                          )}
                          <BlockStack gap="050">
                            <Text as="span" variant="bodyMd" fontWeight="medium">
                              {code ?? "Unknown"}
                              {row.asn ? ` · AS${row.asn}` : ""}
                            </Text>
                            <Tooltip content={identity} dismissOnMouseOut>
                              <Text as="span" variant="bodySm" tone="subdued">
                                <span className="tb-mono">{identity.slice(0, 10)}</span>
                              </Text>
                            </Tooltip>
                          </BlockStack>
                        </InlineStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge tone={row.action === "rate_limit" ? "warning" : "critical"}>{reasonLabel(row.reason)}</Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <BlockStack gap="050">
                          <Tooltip content={row.path || "/"} dismissOnMouseOut>
                            <Text as="span" variant="bodyMd" truncate>
                              <span className="tb-mono">{row.path || "/"}</span>
                            </Text>
                          </Tooltip>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {client}
                          </Text>
                        </BlockStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge tone="info">{modeLabel(row.enforcementMode)}</Badge>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}
              </IndexTable>
            </div>
          )}
        </Card>
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

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
