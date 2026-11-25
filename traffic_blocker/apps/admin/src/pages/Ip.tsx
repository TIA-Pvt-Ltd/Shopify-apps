import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banner, BlockStack, Button, Card, InlineGrid, InlineStack, Page, Text, TextField } from "@shopify/polaris";
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

export function IpPage({ notify }: { notify: (message: string) => void }) {
  const client = useQueryClient();
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const query = useQuery({ queryKey: ["ips"], queryFn: () => api<IpResponse>("/api/v1/ips") });
  const save = useMutation({
    mutationFn: (input: { list: "block" | "allow"; address?: string }) => api(input.list === "block" ? "/api/v1/ips" : "/api/v1/ips/allow", {
      method: "POST",
      body: JSON.stringify({ value: input.address ?? value, reason, mode: "permanent", enabled: true }),
    }),
    onSuccess: (_data, variables) => {
      if (!variables.address) {
        setValue("");
        setReason("");
      }
      void client.invalidateQueries({ queryKey: ["ips"] });
      notify("IP rule saved");
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
  return (
    <Page title="IP blocking" subtitle="IPv4, IPv6, and CIDR ranges are validated before they are stored.">
      <BlockStack gap="400">
        {query.isError ? <Banner tone="critical" title={query.error instanceof Error ? query.error.message : "IP rules could not be loaded"} /> : null}
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
            <Text as="h2" variant="headingMd">Add an address</Text>
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
              <TextField label="IP or CIDR" value={value} onChange={setValue} autoComplete="off" placeholder="2405:201:5023:4023:71e7:fe47:561f:e195" />
              <TextField label="Reason" value={reason} onChange={setReason} autoComplete="off" placeholder="Office network" />
            </InlineGrid>
            <InlineStack gap="200">
              <Button variant="primary" disabled={!ready} loading={save.isPending && save.variables?.list === "block" && !save.variables.address} onClick={() => save.mutate({ list: "block" })}>Block</Button>
              <Button disabled={!ready} loading={save.isPending && save.variables?.list === "allow"} onClick={() => save.mutate({ list: "allow" })}>Add to allowlist</Button>
            </InlineStack>
          </BlockStack>
        </Card>
        <Card padding="0">
          <div className="tb-card-head">
            <Text as="h2" variant="headingMd">Recent visitor IPs</Text>
            <p>Addresses the firewall actually saw on decide requests. Use these when testing over a tunnel.</p>
          </div>
          {recentClients.length === 0 ? (
            <p className="tb-empty">No recent visitors yet. Open the storefront once, then refresh this page.</p>
          ) : (
            <div className="tb-table-wrap">
              <table className="tb-table tb-events">
                <thead>
                  <tr>
                    <th>Address</th>
                    <th>Note</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recentClients.map((ip) => {
                    const cidr = ip.includes(":") ? `${ip}/128` : `${ip}/32`;
                    const blocked = blockedSet.has(cidr) || blockedSet.has(ip);
                    return (
                      <tr key={ip}>
                        <td><span className="tb-mono">{ip}</span></td>
                        <td>{looksPrivate(ip) ? "Private — will not match tunnel traffic" : "Seen by firewall"}</td>
                        <td>
                          {blocked ? (
                            <span className="tb-pill tb-pill-block">Blocking</span>
                          ) : (
                            <Button
                              variant="primary"
                              loading={save.isPending && save.variables?.address === ip}
                              disabled={save.isPending}
                              onClick={() => save.mutate({ list: "block", address: ip })}
                            >
                              Block
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card padding="0">
          <div className="tb-card-head">
            <Text as="h2" variant="headingMd">Block list</Text>
          </div>
          {blocks.length === 0 ? <p className="tb-empty">No IP blocks yet.</p> : (
            <div className="tb-table-wrap">
              <table className="tb-table tb-events">
                <thead>
                  <tr>
                    <th>Address</th>
                    <th>Status</th>
                    <th>Blocked</th>
                    <th>Reason</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {blocks.map((rule) => (
                    <tr key={rule._id}>
                      <td><span className="tb-mono">{rule.cidr}</span></td>
                      <td><span className={rule.enabled ? "tb-pill tb-pill-block" : "tb-pill tb-pill-muted"}>{rule.enabled ? "Blocking" : "Disabled"}</span></td>
                      <td>{rule.blockedCount.toLocaleString()}</td>
                      <td>{rule.reason || "—"}</td>
                      <td>
                        <Button
                          variant="plain"
                          tone="critical"
                          loading={remove.isPending && remove.variables === rule._id}
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(rule._id)}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card padding="0">
          <div className="tb-card-head">
            <Text as="h2" variant="headingMd">Allowlist</Text>
            <p>These addresses skip country, IP, and network blocks only when allowlist override is turned on. Custom rules still run first.</p>
          </div>
          {allowlist.length === 0 ? <p className="tb-empty">No allowlisted addresses yet.</p> : (
            <div className="tb-table-wrap">
              <table className="tb-table tb-events">
                <thead>
                  <tr>
                    <th>Address</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {allowlist.map((rule) => (
                    <tr key={rule._id}>
                      <td><span className="tb-mono">{rule.value}</span></td>
                      <td>{rule.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
