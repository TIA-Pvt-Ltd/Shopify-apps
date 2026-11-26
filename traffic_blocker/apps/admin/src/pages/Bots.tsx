import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Card,
  Divider,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Select,
  SkeletonBodyText,
  Text,
  type BadgeProps,
} from "@shopify/polaris";
import { api } from "../api";
import { useSaveBar } from "../saveBar";

const ACTIONS = [
  { label: "Allow", value: "allow" },
  { label: "Monitor", value: "monitor" },
  { label: "Challenge", value: "challenge" },
  { label: "Block", value: "block" },
];

const BOTS = [
  ["unknownBotAction", "Unknown bots", "Automation that was not verified as a published crawler. A user-agent string alone is never trusted."],
  ["maliciousBotAction", "Known malicious automation", "Clients already classified as hostile automation."],
] as const;

const NETWORKS = [
  ["datacenterAction", "Datacenter networks", "Traffic from a hosting provider rather than a residential connection."],
  ["vpnAction", "VPN", "Commercial VPN exits. A VPN signal is separate from malicious automation."],
  ["proxyAction", "Proxy", "Requests that arrive through a proxy."],
  ["torAction", "Tor", "Traffic from the Tor network."],
] as const;

type PolicyKey = (typeof BOTS)[number][0] | (typeof NETWORKS)[number][0];
type Policy = Record<PolicyKey, string>;

interface DetectionStatus {
  vpnCidrs?: number;
  proxyCidrs?: number;
  torCidrs?: number;
  vpnAsns?: number;
  hostingAsns?: number;
  vpnReady?: boolean;
  proxyReady?: boolean;
  torReady?: boolean;
  datacenterReady?: boolean;
}

const DEFAULTS: Policy = {
  unknownBotAction: "monitor",
  maliciousBotAction: "block",
  datacenterAction: "monitor",
  vpnAction: "monitor",
  proxyAction: "monitor",
  torAction: "challenge",
};

function actionBadgeTone(action: string): BadgeProps["tone"] {
  if (action === "block") return "critical";
  if (action === "challenge") return "warning";
  if (action === "monitor") return "info";
  return "success";
}

function actionLabel(action: string): string {
  return ACTIONS.find((option) => option.value === action)?.label ?? action;
}

function policyFromData(data: Record<string, unknown> | undefined): Policy {
  return {
    unknownBotAction: String(data?.unknownBotAction ?? DEFAULTS.unknownBotAction),
    maliciousBotAction: String(data?.maliciousBotAction ?? DEFAULTS.maliciousBotAction),
    datacenterAction: String(data?.datacenterAction ?? DEFAULTS.datacenterAction),
    vpnAction: String(data?.vpnAction ?? DEFAULTS.vpnAction),
    proxyAction: String(data?.proxyAction ?? DEFAULTS.proxyAction),
    torAction: String(data?.torAction ?? DEFAULTS.torAction),
  };
}

