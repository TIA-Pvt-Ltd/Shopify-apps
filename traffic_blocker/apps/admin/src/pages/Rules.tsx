import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banner, BlockStack, Button, Card, InlineStack, Page, Select, Text, TextField } from "@shopify/polaris";
import { api } from "../api";

interface Rule {
  _id: string;
  name: string;
  priority: number;
  action: string;
  enabled: boolean;
}

interface Simulation {
  action: string;
  reason: string;
  layer: string;
  note: string;
}

const ACTIONS = [
  { label: "Allow", value: "allow" },
  { label: "Monitor", value: "monitor" },
  { label: "Challenge", value: "challenge" },
  { label: "Rate limit", value: "rate_limit" },
  { label: "Block", value: "block" },
];

export function RulesPage({ notify }: { notify: (message: string) => void }) {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [country, setCountry] = useState("IN");
  const [action, setAction] = useState("block");
  const [ip, setIp] = useState("203.0.113.10");
  const rules = useQuery({ queryKey: ["rules"], queryFn: () => api<Rule[]>("/api/v1/rules") });
  const conflicts = useQuery({ queryKey: ["conflicts"], queryFn: () => api<Array<{ reason: string }>>("/api/v1/rules/conflicts") });
  const create = useMutation({
    mutationFn: () => api("/api/v1/rules", {
      method: "POST",
      body: JSON.stringify({
        name,
        priority: 100,
        enabled: true,
        combinator: "and",
        action,
        conditions: [{ field: "country", operator: "eq", value: country.toUpperCase() }],
      }),
    }),
    onSuccess: () => {
      setName("");
      void client.invalidateQueries({ queryKey: ["rules"] });
      void client.invalidateQueries({ queryKey: ["conflicts"] });
      notify("Rule created");
    },
    onError: (error: Error) => notify(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/v1/rules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["rules"] });
      notify("Rule removed");
    },
    onError: (error: Error) => notify(error.message),
  });
  const simulate = useMutation({
    mutationFn: () => api<Simulation>("/api/v1/rules/simulate", {
      method: "POST",
      body: JSON.stringify({ ip, countryCode: country }),
    }),
  });
  const saved = rules.data ?? [];
  return (
    <Page title="Custom rules" subtitle="Lower priority numbers run first. Rules with the same priority use the more restrictive action and are reported as conflicts.">
      <BlockStack gap="400">
        {(conflicts.data ?? []).map((conflict) => <Banner key={conflict.reason} tone="warning" title={conflict.reason} />)}
        {rules.isError ? <Banner tone="critical" title={rules.error instanceof Error ? rules.error.message : "Rules could not be loaded"} /> : null}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">New country rule</Text>
            <div className="tb-form-grid">
              <div className="tb-span-2"><TextField label="Rule name" value={name} onChange={setName} autoComplete="off" placeholder="Block India" /></div>
              <TextField label="Country code" value={country} onChange={(value) => setCountry(value.toUpperCase().slice(0, 2))} autoComplete="off" placeholder="IN" />
              <Select label="Action" options={ACTIONS} value={action} onChange={setAction} />
            </div>
            <InlineStack>
              <Button variant="primary" disabled={!name.trim() || country.length !== 2} loading={create.isPending} onClick={() => create.mutate()}>Create rule</Button>
            </InlineStack>
          </BlockStack>
        </Card>
        <Card padding="0">
          <div className="tb-card-head">
            <Text as="h2" variant="headingMd">Saved rules</Text>
          </div>
          {saved.length === 0 ? <p className="tb-empty">No custom rules yet.</p> : (
            <div className="tb-table-wrap">
              <table className="tb-table tb-events">
                <thead>
                  <tr>
                    <th>Priority</th>
                    <th>Name</th>
                    <th>Action</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {saved.map((rule) => (
                    <tr key={rule._id}>
                      <td>{rule.priority}</td>
                      <td>{rule.name}</td>
                      <td><span className={actionClass(rule.action)}>{actionLabel(rule.action)}</span></td>
                      <td><span className={rule.enabled ? "tb-pill tb-pill-allow" : "tb-pill tb-pill-muted"}>{rule.enabled ? "Enabled" : "Disabled"}</span></td>
                      <td><Button variant="plain" tone="critical" disabled={remove.isPending} onClick={() => remove.mutate(rule._id)}>Remove</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Simulator</Text>
            <div className="tb-form-grid">
              <TextField label="IP address" value={ip} onChange={setIp} autoComplete="off" placeholder="203.0.113.10" />
              <TextField label="Country code" value={country} onChange={(value) => setCountry(value.toUpperCase().slice(0, 2))} autoComplete="off" />
            </div>
            <InlineStack>
              <Button disabled={!ip.trim()} loading={simulate.isPending} onClick={() => simulate.mutate()}>Run simulator</Button>
            </InlineStack>
            {simulate.isError ? <Banner tone="critical" title={simulate.error instanceof Error ? simulate.error.message : "Simulation failed"} /> : null}
            {simulate.data ? (
              <div className="tb-sim">
                <span className={actionClass(simulate.data.action)}>{actionLabel(simulate.data.action)}</span>
                <strong>{actionLabel(simulate.data.reason)}</strong>
                <p>{simulate.data.note}</p>
              </div>
            ) : null}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

function actionLabel(value: string): string {
  const known = ACTIONS.find((item) => item.value === value)?.label;
  if (known) return known;
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function actionClass(value: string): string {
  if (value === "block" || value === "rate_limit") return value === "rate_limit" ? "tb-pill tb-pill-warn" : "tb-pill tb-pill-block";
  if (value === "allow") return "tb-pill tb-pill-allow";
  return "tb-pill tb-pill-muted";
}
