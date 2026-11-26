import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  EmptyState,
  FormLayout,
  IndexTable,
  InlineStack,
  Page,
  SkeletonBodyText,
  SkeletonDisplayText,
  Tabs,
  Text,
  TextField,
  Tooltip,
} from "@shopify/polaris";
import { api, withQuery } from "../api";

interface AsnHit {
  asn: number;
  organization: string;
  hosting: boolean;
}

interface AsnRule {
  _id: string;
  asn: number;
  organization: string;
  enabled: boolean;
  blockedCount: number;
}

interface AsnPayload {
  rules: AsnRule[];
  observed: Array<{ asn: number; organization: string; requests: number }>;
}

type ListTab = "blocked" | "seen";

export function AsnPage({ notify }: { notify: (message: string) => void }) {
  const client = useQueryClient();
  const [q, setQ] = useState("");
  const [asn, setAsn] = useState("");
  const [selectedTab, setSelectedTab] = useState(0);
  const needle = q.trim();
  const listTab: ListTab = selectedTab === 1 ? "seen" : "blocked";

  const search = useQuery({
    queryKey: ["asn-search", needle],
    queryFn: () => api<AsnHit[]>(withQuery("/api/v1/asns/search", { q: needle })),
    enabled: needle.length >= 2,
    placeholderData: keepPreviousData,
  });

  const rules = useQuery({
    queryKey: ["asns"],
    queryFn: () => api<AsnPayload>("/api/v1/asns"),
    placeholderData: keepPreviousData,
  });

  const save = useMutation({
    mutationFn: (entry: { asn: number; organization?: string }) =>
      api("/api/v1/asns", {
        method: "POST",
        body: JSON.stringify({ asn: entry.asn, organization: entry.organization, enabled: true, mode: "permanent" }),
      }),
    onSuccess: () => {
      setAsn("");
      void client.invalidateQueries({ queryKey: ["asns"] });
      notify("ASN rule saved");
      save.reset();
    },
    onError: (error: Error) => notify(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/v1/asns/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["asns"] });
      notify("ASN rule removed");
      remove.reset();
    },
    onError: (error: Error) => notify(error.message),
  });

  const saved = useMemo(() => new Map((rules.data?.rules ?? []).map((rule) => [rule.asn, rule])), [rules.data?.rules]);
  const manual = Number(asn.replace(/^as/i, ""));
  const manualReady = Number.isInteger(manual) && manual > 0 && !save.isPending;
  const hits = needle.length >= 2 ? search.data ?? [] : [];
  const blocked = rules.data?.rules ?? [];
  const observed = rules.data?.observed ?? [];
  const denied = observed.reduce((sum, row) => sum + row.requests, 0);
  const loading = rules.isLoading;
  const searching = needle.length >= 2;

  const tabs = [
    { id: "blocked", content: "Blocked", badge: String(blocked.length) },
    { id: "seen", content: "Seen in traffic", badge: String(observed.length) },
  ];

  return (
    <Page
      title="ASN blocking"
      subtitle="Deny visitors whose IP belongs to a network. The server looks up the ASN automatically."
      fullWidth
    >
      <BlockStack gap="400">
        {rules.isError ? (
          <Banner tone="critical" title={rules.error instanceof Error ? rules.error.message : "Networks could not be loaded"} />
        ) : null}

        <Card padding="0">
          {loading ? (
            <Box padding="400">
              <InlineStack gap="800" wrap>
                <SkeletonDisplayText size="small" />
                <SkeletonDisplayText size="small" />
                <SkeletonDisplayText size="small" />
              </InlineStack>
            </Box>
          ) : (
            <div className="tb-metric-row">
              <MetricCell label="Blocked networks" value={blocked.length} />
              <MetricCell label="Networks seen" value={observed.length} />
              <MetricCell label="Denied visits" value={denied} />
            </div>
          )}
        </Card>

        <Card>
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                Add a network
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Search the directory, or enter an ASN directly. AS15169 and 15169 are the same rule.
              </Text>
            </BlockStack>
            <Divider />
            <FormLayout>
              <FormLayout.Group>
                <TextField
                  label="Search provider or ASN"
                  value={q}
                  onChange={setQ}
                  autoComplete="off"
                  placeholder="Cloudflare or 13335"
                  helpText="Enter at least 2 characters to search."
                  clearButton
                  onClearButtonClick={() => setQ("")}
                  loading={search.isFetching && searching}
                />
                <InlineStack gap="200" blockAlign="end" wrap={false}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <TextField
                      label="ASN number"
                      value={asn}
                      onChange={setAsn}
                      autoComplete="off"
                      placeholder="15169"
                      monospaced
                      clearButton
                      onClearButtonClick={() => setAsn("")}
                    />
                  </div>
                  <Button
                    variant="primary"
                    tone="critical"
                    disabled={!manualReady}
                    loading={save.isPending && save.variables?.asn === manual}
                    onClick={() => save.mutate({ asn: manual })}
                  >
                    Block ASN
                  </Button>
                </InlineStack>
              </FormLayout.Group>
            </FormLayout>
          </BlockStack>
        </Card>

        {searching ? (
          <Card padding="0">
            <Box padding="400" borderBlockEndWidth="025" borderColor="border-secondary">
              <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Search results
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Networks matching “{needle}”.
                  </Text>
                </BlockStack>
                <Badge tone={search.isFetching ? undefined : "info"}>{search.isFetching ? "Updating" : `${hits.length} found`}</Badge>
              </InlineStack>
            </Box>
            {search.isError ? (
              <Box padding="400">
                <Banner tone="critical" title={search.error instanceof Error ? search.error.message : "Search failed"} />
              </Box>
            ) : search.isLoading ? (
              <Box padding="400">
                <SkeletonBodyText lines={6} />
              </Box>
            ) : hits.length === 0 ? (
              <Box padding="500">
                <EmptyState heading="No networks match" image="">
                  <p>Try another provider name, or block by ASN number above.</p>
                </EmptyState>
              </Box>
            ) : (
              <div className={search.isFetching ? "tb-chart-fade is-fetching" : undefined}>
                <IndexTable
                  resourceName={{ singular: "network", plural: "networks" }}
                  itemCount={hits.length}
                  selectable={false}
                  headings={[{ title: "Network" }, { title: "Type" }, { title: "Action", alignment: "end" }]}
                  hasZebraStriping
                >
                  {hits.map((row, index) => (
                    <IndexTable.Row id={`search-${row.asn}`} key={row.asn} position={index}>
                      <IndexTable.Cell>
                        <NetworkIdentity asn={row.asn} name={row.organization} />
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge>{row.hosting ? "Hosting" : "Network"}</Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack align="end">
                          <BlockAction
                            existing={saved.get(row.asn)}
                            pending={save.isPending}
                            loading={save.isPending && save.variables?.asn === row.asn}
                            onBlock={() => save.mutate({ asn: row.asn, organization: row.organization })}
                          />
                        </InlineStack>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              </div>
            )}
          </Card>
        ) : null}

        <Card padding="0">
          <Box paddingInline="300" paddingBlockStart="200" borderBlockEndWidth="025" borderColor="border-secondary">
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab} />
          </Box>

          {loading ? (
            <Box padding="400">
              <SkeletonBodyText lines={8} />
            </Box>
          ) : listTab === "blocked" ? (
            blocked.length === 0 ? (
              <Box padding="500">
                <EmptyState heading="No networks are blocked" image="">
                  <p>Search for a provider or enter an ASN. The next matching visit is denied.</p>
                </EmptyState>
              </Box>
            ) : (
              <div className={rules.isFetching ? "tb-chart-fade is-fetching" : undefined}>
                <IndexTable
                  resourceName={{ singular: "blocked network", plural: "blocked networks" }}
                  itemCount={blocked.length}
                  selectable={false}
                  headings={[
                    { title: "Network" },
                    { title: "Status" },
                    { title: "Blocked visits", alignment: "end" },
                    { title: "", alignment: "end" },
                  ]}
                  hasZebraStriping
                >
                  {blocked.map((rule, index) => (
                    <IndexTable.Row id={rule._id} key={rule._id} position={index}>
                      <IndexTable.Cell>
                        <NetworkIdentity asn={rule.asn} name={rule.organization || "Unknown organization"} />
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge tone={rule.enabled ? "critical" : undefined}>{rule.enabled ? "Blocking" : "Disabled"}</Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text as="span" variant="bodyMd" alignment="end" numeric>
                          {rule.blockedCount.toLocaleString()}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack align="end">
                          <Button
                            variant="plain"
                            tone="critical"
                            loading={remove.isPending && remove.variables === rule._id}
                            disabled={remove.isPending}
                            onClick={() => remove.mutate(rule._id)}
                          >
                            Remove
                          </Button>
                        </InlineStack>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              </div>
            )
          ) : observed.length === 0 ? (
            <Box padding="500">
              <EmptyState heading="No networks recorded yet" image="">
                <p>Denied visits appear here with the ASN the server observed.</p>
              </EmptyState>
            </Box>
          ) : (
            <div className={rules.isFetching ? "tb-chart-fade is-fetching" : undefined}>
              <IndexTable
                resourceName={{ singular: "observed network", plural: "observed networks" }}
                itemCount={observed.length}
                selectable={false}
                headings={[
                  { title: "Network" },
                  { title: "Denied visits", alignment: "end" },
                  { title: "Action", alignment: "end" },
                ]}
                hasZebraStriping
              >
                {observed.map((row, index) => (
                  <IndexTable.Row id={`seen-${row.asn}`} key={row.asn} position={index}>
                    <IndexTable.Cell>
                      <BlockStack gap="050">
                        <NetworkIdentity asn={row.asn} name={row.organization} />
                        <Text as="span" variant="bodySm" tone="subdued">
                          Recorded on a denied request
                        </Text>
                      </BlockStack>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodyMd" alignment="end" numeric>
                        {row.requests.toLocaleString()}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <InlineStack align="end">
                        <BlockAction
                          existing={saved.get(row.asn)}
                          pending={save.isPending}
                          loading={save.isPending && save.variables?.asn === row.asn}
                          onBlock={() => save.mutate({ asn: row.asn, organization: row.organization })}
                        />
                      </InlineStack>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            </div>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}

function MetricCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="tb-metric-cell">
      <BlockStack gap="200">
        <Text as="p" variant="bodySm" tone="subdued">
          {label}
        </Text>
        <Text as="p" variant="headingXl" fontWeight="semibold" numeric>
          {value.toLocaleString()}
        </Text>
      </BlockStack>
    </div>
  );
}

function NetworkIdentity({ asn, name }: { asn: number; name: string }) {
  return (
    <InlineStack gap="300" blockAlign="center" wrap={false}>
      <Badge tone="info">{`AS${asn}`}</Badge>
      <Tooltip content={name} dismissOnMouseOut>
        <Text as="span" variant="bodyMd" fontWeight="medium" truncate>
          {name}
        </Text>
      </Tooltip>
    </InlineStack>
  );
}

function BlockAction({
  existing,
  pending,
  loading,
  onBlock,
}: {
  existing: AsnRule | undefined;
  pending: boolean;
  loading: boolean;
  onBlock: () => void;
}) {
  if (existing?.enabled) return <Badge tone="critical">Blocking</Badge>;
  return (
    <Button size="slim" tone="critical" disabled={pending} loading={loading} onClick={onBlock}>
      Block
    </Button>
  );
}
