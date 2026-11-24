import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banner, BlockStack, Button, Card, Checkbox, Page, Select } from "@shopify/polaris";
import { api } from "../api";

export function SettingsPage({ notify }: { notify: (message: string) => void }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["shop"], queryFn: () => api<{ settings: { enforcementMode: string; failMode: string; allowlistOverride: boolean; nativeLimitation: string } }>("/api/v1/shops/me") });
  const [enforcementMode, setMode] = useState("shopify_native");
  const [failMode, setFail] = useState("open");
  const [allowlistOverride, setAllow] = useState(true);
  useEffect(() => {
    const settings = query.data?.settings;
    if (!settings) return;
    setMode(settings.enforcementMode);
    setFail(settings.failMode);
    setAllow(settings.allowlistOverride);
  }, [query.data]);
  const save = useMutation({
    mutationFn: () => api("/api/v1/shops/settings", {
      method: "PUT",
      body: JSON.stringify({ enforcementMode, failMode, allowlistOverride, timezone: "UTC", notifyOnCountryBlock: true, notifyOnAttack: true, notifyOnBot: true, notifyOnEdgeFailure: true, emailNotifications: false, dailyReport: false, weeklyReport: false }),
    }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["shop"] });
      notify("Settings saved");
    },
    onError: (error: Error) => notify(error.message),
  });
  return (
    <Page title="Settings">
      <BlockStack gap="400">
        <Banner tone="info" title="What native mode can and cannot do">
          <p>{query.data?.settings.nativeLimitation}</p>
        </Banner>
        <Card>
          <BlockStack gap="300">
            <Select label="Enforcement mode" options={[{ label: "Shopify-native", value: "shopify_native" }, { label: "Edge", value: "edge" }]} value={enforcementMode} onChange={setMode} />
            <Select label="If a new edge deployment fails" options={[{ label: "Keep the last verified configuration", value: "open" }, { label: "Keep the last verified configuration and deny on engine errors in native mode", value: "closed" }]} value={failMode} onChange={setFail} />
            <Checkbox label="Allowlist overrides country, IP, and ASN blocks" checked={allowlistOverride} onChange={setAllow} helpText="Custom rules still run before the allowlist. Turn this off and block rules win." />
            <Button loading={save.isPending} onClick={() => save.mutate()}>Save settings</Button>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
