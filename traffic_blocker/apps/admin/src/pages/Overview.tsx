import { useQuery } from "@tanstack/react-query";
import { Banner, BlockStack, Card, InlineGrid, Layout, Page, Select, SkeletonBodyText, Text } from "@shopify/polaris";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { io } from "socket.io-client";
import { useEffect } from "react";
import { api, withQuery } from "../api";
import { useFilters, type Preset } from "../filters";
import type { MetricSnapshot, ProtectionStatus, TimeSeriesPoint, BreakdownRow } from "@traffic-blocker/shared-types";

export function OverviewPage() {
  const filters = useFilters();
  const query = useQuery({
    queryKey: ["overview", filters.preset, filters.from, filters.to],
    queryFn: () => api<MetricSnapshot>(withQuery("/api/v1/analytics/overview", { preset: filters.preset, from: filters.from, to: filters.to })),
  });
  const status = useQuery({ queryKey: ["status"], queryFn: () => api<ProtectionStatus & { geoipConfigured: boolean }>("/api/v1/firewall/status") });
  const shop = useQuery({ queryKey: ["shop"], queryFn: () => api<{ demo: boolean }>("/api/v1/shops/me") });

  useEffect(() => {
    let active = true;
    void (async () => {
      const shopify = (window as Window & { shopify?: { idToken?: () => Promise<string> } }).shopify;
      if (!shopify?.idToken) return;
      const token = await shopify.idToken();
      const socket = io({ auth: { token } });
      socket.on("traffic", () => {
        if (active) void query.refetch();
      });
      return () => socket.close();
    })();
    return () => {
      active = false;
    };
  }, [query]);

  const metrics = query.data;
  return (
    <Page
      title="Overview"
      subtitle="Protection status and store totals. Breakdowns are on Traffic analytics."
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <DateFilters />
            {shop.data?.demo ? <Banner tone="warning" title="Demo shop">These figures were created by the demo seed and are not production traffic.</Banner> : null}
            {status.data ? (
              <Banner tone="info" title="Shopify-native protection">
                <p>{status.data.native.summary}</p>
              </Banner>
            ) : null}
            {query.isLoading ? <SkeletonBodyText lines={6} /> : query.isError ? <Banner tone="critical" title="Analytics could not be loaded"><p>{query.error instanceof Error ? query.error.message : "Request failed"}</p></Banner> : (
              <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="300">
                <Metric label="Observed requests" value={metrics?.observedRequests ?? 0} />
                <Metric label="Allowed requests" value={metrics?.allowedRequests ?? 0} />
                <Metric label="Blocked requests" value={metrics?.blockedRequests ?? 0} />
                <Metric label="Unique blocked visitors" value={metrics?.uniqueBlockedVisitors ?? 0} />
                <Metric label="Detected bots" value={metrics?.detectedBots ?? 0} />
                <Metric label="Clean sessions" value={metrics?.cleanSessions ?? 0} />
                <Metric label="Active blocking rules" value={metrics?.activeRules ?? 0} />
                <Metric label="Countries blocked" value={metrics?.countriesBlocked ?? 0} />
              </InlineGrid>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export function DateFilters() {
  const filters = useFilters();
  return (
    <InlineGrid columns={{ xs: 1, sm: 3 }} gap="200">
      <Select
        label="Date range"
        options={[
          { label: "Last 24 hours", value: "24h" },
          { label: "Last 7 days", value: "7d" },
          { label: "Last 30 days", value: "30d" },
          { label: "Last 90 days", value: "90d" },
          { label: "Custom", value: "custom" },
        ]}
        value={filters.preset}
        onChange={(value) => filters.setPreset(value as Preset)}
      />
      {filters.preset === "custom" ? (
        <>
          <input aria-label="From" type="date" value={filters.from} onChange={(event) => filters.setCustom(event.target.value, filters.to)} />
          <input aria-label="To" type="date" value={filters.to} onChange={(event) => filters.setCustom(filters.from, event.target.value)} />
        </>
      ) : null}
    </InlineGrid>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="tb-metric">
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
}

function ChartCard({ title, data, bars }: { title: string; data: Array<Record<string, string | number>>; bars: string[] }) {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">{title}</Text>
        {data.length === 0 ? <Text as="p" tone="subdued">No traffic in this range.</Text> : (
          <div className="tb-chart">
            <ResponsiveContainer>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                {bars.map((key) => <Bar key={key} dataKey={key} fill={key === "blocked" ? "#b42318" : "#245bdb"} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </BlockStack>
    </Card>
  );
}

const SLICE_COLORS = ["#1d4ed8", "#0f766e", "#c2410c", "#7c3aed", "#0369a1", "#b45309", "#be123c", "#3f6212"];

function sliceName(label: string): string {
  const text = label.replaceAll("_", " ").trim();
  if (!text) return "Unknown";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function PieCard({ title, data }: { title: string; data: BreakdownRow[] }) {
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
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">{title}</Text>
        {slices.length === 0 ? <Text as="p" tone="subdued">No traffic in this range.</Text> : (
          <div className="tb-pie">
            <div className="tb-pie-chart">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={slices} dataKey="count" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={slices.length > 1 ? 3 : 0} stroke="#ffffff" strokeWidth={2}>
                    {slices.map((slice) => <Cell key={slice.key} fill={slice.fill} />)}
                  </Pie>
                  <Tooltip formatter={(value, _name, item) => {
                    const share = (item?.payload as { share?: number } | undefined)?.share ?? 0;
                    return [`${Number(value).toLocaleString()} (${share}%)`, String(item?.name ?? "")];
                  }} />
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
        )}
      </BlockStack>
    </Card>
  );
}

export function AnalyticsPage() {
  const filters = useFilters();
  const series = useQuery({
    queryKey: ["series", filters.preset, filters.from, filters.to],
    queryFn: () => api<TimeSeriesPoint[]>(withQuery("/api/v1/analytics/timeseries", { preset: filters.preset, from: filters.from, to: filters.to })),
  });
  const countries = useQuery({
    queryKey: ["breakdown", "country", filters.preset, filters.from, filters.to],
    queryFn: () => api<BreakdownRow[]>(withQuery("/api/v1/analytics/breakdown", { dimension: "country", preset: filters.preset, from: filters.from, to: filters.to })),
  });
  const reasons = useQuery({
    queryKey: ["breakdown", "reason", filters.preset, filters.from, filters.to],
    queryFn: () => api<BreakdownRow[]>(withQuery("/api/v1/analytics/breakdown", { dimension: "reason", preset: filters.preset, from: filters.from, to: filters.to })),
  });
  const devices = useQuery({
    queryKey: ["breakdown", "device", filters.preset, filters.from, filters.to],
    queryFn: () => api<BreakdownRow[]>(withQuery("/api/v1/analytics/breakdown", { dimension: "device", preset: filters.preset, from: filters.from, to: filters.to })),
  });
  const browsers = useQuery({
    queryKey: ["breakdown", "browser", filters.preset, filters.from, filters.to],
    queryFn: () => api<BreakdownRow[]>(withQuery("/api/v1/analytics/breakdown", { dimension: "browser", preset: filters.preset, from: filters.from, to: filters.to })),
  });
  const sources = useQuery({
    queryKey: ["breakdown", "source", filters.preset, filters.from, filters.to],
    queryFn: () => api<BreakdownRow[]>(withQuery("/api/v1/analytics/breakdown", { dimension: "source", preset: filters.preset, from: filters.from, to: filters.to })),
  });
  const classes = useQuery({
    queryKey: ["breakdown", "classification", filters.preset, filters.from, filters.to],
    queryFn: () => api<BreakdownRow[]>(withQuery("/api/v1/analytics/breakdown", { dimension: "classification", preset: filters.preset, from: filters.from, to: filters.to })),
  });
  const hours = useQuery({
    queryKey: ["breakdown", "hour", filters.preset, filters.from, filters.to],
    queryFn: () => api<BreakdownRow[]>(withQuery("/api/v1/analytics/breakdown", { dimension: "hour", preset: filters.preset, from: filters.from, to: filters.to })),
  });
  const failed = [series, countries, reasons].find((item) => item.isError);
  return (
    <Page
      title="Traffic analytics"
      subtitle="Observed, allowed, and blocked traffic by time, country, device, and reason."
      primaryAction={{ content: "Export CSV", onAction: () => void exportCsv() }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <DateFilters />
            {failed ? <Banner tone="critical" title="Analytics could not be loaded"><p>{failed.error instanceof Error ? failed.error.message : "Request failed"}</p></Banner> : null}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Traffic over time</Text>
                <div className="tb-chart">
                  <ResponsiveContainer>
                    <LineChart data={series.data ?? []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Line dataKey="observed" name="Observed" stroke="#245bdb" />
                      <Line dataKey="allowed" name="Allowed" stroke="#1a7f37" />
                      <Line dataKey="blocked" name="Blocked" stroke="#b42318" />
                      <Line dataKey="bots" name="Bots" stroke="#7c3aed" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </BlockStack>
            </Card>
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
              <ChartCard title="Allowed versus blocked" data={(series.data ?? []).map((row) => ({ name: row.date, allowed: row.allowed, blocked: row.blocked }))} bars={["allowed", "blocked"]} />
              <ChartCard title="Country traffic" data={(countries.data ?? []).slice(0, 8).map((row) => ({ name: row.label, count: row.count }))} bars={["count"]} />
              <ChartCard title="Blocking reasons" data={(reasons.data ?? []).slice(0, 8).map((row) => ({ name: row.label, count: row.count }))} bars={["count"]} />
              <ChartCard title="Hourly trend" data={(hours.data ?? []).map((row) => ({ name: row.label, count: row.count }))} bars={["count"]} />
              <PieCard title="Bot versus human" data={classes.data ?? []} />
              <PieCard title="Devices" data={devices.data ?? []} />
              <PieCard title="Browsers" data={browsers.data ?? []} />
              <PieCard title="Traffic sources" data={sources.data ?? []} />
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