export function BotsPage({ notify }: { notify: (message: string) => void }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["bots"], queryFn: () => api<Record<string, unknown>>("/api/v1/bots/settings") });
  const [policy, setPolicy] = useState<Policy>(DEFAULTS);
  const [savedPolicy, setSavedPolicy] = useState<Policy>(DEFAULTS);

  useEffect(() => {
    if (!query.data) return;
    const next = policyFromData(query.data);
    setPolicy(next);
    setSavedPolicy(next);
  }, [query.data]);

  const dirty = useMemo(() => (Object.keys(policy) as PolicyKey[]).some((key) => policy[key] !== savedPolicy[key]), [policy, savedPolicy]);

  const save = useMutation({
    mutationFn: () => api("/api/v1/bots/settings", {
      method: "PUT",
      body: JSON.stringify({
        ...policy,
        allowVerifiedSearchCrawlers: true,
        allowVerifiedAiCrawlers: false,
        customCrawlers: [],
        autoBlock: false,
        autoBlockMinutes: 60,
      }),
    }),
    onSuccess: () => {
      setSavedPolicy(policy);
      void client.invalidateQueries({ queryKey: ["bots"] });
      notify("Protection policy saved");
      save.reset();
    },
    onError: (error: Error) => notify(error.message),
  });

  const detection = (query.data?.detection ?? {}) as DetectionStatus;
  const deniedSignals = useMemo(() => {
    const labels: string[] = [];
    if (policy.vpnAction === "block") labels.push("VPN");
    if (policy.proxyAction === "block") labels.push("Proxy");
    if (policy.torAction === "block") labels.push("Tor");
    if (policy.datacenterAction === "block") labels.push("Datacenter");
    return labels;
  }, [policy]);

  const inactiveFeeds = useMemo(() => {
    const issues: string[] = [];
    if (policy.proxyAction !== "allow" && !detection.proxyReady) {
      issues.push("Proxy detection has no CIDR feed loaded. Run npm run feeds:update, then restart the API.");
    }
    if (policy.torAction !== "allow" && !detection.torReady) {
      issues.push("Tor detection has no CIDR feed loaded. Run npm run feeds:update, then restart the API.");
    }
    if (policy.vpnAction !== "allow" && !detection.vpnReady) {
      issues.push("VPN detection has no ranges or VPN ASNs configured, so VPN actions never match.");
    }
    if (policy.datacenterAction !== "allow" && !detection.datacenterReady) {
      issues.push("Datacenter detection has no hosting ASN directory loaded.");
    }
    return issues;
  }, [policy, detection]);

  const readiness = [
    { label: "VPN ranges", value: detection.vpnCidrs ?? 0, ready: Boolean(detection.vpnReady) },
    { label: "VPN ASNs", value: detection.vpnAsns ?? 0, ready: Boolean(detection.vpnReady) },
    { label: "Proxy ranges", value: detection.proxyCidrs ?? 0, ready: Boolean(detection.proxyReady) },
    { label: "Tor ranges", value: detection.torCidrs ?? 0, ready: Boolean(detection.torReady) },
    { label: "Hosting ASNs", value: detection.hostingAsns ?? 0, ready: Boolean(detection.datacenterReady) },
  ];

  const { saveBar } = useSaveBar({
    id: "bots-policy-save-bar",
    dirty: dirty && !query.isLoading && !query.isError,
    saving: save.isPending,
    message: "Unsaved bot protection changes",
    onSave: () => save.mutate(),
    onDiscard: () => setPolicy(savedPolicy),
  });

  return (
    <Page
      title="Bot protection"
      subtitle="Decide how unverified automation and network signals are handled. Verified crawlers still require DNS or a published CIDR."
    >
      {saveBar}
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {query.isError ? (
              <Banner tone="critical" title={query.error instanceof Error ? query.error.message : "Bot policy could not be loaded"} />
            ) : null}

            {query.isLoading ? (
              <Card>
                <SkeletonBodyText lines={10} />
              </Card>
            ) : (
              <>
                <Banner
                  tone={deniedSignals.length ? "warning" : "info"}
                  title={deniedSignals.length ? `${deniedSignals.join(", ")} set to Block` : "No network signals are set to Block"}
                >
                  <p>
                    {deniedSignals.length
                      ? "Only traffic that matches those signals is denied. A normal residential connection still opens the store."
                      : "Monitor records the visit and still opens the store. Block denies matching traffic only."}
                  </p>
                </Banner>

                {inactiveFeeds.map((message) => (
                  <Banner key={message} tone="critical" title="Detection feed missing">
                    <p>{message}</p>
                  </Banner>
                ))}

                <Card>
                  <BlockStack gap="400">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingMd">Detection readiness</Text>
                      <Text as="p" tone="subdued" variant="bodySm">
                        Feeds power VPN, proxy, Tor, and datacenter decisions. Empty feeds mean those actions never match.
                      </Text>
                    </BlockStack>
                    <InlineGrid columns={{ xs: 1, sm: 2, md: 3, lg: 5 }} gap="300">
                      {readiness.map((item) => (
                        <Box key={item.label} background="bg-surface-secondary" borderRadius="200" padding="300">
                          <BlockStack gap="200">
                            <InlineStack align="space-between" blockAlign="center" wrap={false} gap="200">
                              <Text as="span" variant="bodySm" tone="subdued">{item.label}</Text>
                              <Badge tone={item.ready ? "success" : "attention"}>{item.ready ? "Ready" : "Empty"}</Badge>
                            </InlineStack>
                            <Text as="p" variant="headingLg">{item.value.toLocaleString()}</Text>
                          </BlockStack>
                        </Box>
                      ))}
                    </InlineGrid>
                  </BlockStack>
                </Card>

                <PolicyCard
                  title="Automation"
                  description="How to treat clients that look automated but are not verified search or AI crawlers."
                  rows={BOTS}
                  policy={policy}
                  onChange={(key, value) => setPolicy({ ...policy, [key]: value })}
                />

                <PolicyCard
                  title="Network traffic"
                  description="Separate signals from hosting providers, VPN exits, proxies, and Tor. These are not the same as bot classification."
                  rows={NETWORKS}
                  policy={policy}
                  onChange={(key, value) => setPolicy({ ...policy, [key]: value })}
                />
              </>
            )}
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">What each action does</Text>
                <ActionGuide tone="success" label="Allow" detail="Matching traffic continues into the storefront." />
                <Divider />
                <ActionGuide tone="info" label="Monitor" detail="Record the visit for analytics, then allow the shopper." />
                <Divider />
                <ActionGuide tone="warning" label="Challenge" detail="Ask for an extra check before the store opens." />
                <Divider />
                <ActionGuide tone="critical" label="Block" detail="Deny matching traffic before pixels and analytics fire." />
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Trusted crawlers</Text>
                <Text as="p" tone="subdued">
                  A user-agent string is never enough. Published crawlers are trusted only after DNS or CIDR verification.
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function PolicyCard({
  title,
  description,
  rows,
  policy,
  onChange,
}: {
  title: string;
  description: string;
  rows: ReadonlyArray<readonly [PolicyKey, string, string]>;
  policy: Policy;
  onChange: (key: PolicyKey, value: string) => void;
}) {
  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="100">
          <Text as="h2" variant="headingMd">{title}</Text>
          <Text as="p" tone="subdued" variant="bodySm">{description}</Text>
        </BlockStack>
        <BlockStack gap="0">
          {rows.map(([key, label, detail], index) => (
            <Box key={key} paddingBlockStart={index === 0 ? "0" : "400"} paddingBlockEnd={index === rows.length - 1 ? "0" : "400"}>
              {index > 0 ? (
                <Box paddingBlockEnd="400">
                  <Divider />
                </Box>
              ) : null}
              <InlineGrid columns={{ xs: 1, md: ["twoThirds", "oneThird"] }} gap="400">
                <BlockStack gap="100">
                  <InlineStack gap="200" blockAlign="center" wrap>
                    <Text as="h3" variant="headingSm">{label}</Text>
                    <Badge tone={actionBadgeTone(policy[key])}>{actionLabel(policy[key])}</Badge>
                  </InlineStack>
                  <Text as="p" tone="subdued" variant="bodySm">{detail}</Text>
                </BlockStack>
                <Select
                  label="Action"
                  labelHidden
                  options={ACTIONS}
                  value={policy[key]}
                  onChange={(value) => onChange(key, value)}
                />
              </InlineGrid>
            </Box>
          ))}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

function ActionGuide({ tone, label, detail }: { tone: BadgeProps["tone"]; label: string; detail: string }) {
  return (
    <InlineStack gap="300" blockAlign="start" wrap={false}>
      <div style={{ minWidth: 88 }}>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <Text as="p" tone="subdued" variant="bodySm">{detail}</Text>
    </InlineStack>
  );
}
