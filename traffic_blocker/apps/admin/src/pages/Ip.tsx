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
  Text,
  TextField,
  Tooltip,
} from "@shopify/polaris";
import { api } from "../api";

interface IpRule {
  _id: string;
  cidr: string;
  mode: string;
  enabled: boolean;
  reason: string;
  blockedCount: number;
}

interface AllowRule {
  _id: string;
  value: string;
  note: string;
}

interface IpResponse {
  blocks: IpRule[];
  allowlist: AllowRule[];
  recentClients?: string[];
}

function looksPrivate(value: string): boolean {
  const trimmed = value.trim().split("/")[0] ?? "";
  if (!trimmed) return false;
  if (/^10\./.test(trimmed) || /^192\.168\./.test(trimmed) || /^127\./.test(trimmed)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(trimmed)) return true;
  if (/^fc/i.test(trimmed) || /^fd/i.test(trimmed) || /^fe80:/i.test(trimmed) || /^::1$/i.test(trimmed)) return true;
  return false;
}

function SectionSkeleton({ lines = 6 }: { lines?: number }) {
  return (
    <Box padding="400">
      <SkeletonBodyText lines={lines} />
    </Box>
  );
}

export function IpPage({ notify }: { notify: (message: string) => void }) {
  const client = useQueryClient();
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const query = useQuery({
    queryKey: ["ips"],
    queryFn: () => api<IpResponse>("/api/v1/ips"),
    placeholderData: keepPreviousData,
  });
  const save = useMutation({
    mutationFn: (input: { list: "block" | "allow"; address?: string }) =>
      api(input.list === "block" ? "/api/v1/ips" : "/api/v1/ips/allow", {
        method: "POST",
        body: JSON.stringify({ value: input.address ?? value, reason, mode: "permanent", enabled: true }),
      }),
    onSuccess: (_data, variables) => {
      if (!variables.address) {
        setValue("");
        setReason("");
      }
      void client.invalidateQueries({ queryKey: ["ips"] });
      notify(variables.list === "allow" ? "Address added to allowlist" : "IP rule saved");
      save.reset();
    },
    onError: (error: Error) => notify(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/v1/ips/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["ips"] });
      notify("IP rule removed");
      remove.reset();
    },
    onError: (error: Error) => notify(error.message),
  });

  const blocks = query.data?.blocks ?? [];
  const allowlist = query.data?.allowlist ?? [];
  const recentClients = query.data?.recentClients ?? [];
  const blockedSet = useMemo(() => new Set(blocks.map((rule) => rule.cidr)), [blocks]);
  const ready = value.trim().length > 0 && !save.isPending;
  const privateWarning = looksPrivate(value);
  const loading = query.isLoading;

  return (
    <Page title="IP blocking" subtitle="IPv4, IPv6, and CIDR ranges are validated before they are stored.">
      <BlockStack gap="400">
        {query.isError ? (
          <Banner tone="critical" title={query.error instanceof Error ? query.error.message : "IP rules could not be loaded"} />
        ) : null}
        {privateWarning ? (
          <Banner tone="warning" title="Private LAN addresses do not match storefront traffic">
            <p>
              Through the Cloudflare tunnel the firewall sees your public or temporary IPv6 address, not <span className="tb-mono">192.168.x.x</span>.
              Block a recent visitor IP below, or paste the Temporary IPv6 from <span className="tb-mono">ipconfig</span>.
            </p>
          </Banner>
        ) : null}

        <Card>
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                Add an address
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Block a visitor address or add it to the allowlist for trusted traffic.
              </Text>
            </BlockStack>
            <Divider />
            <FormLayout>
              <FormLayout.Group>
                <TextField
                  label="IP or CIDR"
                  value={value}
                  onChange={setValue}
                  autoComplete="off"
                  placeholder="203.0.113.10 or 2001:db8::/32"
                  monospaced
                  clearButton
                  onClearButtonClick={() => setValue("")}
                />
                <TextField
                  label="Reason"
                  value={reason}
                  onChange={setReason}
                  autoComplete="off"
                  placeholder="Office network"
                  clearButton
                  onClearButtonClick={() => setReason("")}
                />
              </FormLayout.Group>
            </FormLayout>
            <InlineStack gap="200">
              <Button
                variant="primary"
                tone="critical"
                disabled={!ready}
                loading={save.isPending && save.variables?.list === "block" && !save.variables.address}
                onClick={() => save.mutate({ list: "block" })}
              >
                Block address
              </Button>
              <Button
                disabled={!ready}
                loading={save.isPending && save.variables?.list === "allow"}
                onClick={() => save.mutate({ list: "allow" })}
              >
                Add to allowlist
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card padding="0">
          <Box padding="400">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                Recent visitor IPs
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Addresses the firewall actually saw on decide requests. Use these when testing over a tunnel.
              </Text>
            </BlockStack>
          </Box>
          <Divider />
          {loading ? (
            <SectionSkeleton />
          ) : recentClients.length === 0 ? (
            <Box padding="400">
              <EmptyState heading="No recent visitors yet" image="">
                <p>Open the storefront once, then refresh this page.</p>
              </EmptyState>
            </Box>
          ) : (
            <div className={query.isFetching ? "tb-chart-fade is-fetching" : undefined}>
              <IndexTable
                resourceName={{ singular: "visitor IP", plural: "visitor IPs" }}
                itemCount={recentClients.length}
                selectable={false}
                headings={[{ title: "Address" }, { title: "Note" }, { title: "Action", alignment: "end" }]}
                hasZebraStriping
              >
                {recentClients.map((ip, index) => {
                  const cidr = ip.includes(":") ? `${ip}/128` : `${ip}/32`;
                  const blocked = blockedSet.has(cidr) || blockedSet.has(ip);
                  const isPrivate = looksPrivate(ip);
                  return (
                    <IndexTable.Row id={ip} key={ip} position={index}>
                      <IndexTable.Cell>
                        <Tooltip content={ip} dismissOnMouseOut>
                          <Text as="span" variant="bodyMd" truncate>
                            <span className="tb-mono">{ip}</span>
                          </Text>
                        </Tooltip>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {isPrivate ? (
                          <Badge tone="warning">Private — will not match tunnel traffic</Badge>
                        ) : (
                          <Text as="span" variant="bodySm" tone="subdued">
                            Seen by firewall
                          </Text>
                        )}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack align="end">
                          {blocked ? (
                            <Badge tone="critical">Blocking</Badge>
                          ) : (
                            <Button
                              size="slim"
                              tone="critical"
                              loading={save.isPending && save.variables?.address === ip}
                              disabled={save.isPending}
                              onClick={() => save.mutate({ list: "block", address: ip })}
                            >
                              Block
                            </Button>
                          )}
                        </InlineStack>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}
              </IndexTable>
            </div>
          )}
        </Card>

        <div className="tb-equal-cards">
          <div className="tb-equal-card">
            <Card padding="0">
              <div className="tb-equal-card-inner">
                <Box padding="400">
                  <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingMd">
                        Block list
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Addresses currently denied at the firewall.
                      </Text>
                    </BlockStack>
                    {!loading ? <Badge>{`${blocks.length}`}</Badge> : null}
                  </InlineStack>
                </Box>
                <Divider />
                <div className="tb-equal-card-body">
                  {loading ? (
                    <SectionSkeleton lines={5} />
                  ) : blocks.length === 0 ? (
                    <Box padding="400">
                      <EmptyState heading="No IP blocks yet" image="">
                        <p>Block an address above or from recent visitor IPs.</p>
                      </EmptyState>
                    </Box>
                  ) : (
                    <div className={query.isFetching ? "tb-chart-fade is-fetching" : undefined}>
                      <IndexTable
                        resourceName={{ singular: "blocked address", plural: "blocked addresses" }}
                        itemCount={blocks.length}
                        selectable={false}
                        headings={[
                          { title: "Address" },
                          { title: "Status" },
                          { title: "Blocked", alignment: "end" },
                          { title: "Reason" },
                          { title: "", alignment: "end" },
                        ]}
                        hasZebraStriping
                      >
                        {blocks.map((rule, index) => (
                          <IndexTable.Row id={rule._id} key={rule._id} position={index}>
                            <IndexTable.Cell>
                              <Tooltip content={rule.cidr} dismissOnMouseOut>
                                <Text as="span" variant="bodyMd" truncate>
                                  <span className="tb-mono">{rule.cidr}</span>
                                </Text>
                              </Tooltip>
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
                              <Text as="span" variant="bodySm" tone="subdued">
                                {rule.reason || "—"}
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
                  )}
                </div>
              </div>
            </Card>
          </div>

          <div className="tb-equal-card">
            <Card padding="0">
              <div className="tb-equal-card-inner">
                <Box padding="400">
                  <BlockStack gap="100">
                    <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                      <Text as="h2" variant="headingMd">
                        Allowlist
                      </Text>
                      {!loading ? <Badge tone="success">{`${allowlist.length}`}</Badge> : null}
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">
                      These addresses skip country, IP, and network blocks only when allowlist override is turned on. Custom rules still run first.
                    </Text>
                  </BlockStack>
                </Box>
                <Divider />
                <div className="tb-equal-card-body">
                  {loading ? (
                    <SectionSkeleton lines={4} />
                  ) : allowlist.length === 0 ? (
                    <Box padding="400">
                      <EmptyState heading="No allowlisted addresses" image="">
                        <p>Add a trusted IP from the form above.</p>
                      </EmptyState>
                    </Box>
                  ) : (
                    <div className={query.isFetching ? "tb-chart-fade is-fetching" : undefined}>
                      <IndexTable
                        resourceName={{ singular: "allowlisted address", plural: "allowlisted addresses" }}
                        itemCount={allowlist.length}
                        selectable={false}
                        headings={[{ title: "Address" }, { title: "Note" }]}
                        hasZebraStriping
                      >
                        {allowlist.map((rule, index) => (
                          <IndexTable.Row id={rule._id} key={rule._id} position={index}>
                            <IndexTable.Cell>
                              <Tooltip content={rule.value} dismissOnMouseOut>
                                <Text as="span" variant="bodyMd" truncate>
                                  <span className="tb-mono">{rule.value}</span>
                                </Text>
                              </Tooltip>
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              <Text as="span" variant="bodySm" tone="subdued">
                                {rule.note || "—"}
                              </Text>
                            </IndexTable.Cell>
                          </IndexTable.Row>
                        ))}
                      </IndexTable>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>
        </div>
      </BlockStack>
    </Page>
  );
}
