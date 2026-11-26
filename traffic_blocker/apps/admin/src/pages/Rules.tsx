import { useState } from "react";
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
  Select,
  SkeletonBodyText,
  Text,
  TextField,
  type BadgeProps,
} from "@shopify/polaris";
import { api } from "../api";

interface Rule {
  _id: string;
  name: string;
  priority: number;
  action: string;
  enabled: boolean;
  conditions?: Array<{ field: string; operator: string; value: string | number | boolean | string[] }>;
}

interface Conflict {
  reason: string;
  ruleIds?: string[];
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

function actionLabel(value: string): string {
  const known = ACTIONS.find((item) => item.value === value)?.label;
  if (known) return known;
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function actionTone(value: string): BadgeProps["tone"] {
  if (value === "block") return "critical";
  if (value === "rate_limit" || value === "challenge") return "warning";
  if (value === "monitor") return "info";
  if (value === "allow") return "success";
  return undefined;
}

function conditionSummary(rule: Rule): string {
  const conditions = rule.conditions ?? [];
  if (conditions.length === 0) return "No conditions";
  return conditions
    .map((condition) => {
      const value = Array.isArray(condition.value) ? condition.value.join(", ") : String(condition.value);
      return `${condition.field} ${condition.operator} ${value}`;
    })
    .join(` ${"and"} `);
}

function SectionSkeleton({ lines = 5 }: { lines?: number }) {
  return (
    <Box padding="400">
      <SkeletonBodyText lines={lines} />
    </Box>
  );
}

export function RulesPage({ notify }: { notify: (message: string) => void }) {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [ruleCountry, setRuleCountry] = useState("IN");
  const [priority, setPriority] = useState("100");
  const [action, setAction] = useState("block");
  const [simIp, setSimIp] = useState("203.0.113.10");
  const [simCountry, setSimCountry] = useState("IN");

  const rules = useQuery({
    queryKey: ["rules"],
    queryFn: () => api<Rule[]>("/api/v1/rules"),
    placeholderData: keepPreviousData,
  });
  const conflicts = useQuery({
    queryKey: ["conflicts"],
    queryFn: () => api<Conflict[]>("/api/v1/rules/conflicts"),
    placeholderData: keepPreviousData,
  });

  const create = useMutation({
    mutationFn: () =>
      api("/api/v1/rules", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          priority: Number(priority) || 100,
          enabled: true,
          combinator: "and",
          action,
          conditions: [{ field: "country", operator: "eq", value: ruleCountry.toUpperCase() }],
        }),
      }),
    onSuccess: () => {
      setName("");
      void client.invalidateQueries({ queryKey: ["rules"] });
      void client.invalidateQueries({ queryKey: ["conflicts"] });
      notify("Rule created");
      create.reset();
    },
    onError: (error: Error) => notify(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/v1/rules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["rules"] });
      void client.invalidateQueries({ queryKey: ["conflicts"] });
      notify("Rule removed");
      remove.reset();
    },
    onError: (error: Error) => notify(error.message),
  });

  const simulate = useMutation({
    mutationFn: () =>
      api<Simulation>("/api/v1/rules/simulate", {
        method: "POST",
        body: JSON.stringify({ ip: simIp.trim(), countryCode: simCountry }),
      }),
    onError: (error: Error) => notify(error.message),
  });

  const saved = rules.data ?? [];
  const conflictList = conflicts.data ?? [];
  const loading = rules.isLoading;
  const priorityValue = Number(priority);
  const canCreate =
    name.trim().length > 0 &&
    ruleCountry.length === 2 &&
    Number.isInteger(priorityValue) &&
    priorityValue >= 1 &&
    priorityValue <= 10000 &&
    !create.isPending;

  return (
    <Page
      title="Custom rules"
      subtitle="Lower priority numbers run first. Matching rules at the same priority use the more restrictive action and are reported as conflicts."
      fullWidth
    >
      <BlockStack gap="400">
        {rules.isError ? (
          <Banner tone="critical" title={rules.error instanceof Error ? rules.error.message : "Rules could not be loaded"} />
        ) : null}
        {conflictList.map((conflict) => (
          <Banner key={conflict.reason} tone="warning" title={conflict.reason} />
        ))}

        <div className="tb-equal-cards">
          <div className="tb-equal-card">
            <Card>
              <div className="tb-equal-card-inner">
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">
                      New country rule
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Match a visitor country and choose how the firewall should respond. Custom rules run before country, IP, and network blocks.
                    </Text>
                  </BlockStack>
                  <Divider />
                  <FormLayout>
                    <TextField
                      label="Rule name"
                      value={name}
                      onChange={setName}
                      autoComplete="off"
                      placeholder="Block India"
                      clearButton
                      onClearButtonClick={() => setName("")}
                    />
                    <FormLayout.Group>
                      <TextField
                        label="Country code"
                        value={ruleCountry}
                        onChange={(value) => setRuleCountry(value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))}
                        autoComplete="off"
                        placeholder="IN"
                        helpText="ISO 3166-1 alpha-2"
                        monospaced
                      />
                      <TextField
                        label="Priority"
                        type="number"
                        value={priority}
                        onChange={setPriority}
                        autoComplete="off"
                        helpText="1 runs before 100"
                        min={1}
                      />
                    </FormLayout.Group>
                    <Select label="Action" options={ACTIONS} value={action} onChange={setAction} />
                  </FormLayout>
                  <InlineStack gap="200">
                    <Button variant="primary" disabled={!canCreate} loading={create.isPending} onClick={() => create.mutate()}>
                      Create rule
                    </Button>
                  </InlineStack>
                </BlockStack>
              </div>
            </Card>
          </div>

          <div className="tb-equal-card">
            <Card>
              <div className="tb-equal-card-inner">
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">
                      Simulator
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Preview which action would apply for an IP and country without affecting live traffic.
                    </Text>
                  </BlockStack>
                  <Divider />
                  <FormLayout>
                    <FormLayout.Group>
                      <TextField
                        label="IP address"
                        value={simIp}
                        onChange={setSimIp}
                        autoComplete="off"
                        placeholder="203.0.113.10"
                        monospaced
                        clearButton
                        onClearButtonClick={() => setSimIp("")}
                      />
                      <TextField
                        label="Country code"
                        value={simCountry}
                        onChange={(value) => setSimCountry(value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))}
                        autoComplete="off"
                        placeholder="IN"
                        monospaced
                      />
                    </FormLayout.Group>
                  </FormLayout>
                  <InlineStack gap="200">
                    <Button
                      disabled={!simIp.trim() || simCountry.length !== 2}
                      loading={simulate.isPending}
                      onClick={() => simulate.mutate()}
                    >
                      Run simulator
                    </Button>
                  </InlineStack>
                  {simulate.isError ? (
                    <Banner tone="critical" title={simulate.error instanceof Error ? simulate.error.message : "Simulation failed"} />
                  ) : null}
                  {simulate.data ? (
                    <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                      <BlockStack gap="200">
                        <InlineStack gap="200" blockAlign="center" wrap>
                          <Badge tone={actionTone(simulate.data.action)}>{actionLabel(simulate.data.action)}</Badge>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {simulate.data.layer.replaceAll("_", " ")}
                          </Text>
                        </InlineStack>
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          {actionLabel(simulate.data.reason)}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {simulate.data.note}
                        </Text>
                      </BlockStack>
                    </Box>
                  ) : null}
                </BlockStack>
              </div>
            </Card>
          </div>
        </div>

        <Card padding="0">
          <Box padding="400" borderBlockEndWidth="025" borderColor="border-secondary">
            <InlineStack align="space-between" blockAlign="center" wrap gap="200">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Saved rules
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Active rules evaluated in priority order on every decide request.
                </Text>
              </BlockStack>
              {!loading ? <Badge>{`${saved.length}`}</Badge> : null}
            </InlineStack>
          </Box>
          {loading ? (
            <SectionSkeleton lines={6} />
          ) : saved.length === 0 ? (
            <Box padding="500">
              <EmptyState heading="No custom rules yet" image="">
                <p>Create a country rule above to take control before the built-in block lists run.</p>
              </EmptyState>
            </Box>
          ) : (
            <div className={rules.isFetching ? "tb-chart-fade is-fetching" : "tb-chart-fade"}>
              <IndexTable
                resourceName={{ singular: "rule", plural: "rules" }}
                itemCount={saved.length}
                selectable={false}
                headings={[
                  { title: "Priority" },
                  { title: "Name" },
                  { title: "Match" },
                  { title: "Action" },
                  { title: "Status" },
                  { title: "", alignment: "end" },
                ]}
                hasZebraStriping
              >
                {saved.map((rule, index) => (
                  <IndexTable.Row id={rule._id} key={rule._id} position={index}>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodyMd" numeric fontWeight="semibold">
                        {rule.priority}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodyMd" fontWeight="medium">
                        {rule.name}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodySm" tone="subdued">
                        <span className="tb-mono">{conditionSummary(rule)}</span>
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone={actionTone(rule.action)}>{actionLabel(rule.action)}</Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone={rule.enabled ? "success" : undefined}>{rule.enabled ? "Enabled" : "Disabled"}</Badge>
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
        </Card>
      </BlockStack>
    </Page>
  );
}
