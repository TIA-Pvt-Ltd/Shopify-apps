import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banner, BlockStack, Button, Card, InlineStack, Page, Text, TextField } from "@shopify/polaris";
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

export function AsnPage({ notify }: { notify: (message: string) => void }) {
  const client = useQueryClient();
  const [q, setQ] = useState("");
  const [asn, setAsn] = useState("");
  const needle = q.trim();
  const search = useQuery({
    queryKey: ["asn-search", needle],
    queryFn: () => api<AsnHit[]>(withQuery("/api/v1/asns/search", { q: needle })),
    enabled: needle.length >= 2,
  });
  const rules = useQuery({ queryKey: ["asns"], queryFn: () => api<AsnPayload>("/api/v1/asns") });
  const save = useMutation({
    mutationFn: (entry: { asn: number; organization?: string }) => api("/api/v1/asns", {
      method: "POST",
      body: JSON.stringify({ asn: entry.asn, organization: entry.organization, enabled: true, mode: "permanent" }),
    }),
    onSuccess: () => {
      setAsn("");
      void client.invalidateQueries({ queryKey: ["asns"] });
      notify("ASN rule saved");
    },
    onError: (error: Error) => notify(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/v1/asns/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["asns"] });
      notify("ASN rule removed");
    },
    onError: (error: Error) => notify(error.message),
  });
  const saved = new Map((rules.data?.rules ?? []).map((rule) => [rule.asn, rule]));
  const manual = Number(asn.replace(/^as/i, ""));
  const manualReady = Number.isInteger(manual) && manual > 0 && !save.isPending;
  const hits = needle.length >= 2 ? search.data ?? [] : [];
  return (
    <Page title="ASN blocking" subtitle="Organization names come from the bundled directory or from traffic observed by this app.">
      <BlockStack gap="400">
        {rules.isError ? <Banner tone="critical" title={rules.error instanceof Error ? rules.error.message : "Networks could not be loaded"} /> : null}
        <Card>
          <BlockStack gap="400">
            <TextField label="Search ASN or provider" value={q} onChange={setQ} autoComplete="off" placeholder="Cloudflare or 13335" helpText="Type at least two characters." />
            {needle.length >= 2 && search.isError ? <Banner tone="critical" title={search.error instanceof Error ? search.error.message : "Search failed"} /> : null}
            {needle.length >= 2 && !search.isError && hits.length === 0 && !search.isLoading ? <Text as="p" tone="subdued">No matching networks.</Text> : null}
            {hits.length > 0 ? (
              <div className="tb-table-wrap">
                <table className="tb-table">
                  <thead>
                    <tr>
                      <th>ASN</th>
                      <th>Organization</th>
                      <th>Type</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {hits.map((row) => {
                      const existing = saved.get(row.asn);
                      return (
                        <tr key={row.asn}>
                          <td><span className="tb-mono">AS{row.asn}</span></td>
                          <td>{row.organization}</td>
                          <td><span className={row.hosting ? "tb-pill tb-pill-warn" : "tb-pill tb-pill-muted"}>{row.hosting ? "Hosting" : "Network"}</span></td>
                          <td>
                            {existing?.enabled ? <span className="tb-pill tb-pill-block">Blocking</span> : (
                              <Button
                                variant="primary"
                                disabled={save.isPending}
                                loading={save.isPending && save.variables?.asn === row.asn}
                                onClick={() => save.mutate({ asn: row.asn, organization: row.organization })}
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
            ) : null}
            <InlineStack gap="200" blockAlign="end">
              <div className="tb-filter">
                <TextField label="ASN number" value={asn} onChange={setAsn} autoComplete="off" placeholder="15169" />
              </div>
              <Button variant="primary" disabled={!manualReady} loading={save.isPending && save.variables?.asn === manual} onClick={() => save.mutate({ asn: manual })}>Block ASN</Button>
            </InlineStack>
          </BlockStack>
        </Card>
        <Card padding="0">
          <div className="tb-card-head">
            <Text as="h2" variant="headingMd">Blocked networks</Text>
          </div>
          {(rules.data?.rules ?? []).length === 0 ? <p className="tb-empty">No networks are blocked yet.</p> : (
            <div className="tb-table-wrap">
              <table className="tb-table tb-events">
                <thead>
                  <tr>
                    <th>ASN</th>
                    <th>Organization</th>
                    <th>Status</th>
                    <th>Blocked</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(rules.data?.rules ?? []).map((rule) => (
                    <tr key={rule._id}>
                      <td><span className="tb-mono">AS{rule.asn}</span></td>
                      <td>{rule.organization || "Unknown organization"}</td>
                      <td><span className={rule.enabled ? "tb-pill tb-pill-block" : "tb-pill tb-pill-muted"}>{rule.enabled ? "Blocking" : "Disabled"}</span></td>
                      <td>{rule.blockedCount.toLocaleString()}</td>
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
            <Text as="h2" variant="headingMd">Seen in traffic</Text>
            <p>Networks recorded on denied requests. Blocking one here uses the same rule as search.</p>
          </div>
          {(rules.data?.observed ?? []).length === 0 ? <p className="tb-empty">No network traffic has been recorded yet.</p> : (
            <div className="tb-table-wrap">
              <table className="tb-table tb-events">
                <thead>
                  <tr>
                    <th>ASN</th>
                    <th>Organization</th>
                    <th>Denied</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(rules.data?.observed ?? []).map((row) => {
                    const existing = saved.get(row.asn);
                    return (
                      <tr key={row.asn}>
                        <td><span className="tb-mono">AS{row.asn}</span></td>
                        <td>{row.organization}</td>
                        <td>{row.requests.toLocaleString()}</td>
                        <td>
                          {existing?.enabled ? <span className="tb-pill tb-pill-block">Blocking</span> : (
                            <Button disabled={save.isPending} loading={save.isPending && save.variables?.asn === row.asn} onClick={() => save.mutate({ asn: row.asn, organization: row.organization })}>Block</Button>
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
      </BlockStack>
    </Page>
  );
}
