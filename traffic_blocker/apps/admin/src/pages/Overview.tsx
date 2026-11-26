import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Card,
  Divider,
  EmptyState,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  SkeletonBodyText,
  SkeletonDisplayText,
  Spinner,
  Text,
} from "@shopify/polaris";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { io, type Socket } from "socket.io-client";
import { useEffect, useMemo, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api, withQuery } from "../api";
import { DateRangeBar } from "../DateRangeBar";
import { useFilters } from "../filters";
import type { MetricSnapshot, ProtectionStatus, TimeSeriesPoint, BreakdownRow } from "@traffic-blocker/shared-types";

export function OverviewPage() {
  const filters = useFilters();
  const navigate = useNavigate();
  const location = useLocation();
  const query = useQuery({
    queryKey: ["overview", filters.preset, filters.from, filters.to],
    queryFn: () => api<MetricSnapshot>(withQuery("/api/v1/analytics/overview", { preset: filters.preset, from: filters.from, to: filters.to })),
  });
  const status = useQuery({ queryKey: ["status"], queryFn: () => api<ProtectionStatus & { geoipConfigured: boolean }>("/api/v1/firewall/status") });
  const shop = useQuery({ queryKey: ["shop"], queryFn: () => api<{ demo: boolean }>("/api/v1/shops/me") });

  useEffect(() => {
    let active = true;
    let socket: Socket | undefined;
    void (async () => {
      const shopify = (window as Window & { shopify?: { idToken?: () => Promise<string> } }).shopify;
      if (!shopify?.idToken) return;
      const token = await shopify.idToken();
      if (!active) return;
      socket = io({ auth: { token } });
      socket.on("traffic", () => {
        if (active) void query.refetch();
      });
    })();
    return () => {
      active = false;
      socket?.close();
    };
  }, [query]);

  const metrics = query.data;
  const blockRate = useMemo(() => {
    const observed = metrics?.observedRequests ?? 0;
    if (!observed) return null;
    return Math.round(((metrics?.blockedRequests ?? 0) / observed) * 100);
  }, [metrics]);

  const protectionTone = status.data?.edge.protectionActive ? "success" : "info";
  const protectionLabel = status.data?.edge.protectionActive ? "Edge active" : "Shopify-native";

  return (
    <Page
      title="Overview"
      subtitle="Store traffic and protection posture for the selected range."
      secondaryActions={[
        {
          content: "View traffic analytics",
          onAction: () => navigate(`/analytics${location.search}`),
        },
      ]}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <DateRangeBar
              trailing={
                blockRate != null && !query.isLoading ? (
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="span" variant="bodySm" tone="subdued">
                      Block rate
                    </Text>
                    <Badge tone={blockRate >= 50 ? "warning" : "success"}>{`${blockRate}%`}</Badge>
                  </InlineStack>
                ) : null
              }
            />

            {shop.data?.demo ? (
              <Banner tone="warning" title="Demo shop">
                <p>These figures were created by the demo seed and are not production traffic.</p>
              </Banner>
            ) : null}

            {status.isError ? (
              <Banner tone="critical" title="Protection status unavailable">
                <p>{status.error instanceof Error ? status.error.message : "Request failed"}</p>
              </Banner>
            ) : (
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center" wrap gap="300">
                    <Text as="h2" variant="headingMd">
                      Protection status
                    </Text>
                    {status.isLoading ? (
                      <SkeletonDisplayText size="small" />
                    ) : (
                      <Badge tone={protectionTone}>{protectionLabel}</Badge>
                    )}
                  </InlineStack>
                  {status.isLoading ? (
                    <SkeletonBodyText lines={2} />
                  ) : (
                    <Text as="p" variant="bodyMd" tone="subdued">
                      {status.data?.native.summary ?? "Protection details will appear once status loads."}
                    </Text>
                  )}
                  {status.data && !status.data.geoipConfigured ? (
                    <Banner tone="warning" title="GeoIP is not configured">
                      <p>Country decisions stay unavailable until a GeoLite2 City database is configured on the API.</p>
                    </Banner>
                  ) : null}
                </BlockStack>
              </Card>
            )}

            {query.isError ? (
              <Banner tone="critical" title="Analytics could not be loaded">
                <p>{query.error instanceof Error ? query.error.message : "Request failed"}</p>
              </Banner>
            ) : (
              <BlockStack gap="400">
                <MetricSection
                  title="Traffic"
                  description="Request volume observed by Traffic Blocker in this range."
                  loading={query.isLoading}
                  metrics={[
                    { label: "Observed requests", value: metrics?.observedRequests },
                    { label: "Allowed requests", value: metrics?.allowedRequests },
                    { label: "Blocked requests", value: metrics?.blockedRequests },
                  ]}
                />
                {/* <MetricSection
                  title="Protection activity"
                  description="What the firewall detected and how many rules are currently in force."
                  loading={query.isLoading}
                  metrics={[
                    { label: "Detected bots", value: metrics?.detectedBots },
                    { label: "Clean sessions", value: metrics?.cleanSessions },
                    { label: "Active blocking rules", value: metrics?.activeRules },
                    { label: "Countries blocked", value: metrics?.countriesBlocked },
                  ]}
                /> */}
              </BlockStack>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function MetricSection({
  title,
  description,
  loading,
  metrics,
}: {
  title: string;
  description: string;
  loading: boolean;
  metrics: Array<{ label: string; value?: number }>;
}) {
  const observed = metrics[0]?.value ?? 0;
  return (
    <Card padding="0">
      <Box padding="400">
        <BlockStack gap="100">
          <Text as="h2" variant="headingMd">
            {title}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            {description}
          </Text>
        </BlockStack>
      </Box>
      <Divider />
      <div className="tb-metric-row">
        {metrics.map((metric, index) => {
          const value = metric.value ?? 0;
          const share = index > 0 && observed > 0 ? Math.round((value / observed) * 100) : null;
          return (
            <div key={metric.label} className="tb-metric-cell">
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  {metric.label}
                </Text>
                {loading ? (
                  <SkeletonDisplayText size="medium" />
                ) : (
                  <InlineStack gap="200" blockAlign="baseline" wrap>
                    <Text as="p" variant="heading2xl" fontWeight="bold" numeric>
                      {value.toLocaleString()}
                    </Text>
                    {share != null ? (
                      <Badge tone={metric.label.toLowerCase().includes("blocked") ? "warning" : "success"}>
                        {`${share}%`}
                      </Badge>
                    ) : null}
                  </InlineStack>
                )}
              </BlockStack>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ChartPanel({
  title,
  description,
  loading,
  fetching,
  empty,
  children,
}: {
  title: string;
  description?: string;
  loading: boolean;
  fetching?: boolean;
  empty: boolean;
  children: ReactNode;
}) {
  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="start" wrap gap="300">
          <BlockStack gap="100">
            <Text as="h2" variant="headingMd">
              {title}
            </Text>
            {description ? (
              <Text as="p" variant="bodySm" tone="subdued">
                {description}
              </Text>
            ) : null}
          </BlockStack>
          {fetching && !loading ? <Spinner size="small" accessibilityLabel={`Refreshing ${title}`} /> : null}
        </InlineStack>
        <Divider />
        {loading ? (
          <ChartSkeleton />
        ) : empty ? (
          <EmptyState heading="No traffic in this range" image="">
            <p>Try a wider date range, or wait for storefront traffic to be recorded.</p>
          </EmptyState>
        ) : (
          <div className={`tb-chart-fade${fetching ? " is-fetching" : ""}`}>{children}</div>
        )}
      </BlockStack>
    </Card>
  );
}

function ChartSkeleton() {
  return (
    <BlockStack gap="300">
      <SkeletonDisplayText size="small" />
      <Box minHeight="220px" paddingBlockStart="200">
        <SkeletonBodyText lines={8} />
      </Box>
    </BlockStack>
  );
}

function ChartCard({
  title,
  description,
  data,
  bars,
  loading,
  fetching,
}: {
  title: string;
  description?: string;
  data: Array<Record<string, string | number>>;
  bars: string[];
  loading: boolean;
  fetching?: boolean;
}) {
  return (
    <ChartPanel title={title} description={description} loading={loading} fetching={fetching} empty={data.length === 0}>
      <div className="tb-chart">
        <ResponsiveContainer>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6ebf2" />
            <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 12 }} />
            <Tooltip />
            {bars.map((key) => (
              <Bar key={key} dataKey={key} fill={key === "blocked" ? "#b42318" : key === "allowed" ? "#1a7f37" : "#245bdb"} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartPanel>
  );
}

const SLICE_COLORS = ["#1d4ed8", "#0f766e", "#c2410c", "#7c3aed", "#0369a1", "#b45309", "#be123c", "#3f6212"];

function sliceName(label: string): string {
  const text = label.replaceAll("_", " ").trim();
  if (!text) return "Unknown";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function PieCard({
  title,
  description,
  data,
  loading,
  fetching,
}: {
  title: string;
  description?: string;
  data: BreakdownRow[];
  loading: boolean;
  fetching?: boolean;
}) {
  const ranked = [...data].filter((row) => row.count > 0).sort((left, right) => right.count - left.count);
  const head = ranked.slice(0, 5);
  const rest = ranked.slice(5).reduce((sum, row) => sum + row.count, 0);
  const rows = rest > 0 ? [...head, { key: "other", label: "Other", count: rest }] : head;
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const slices = rows.map((row, index) => ({
    ...row,
    name: sliceName(row.label),
    fill: SLICE_COLORS[index % SLICE_COLORS.length],
    share: total === 0 ? 0 : Math.round((row.count / total) * 100),
  }));
  return (
    <ChartPanel title={title} description={description} loading={loading} fetching={fetching} empty={slices.length === 0}>
      <div className="tb-pie">
        <div className="tb-pie-chart">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={slices}
                dataKey="count"
                nameKey="name"
                innerRadius={48}
                outerRadius={72}
                paddingAngle={slices.length > 1 ? 3 : 0}
                stroke="#ffffff"
                strokeWidth={2}
              >
                {slices.map((slice) => (
                  <Cell key={slice.key} fill={slice.fill} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, _name, item) => {
                  const share = (item?.payload as { share?: number } | undefined)?.share ?? 0;
                  return [`${Number(value).toLocaleString()} (${share}%)`, String(item?.name ?? "")];
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="tb-pie-total">
            <strong>{total.toLocaleString()}</strong>
            <span>total</span>
          </div>
        </div>
        <ul className="tb-pie-legend">
          {slices.map((slice) => (
            <li key={slice.key}>
              <i style={{ background: slice.fill }} />
              <span>{slice.name}</span>
              <strong>{slice.share}%</strong>
            </li>
          ))}
        </ul>
      </div>
    </ChartPanel>
  );
}

export function AnalyticsPage() {
  const filters = useFilters();
  const series = useQuery({
    queryKey: ["series", filters.preset, filters.from, filters.to],
    queryFn: () => api<TimeSeriesPoint[]>(withQuery("/api/v1/analytics/timeseries", { preset: filters.preset, from: filters.from, to: filters.to })),
    placeholderData: keepPreviousData,
  });
  const countries = useQuery({
    queryKey: ["breakdown", "country", filters.preset, filters.from, filters.to],
    queryFn: () => api<BreakdownRow[]>(withQuery("/api/v1/analytics/breakdown", { dimension: "country", preset: filters.preset, from: filters.from, to: filters.to })),
    placeholderData: keepPreviousData,
  });
  const reasons = useQuery({
    queryKey: ["breakdown", "reason", filters.preset, filters.from, filters.to],
    queryFn: () => api<BreakdownRow[]>(withQuery("/api/v1/analytics/breakdown", { dimension: "reason", preset: filters.preset, from: filters.from, to: filters.to })),
    placeholderData: keepPreviousData,
  });
  const devices = useQuery({
    queryKey: ["breakdown", "device", filters.preset, filters.from, filters.to],
    queryFn: () => api<BreakdownRow[]>(withQuery("/api/v1/analytics/breakdown", { dimension: "device", preset: filters.preset, from: filters.from, to: filters.to })),
    placeholderData: keepPreviousData,
  });
  const browsers = useQuery({
    queryKey: ["breakdown", "browser", filters.preset, filters.from, filters.to],
    queryFn: () => api<BreakdownRow[]>(withQuery("/api/v1/analytics/breakdown", { dimension: "browser", preset: filters.preset, from: filters.from, to: filters.to })),
    placeholderData: keepPreviousData,
  });
  const sources = useQuery({
    queryKey: ["breakdown", "source", filters.preset, filters.from, filters.to],
    queryFn: () => api<BreakdownRow[]>(withQuery("/api/v1/analytics/breakdown", { dimension: "source", preset: filters.preset, from: filters.from, to: filters.to })),
    placeholderData: keepPreviousData,
  });
  const classes = useQuery({
    queryKey: ["breakdown", "classification", filters.preset, filters.from, filters.to],
    queryFn: () => api<BreakdownRow[]>(withQuery("/api/v1/analytics/breakdown", { dimension: "classification", preset: filters.preset, from: filters.from, to: filters.to })),
    placeholderData: keepPreviousData,
  });
  const hours = useQuery({
    queryKey: ["breakdown", "hour", filters.preset, filters.from, filters.to],
    queryFn: () => api<BreakdownRow[]>(withQuery("/api/v1/analytics/breakdown", { dimension: "hour", preset: filters.preset, from: filters.from, to: filters.to })),
    placeholderData: keepPreviousData,
  });

  const queries = [series, countries, reasons, devices, browsers, sources, classes, hours];
  const failed = queries.find((item) => item.isError);
  const pageFetching = queries.some((item) => item.isFetching);
  const seriesHasPoints = (series.data ?? []).some((row) => row.observed > 0 || row.allowed > 0 || row.blocked > 0 || row.bots > 0);

  return (
    <Page
      title="Traffic analytics"
      subtitle="Observed, allowed, and blocked traffic by time, country, device, and reason."
      primaryAction={{ content: "Export CSV", onAction: () => void exportCsv() }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <DateRangeBar
              trailing={
                pageFetching ? (
                  <InlineStack gap="200" blockAlign="center">
                    <Spinner size="small" accessibilityLabel="Updating analytics" />
                    <Text as="span" variant="bodySm" tone="subdued">
                      Updating
                    </Text>
                  </InlineStack>
                ) : null
              }
            />

            {failed ? (
              <Banner tone="critical" title="Analytics could not be loaded">
                <p>{failed.error instanceof Error ? failed.error.message : "Request failed"}</p>
              </Banner>
            ) : null}

            <ChartPanel
              title="Traffic over time"
              description="Daily observed, allowed, blocked, and bot volume."
              loading={series.isLoading}
              fetching={series.isFetching}
              empty={!seriesHasPoints}
            >
              <div className="tb-chart">
                <ResponsiveContainer>
                  <LineChart data={series.data ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e6ebf2" />
                    <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="observed" name="Observed" stroke="#245bdb" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="allowed" name="Allowed" stroke="#1a7f37" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="blocked" name="Blocked" stroke="#b42318" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="bots" name="Bots" stroke="#7c3aed" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartPanel>

            <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
              <ChartCard
                title="Allowed versus blocked"
                description="Daily comparison of allowed and denied requests."
                loading={series.isLoading}
                fetching={series.isFetching}
                data={(series.data ?? []).map((row) => ({ name: row.date, allowed: row.allowed, blocked: row.blocked }))}
                bars={["allowed", "blocked"]}
              />
              <ChartCard
                title="Country traffic"
                description="Top countries by observed volume."
                loading={countries.isLoading}
                fetching={countries.isFetching}
                data={(countries.data ?? []).slice(0, 8).map((row) => ({ name: row.label, count: row.count }))}
                bars={["count"]}
              />
              <ChartCard
                title="Blocking reasons"
                description="Why requests were denied in this range."
                loading={reasons.isLoading}
                fetching={reasons.isFetching}
                data={(reasons.data ?? []).slice(0, 8).map((row) => ({ name: row.label, count: row.count }))}
                bars={["count"]}
              />
              <ChartCard
                title="Hourly trend"
                description="Traffic distribution across hours of the day."
                loading={hours.isLoading}
                fetching={hours.isFetching}
                data={(hours.data ?? []).map((row) => ({ name: row.label, count: row.count }))}
                bars={["count"]}
              />
              <PieCard title="Bot versus human" description="Share of classified traffic." data={classes.data ?? []} loading={classes.isLoading} fetching={classes.isFetching} />
              <PieCard title="Devices" description="Device mix for observed traffic." data={devices.data ?? []} loading={devices.isLoading} fetching={devices.isFetching} />
              <PieCard title="Browsers" description="Browser mix for observed traffic." data={browsers.data ?? []} loading={browsers.isLoading} fetching={browsers.isFetching} />
              <PieCard title="Traffic sources" description="Where storefront traffic originated." data={sources.data ?? []} loading={sources.isLoading} fetching={sources.isFetching} />
            </InlineGrid>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

async function exportCsv() {
  const filters = useFilters.getState();
  const csv = await api<string>(withQuery("/api/v1/analytics/export", { preset: filters.preset, from: filters.from, to: filters.to }));
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "traffic-blocker-analytics.csv";
  link.click();
  URL.revokeObjectURL(url);
}
