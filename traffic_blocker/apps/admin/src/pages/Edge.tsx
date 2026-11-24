import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banner, BlockStack, Button, Card, InlineStack, Page, Select, Text, TextField } from "@shopify/polaris";
import { api } from "../api";

interface EdgeState {
  provider: string | null;
  status: string;
  protectionActive: boolean;
  simulated: boolean;
  message?: string;
  hostname?: string;
}

export function EdgePage({ notify }: { notify: (message: string) => void }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["edge"], queryFn: () => api<EdgeState>("/api/v1/edge") });
  const [provider, setProvider] = useState("mock");
  const [hostname, setHostname] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const connect = useMutation({
    mutationFn: () => api("/api/v1/edge/connect", { method: "POST", body: JSON.stringify({ provider, hostname, zoneId, apiToken }) }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["edge"] });
      notify(provider === "mock" ? "Mock provider saved. It is not live protection." : "Cloudflare credentials stored.");
    },
    onError: (error: Error) => notify(error.message),
  });
  const act = useMutation({
    mutationFn: (path: string) => api(`/api/v1/edge/${path}`, { method: "POST", body: "{}" }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["edge"] }),
    onError: (error: Error) => notify(error.message),
  });
  const edge = query.data;
  return (
    <Page title="Integrations" subtitle="Edge protection is active only after a live probe shows a blocked request never reached Shopify.">
      <BlockStack gap="400">
        {query.isError ? <Banner tone="critical" title={query.error instanceof Error ? query.error.message : "Edge status could not be loaded"} /> : (
          <Banner tone={edge?.protectionActive ? "success" : "warning"} title={edge?.protectionActive ? "Edge protection is active" : "Edge protection is not active"}>
            <p>{edge?.message || "Shopify-native mode does not block requests before they reach Shopify."}</p>
            {edge?.simulated ? <p>The mock adapter is a simulation and is never reported as real protection.</p> : null}
          </Banner>
        )}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Provider</Text>
            <div className="tb-form-grid">
              <Select label="Provider" options={[{ label: "Cloudflare", value: "cloudflare" }, { label: "Mock test adapter", value: "mock" }]} value={provider} onChange={setProvider} />
              <TextField label="Custom hostname" value={hostname} onChange={setHostname} autoComplete="off" placeholder="store.example.com" />
              <TextField label="Zone ID" value={zoneId} onChange={setZoneId} autoComplete="off" />
              <TextField label="API token" type="password" value={apiToken} onChange={setApiToken} autoComplete="off" />
            </div>
            <InlineStack gap="200">
              <Button variant="primary" loading={connect.isPending} onClick={() => connect.mutate()}>Connect</Button>
              <Button loading={act.isPending && act.variables === "verify"} onClick={() => act.mutate("verify")}>Verify</Button>
              <Button loading={act.isPending && act.variables === "deploy"} onClick={() => act.mutate("deploy")}>Deploy</Button>
              <Button loading={act.isPending && act.variables === "rollback"} onClick={() => act.mutate("rollback")}>Rollback</Button>
              <Button variant="plain" tone="critical" disabled={act.isPending} onClick={() => act.mutate("disconnect")}>Disconnect</Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
