import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banner, BlockStack, Button, Card, InlineStack, Page, Select, SkeletonBodyText, Text } from "@shopify/polaris";
import { api } from "../api";

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

const DEFAULTS: Record<PolicyKey, string> = {
  unknownBotAction: "monitor",
  maliciousBotAction: "block",
  datacenterAction: "monitor",
  vpnAction: "monitor",
  proxyAction: "monitor",
  torAction: "challenge",
};

export function BotsPage({ notify }: { notify: (message: string) => void }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["bots"], queryFn: () => api<Record<string, unknown>>("/api/v1/bots/settings") });
  const [policy, setPolicy] = useState(DEFAULTS);
  useEffect(() => {
    if (!query.data) return;
    setPolicy({
      unknownBotAction: String(query.data.unknownBotAction ?? DEFAULTS.unknownBotAction),
      maliciousBotAction: String(query.data.maliciousBotAction ?? DEFAULTS.maliciousBotAction),
      datacenterAction: String(query.data.datacenterAction ?? DEFAULTS.datacenterAction),
      vpnAction: String(query.data.vpnAction ?? DEFAULTS.vpnAction),
      proxyAction: String(query.data.proxyAction ?? DEFAULTS.proxyAction),
      torAction: String(query.data.torAction ?? DEFAULTS.torAction),
    });
  }, [query.data]);
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
      void client.invalidateQueries({ queryKey: ["bots"] });
      notify("Protection policy saved");
    },
    onError: (error: Error) => notify(error.message),
  });
  const vpnBlocked = policy.vpnAction === "block" || policy.proxyAction === "block";
  return (
    <Page title="Bot protection" subtitle="Crawlers are trusted only after DNS or a published CIDR check. A user-agent string is never enough.">
      <BlockStack gap="400">
        {query.isError ? <Banner tone="critical" title={query.error instanceof Error ? query.error.message : "Bot policy could not be loaded"} /> : null}
        <Banner tone={vpnBlocked ? "warning" : "info"} title={vpnBlocked ? "VPN and proxy traffic is denied" : "VPN, proxy, and Tor have their own actions"}>
          {vpnBlocked
            ? "A detected VPN or proxy is blocked. A normal connection from an allowed country still opens the store. Tor follows the action selected below."
            : "Monitor records the visit and still opens the store. Block denies it."}
        </Banner>
        {query.isLoading ? <Card><SkeletonBodyText lines={8} /></Card> : (
          <>
            <PolicyCard title="Automation" rows={BOTS} policy={policy} onChange={(key, value) => setPolicy({ ...policy, [key]: value })} />
            <PolicyCard title="Network traffic" rows={NETWORKS} policy={policy} onChange={(key, value) => setPolicy({ ...policy, [key]: value })} />
            <InlineStack align="end">
              <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save policy</Button>
            </InlineStack>
          </>
        )}
      </BlockStack>
    </Page>
  );
}

function PolicyCard({ title, rows, policy, onChange }: {
  title: string;
  rows: ReadonlyArray<readonly [PolicyKey, string, string]>;
  policy: Record<PolicyKey, string>;
  onChange: (key: PolicyKey, value: string) => void;
}) {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">{title}</Text>
        <div>
          {rows.map(([key, label, detail]) => (
            <div className="tb-setting" key={key}>
              <div>
                <strong>{label}</strong>
                <p>{detail}</p>
              </div>
              <Select label={label} labelHidden options={ACTIONS} value={policy[key]} onChange={(value) => onChange(key, value)} />
            </div>
          ))}
        </div>
      </BlockStack>
    </Card>
  );
}
