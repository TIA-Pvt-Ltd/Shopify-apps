import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Banner, BlockStack, Button, Card, Page, Select, Text } from "@shopify/polaris";
import { api } from "../api";
import type { PlanId } from "@traffic-blocker/shared-types";

interface BillingState {
  currentPlan: PlanId;
  status: string;
  plans: Array<{ id: PlanId; name: string; description: string; monthlyPrice: number; annualPrice: number; limits: { edge: boolean; countryBlocks: number | null } }>;
}

export function BillingPage({ notify }: { notify: (message: string) => void }) {
  const query = useQuery({ queryKey: ["billing"], queryFn: () => api<BillingState>("/api/v1/billing") });
  const [interval, setInterval] = useState("EVERY_30_DAYS");
  const subscribe = useMutation({
    mutationFn: (plan: PlanId) => api<{ confirmationUrl: string | null }>("/api/v1/billing/subscribe", {
      method: "POST",
      body: JSON.stringify({ plan, interval }),
    }),
    onSuccess: (result) => {
      if (result.confirmationUrl) window.top?.location.assign(result.confirmationUrl);
      else notify("Shopify did not return a confirmation URL");
    },
    onError: (error: Error) => notify(error.message),
  });
  const annual = interval === "ANNUAL";
  const current = query.data?.currentPlan;
  return (
    <Page title="Billing" subtitle={query.data ? `Current plan: ${current} (${query.data.status})` : query.isError ? "Billing could not be loaded." : "Loading the current plan."}>
      <BlockStack gap="400">
        {query.isError ? <Banner tone="critical" title={query.error instanceof Error ? query.error.message : "Billing could not be loaded"} /> : null}
        <div className="tb-filter">
          <Select label="Interval" options={[{ label: "Monthly", value: "EVERY_30_DAYS" }, { label: "Annual", value: "ANNUAL" }]} value={interval} onChange={setInterval} />
        </div>
        <div className="tb-plans">
          {(query.data?.plans ?? []).map((plan) => {
            const active = plan.id === current;
            const price = annual ? plan.annualPrice : plan.monthlyPrice;
            return (
              <Card key={plan.id}>
                <div className="tb-plan">
                  <InlinePlanName name={plan.name} active={active} />
                  <p className="tb-price">${price} <span>{annual ? "per year" : "per month"}</span></p>
                  <p>{plan.description}</p>
                  <Text as="p" tone="subdued">{plan.limits.edge ? "Includes edge enforcement." : "Shopify-native enforcement."} Country rules: {plan.limits.countryBlocks ?? "unlimited"}.</Text>
                  <div>
                    <Button variant={active ? "secondary" : "primary"} disabled={active} loading={subscribe.isPending && subscribe.variables === plan.id} onClick={() => subscribe.mutate(plan.id)}>
                      {active ? "Current plan" : `Choose ${plan.name}`}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </BlockStack>
    </Page>
  );
}

function InlinePlanName({ name, active }: { name: string; active: boolean }) {
  return (
    <span className="tb-plan-name">
      <strong>{name}</strong>
      {active ? <span className="tb-pill tb-pill-allow">Current</span> : null}
    </span>
  );
}
