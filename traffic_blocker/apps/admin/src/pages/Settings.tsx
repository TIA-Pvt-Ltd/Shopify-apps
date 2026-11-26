import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banner, BlockStack, Card, Checkbox, Page, Select } from "@shopify/polaris";
import { api } from "../api";
import { useSaveBar } from "../saveBar";

export function SettingsPage({ notify }: { notify: (message: string) => void }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["shop"], queryFn: () => api<{ settings: { failMode: string; allowlistOverride: boolean; nativeLimitation: string } }>("/api/v1/shops/me") });
  const [failMode, setFail] = useState("open");
  const [allowlistOverride, setAllow] = useState(true);
  const [savedFailMode, setSavedFail] = useState("open");
  const [savedAllowlistOverride, setSavedAllow] = useState(true);

  useEffect(() => {
    const settings = query.data?.settings;
    if (!settings) return;
    setFail(settings.failMode);
    setAllow(settings.allowlistOverride);
    setSavedFail(settings.failMode);
    setSavedAllow(settings.allowlistOverride);
  }, [query.data]);

  const dirty = failMode !== savedFailMode || allowlistOverride !== savedAllowlistOverride;

  const save = useMutation({
    mutationFn: () => api("/api/v1/shops/settings", {
      method: "PUT",
      body: JSON.stringify({
        enforcementMode: "shopify_native",
        failMode,
        allowlistOverride,
        timezone: "UTC",
        notifyOnCountryBlock: true,
        notifyOnAttack: true,
        notifyOnBot: true,
        notifyOnEdgeFailure: false,
        emailNotifications: false,
        dailyReport: false,
        weeklyReport: false,
      }),
    }),
    onSuccess: () => {
      setSavedFail(failMode);
      setSavedAllow(allowlistOverride);
      void client.invalidateQueries({ queryKey: ["shop"] });
      notify("Settings saved");
      save.reset();
    },
    onError: (error: Error) => notify(error.message),
  });

  const { saveBar } = useSaveBar({
    id: "settings-save-bar",
    dirty: dirty && !query.isLoading && !query.isError,
    saving: save.isPending,
    message: "Unsaved settings",
    onSave: () => save.mutate(),
    onDiscard: () => {
      setFail(savedFailMode);
      setAllow(savedAllowlistOverride);
    },
  });

  const limitation = useMemo(() => query.data?.settings.nativeLimitation, [query.data]);

  return (
    <Page title="Settings" subtitle="Fail mode and allowlist behavior for storefront decisions.">
      {saveBar}
      <BlockStack gap="400">
        <Banner tone="info" title="How protection works">
          <p>{limitation}</p>
        </Banner>
        <Card>
          <BlockStack gap="300">
            <Select
              label="If the decision engine errors"
              options={[
                { label: "Allow the visitor (fail open)", value: "open" },
                { label: "Deny the visitor (fail closed)", value: "closed" },
              ]}
              value={failMode}
              onChange={setFail}
            />
            <Checkbox
              label="Allowlist overrides country, IP, and ASN blocks"
              checked={allowlistOverride}
              onChange={setAllow}
              helpText="Custom rules still run before the allowlist. Turn this off and block rules win."
            />
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
