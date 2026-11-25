import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banner, Button, Card, Page, Text, TextField } from "@shopify/polaris";
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
  const saved = new Map((rules.data?.rules ?? []).map((rule) => [rule.asn, rule]));
  const manual = Number(asn.replace(/^as/i, ""));
  const manualReady = Number.isInteger(manual) && manual > 0 && !save.isPending;
  const hits = needle.length >= 2 ? search.data ?? [] : [];
  const blocked = rules.data?.rules ?? [];
  const observed = rules.data?.observed ?? [];
  const denied = observed.reduce((sum, row) => sum + row.requests, 0);
  return (
    <Page title="ASN blocking" subtitle="Deny every visitor whose IP belongs to a network. The server looks up the ASN. A name is not required for the rule to match.">
      <div className="tb-asn">
        {rules.isError ? <Banner tone="critical" title={rules.error instanceof Error ? rules.error.message : "Networks could not be loaded"} /> : null}
        <div className="tb-asn-metrics">
          <div className="tb-metric"><span>Blocked networks</span><strong>{blocked.length}</strong></div>
          <div className="tb-metric"><span>Networks seen</span><strong>{observed.length}</strong></div>
          <div className="tb-metric"><span>Denied visits</span><strong>{denied.toLocaleString()}</strong></div>
        </div>
        <Card>
          <div className="tb-asn-compose">
            <div>
              <Text as="h2" variant="headingMd">Find a network</Text>
              <p>Search the directory by provider name or number. Two characters starts the search.</p>
              <div className="tb-asn-field">
                <TextField label="Search ASN or provider" labelHidden value={q} onChange={setQ} autoComplete="off" placeholder="Cloudflare or 13335" />
              </div>
            </div>
            <div>
              <Text as="h2" variant="headingMd">Block by number</Text>
              <p>Use this when the network is not listed. AS15169 and 15169 are the same rule.</p>
              <div className="tb-asn-add-row">
                <TextField label="ASN number" value={asn} onChange={setAsn} autoComplete="off" placeholder="15169" />
                <Button variant="primary" disabled={!manualReady} loading={save.isPending && save.variables?.asn === manual} onClick={() => save.mutate({ asn: manual })}>Block</Button>
              </div>
            </div>
          </div>
          {needle.length >= 2 ? (
            <div className="tb-asn-results">
              {search.isError ? <Banner tone="critical" title={search.error instanceof Error ? search.error.message : "Search failed"} /> : null}
              {search.isLoading ? <p className="tb-empty">Searching the directory…</p> : null}
              {!search.isLoading && !search.isError && hits.length === 0 ? <p className="tb-empty">No networks match that search.</p> : null}
              {hits.map((row) => (
                <NetworkRow
                  key={row.asn}
                  asn={row.asn}
                  title={row.organization}
                  meta={row.hosting ? "Hosting network" : "Network"}
                  action={blockControl(saved.get(row.asn), save.isPending, save.isPending && save.variables?.asn === row.asn, () => save.mutate({ asn: row.asn, organization: row.organization }))}
                />
              ))}
            </div>
          ) : null}
        </Card>
        <Card padding="0">
          <div className="tb-asn-head">
            <div>
              <Text as="h2" variant="headingMd">Blocked networks</Text>
              <p>An enabled rule denies the visit when the lookup returns that number.</p>
            </div>
          </div>
          {rules.isLoading ? <p className="tb-empty">Loading blocked networks…</p> : blocked.length === 0 ? (
            <div className="tb-asn-empty">
              <strong>No networks are blocked</strong>
              <p>Search for a provider or enter an ASN. The next matching visit is denied.</p>
            </div>
          ) : (
            <div className="tb-asn-list">
              {blocked.map((rule) => (
                <NetworkRow
                  key={rule._id}
                  asn={rule.asn}
                  title={rule.organization || "Unknown organization"}
                  meta={rule.enabled ? "Blocking" : "Disabled"}
                  count={rule.blockedCount}
                  countLabel="Blocked"
                  action={<Button variant="plain" tone="critical" loading={remove.isPending && remove.variables === rule._id} disabled={remove.isPending} onClick={() => remove.mutate(rule._id)}>Remove</Button>}
                />
              ))}
            </div>
          )}
        </Card>
        <Card padding="0">
          <div className="tb-asn-head">
            <div>
              <Text as="h2" variant="headingMd">Seen in traffic</Text>
              <p>Networks already recorded on denied requests. Blocking one uses the same rule as search.</p>
            </div>
          </div>
          {rules.isLoading ? <p className="tb-empty">Loading observed networks…</p> : observed.length === 0 ? (
            <div className="tb-asn-empty">
              <strong>No networks recorded yet</strong>
              <p>Denied visits appear here with the ASN the server observed.</p>
            </div>
          ) : (
            <div className="tb-asn-list">
              {observed.map((row) => (
                <NetworkRow
                  key={row.asn}
                  asn={row.asn}
                  title={row.organization}
                  meta="Recorded on a denied request"
                  count={row.requests}
                  countLabel="Denied"
                  action={blockControl(saved.get(row.asn), save.isPending, save.isPending && save.variables?.asn === row.asn, () => save.mutate({ asn: row.asn, organization: row.organization }))}
                />
              ))}
            </div>
          )}
        </Card>
      </div>
    </Page>
  );
}

function blockControl(existing: AsnRule | undefined, pending: boolean, loading: boolean, onBlock: () => void): ReactNode {
  if (existing?.enabled) return <span className="tb-pill tb-pill-block">Blocking</span>;
  return <Button variant="primary" disabled={pending} loading={loading} onClick={onBlock}>Block</Button>;
}

function NetworkRow({ asn, title, meta, count, countLabel, action }: {
  asn: number;
  title: string;
  meta: string;
  count?: number;
  countLabel?: string;
  action: ReactNode;
}) {
  return (
    <div className="tb-asn-row">
      <span className="tb-asn-id">AS{asn}</span>
      <div className="tb-stack">
        <strong>{title}</strong>
        <span>{meta}</span>
      </div>
      <div className="tb-asn-end">
        {count !== undefined ? <div className="tb-asn-count"><strong>{count.toLocaleString()}</strong><span>{countLabel}</span></div> : null}
        {action}
      </div>
    </div>
  );
}
