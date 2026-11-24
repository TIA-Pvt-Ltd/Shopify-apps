import { useState } from "react";
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
}

export function IpPage({ notify }: { notify: (message: string) => void }) {
  const client = useQueryClient();
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const query = useQuery({ queryKey: ["ips"], queryFn: () => api<IpResponse>("/api/v1/ips") });
  const save = useMutation({
    mutationFn: (list: "block" | "allow") => api(list === "block" ? "/api/v1/ips" : "/api/v1/ips/allow", {
      method: "POST",
      body: JSON.stringify({ value, reason, mode: "permanent", enabled: true }),
    }),
    onSuccess: () => {
      setValue("");
      setReason("");
      void client.invalidateQueries({ queryKey: ["ips"] });
      notify("IP rule saved");
    },
    onError: (error: Error) => notify(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/v1/ips/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["ips"] });
      notify("IP rule removed");
    },
    onError: (error: Error) => notify(error.message),
  });
  const blocks = query.data?.blocks ?? [];
  const allowlist = query.data?.allowlist ?? [];
  const ready = value.trim().length > 0 && !save.isPending;
  return (
    <Page title="IP blocking" subtitle="IPv4, IPv6, and CIDR ranges are validated before they are stored.">
      <BlockStack gap="400">
        {query.isError ? <Banner tone="critical" title={query.error instanceof Error ? query.error.message : "IP rules could not be loaded"} /> : null}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Add an address</Text>
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
              <TextField label="IP or CIDR" value={value} onChange={setValue} autoComplete="off" placeholder="192.168.1.0/24" />
              <TextField label="Reason" value={reason} onChange={setReason} autoComplete="off" placeholder="Office network" />
            </InlineGrid>
            <InlineStack gap="200">
              <Button variant="primary" disabled={!ready} loading={save.isPending && save.variables === "block"} onClick={() => save.mutate("block")}>Block</Button>
              <Button disabled={!ready} loading={save.isPending && save.variables === "allow"} onClick={() => save.mutate("allow")}>Add to allowlist</Button>
            </InlineStack>
          </BlockStack>
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
                      <td><Button variant="plain" tone="critical" disabled={remove.isPending} onClick={() => remove.mutate(rule._id)}>Remove</Button></td>
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
