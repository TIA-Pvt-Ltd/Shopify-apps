import { useCallback, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  EmptyState,
  IndexTable,
  InlineStack,
  Page,
  Select,
  SkeletonBodyText,
  Text,
  TextField,
  useIndexResourceState,
} from "@shopify/polaris";
import { CONTINENTS, type ContinentCode } from "@traffic-blocker/country-data";
import { api, withQuery } from "../api";

interface CountryRow {
  code: string;
  name: string;
  continent: string;
  continentName: string;
  blocked: boolean;
  enabled: boolean;
  ruleId: string | null;
  mode: string | null;
  blockedRequests: number;
  [key: string]: unknown;
}

export function CountriesPage({ notify }: { notify: (message: string) => void }) {
  const client = useQueryClient();
  const [q, setQ] = useState("");
  const [continent, setContinent] = useState("");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["countries", q, continent, page],
    queryFn: () => api<CountryRow[]>(withQuery("/api/v1/countries", { q, continent, page, pageSize: 50 })),
    placeholderData: keepPreviousData,
  });

  const rows = query.data ?? [];
  const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } = useIndexResourceState(rows, {
    resourceIDResolver: (row) => row.code,
  });

  const mutation = useMutation({
    mutationFn: (body: unknown) => api("/api/v1/countries/bulk", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (_data, variables) => {
      void client.invalidateQueries({ queryKey: ["countries"] });
      clearSelection();
      const action = (variables as { action?: string }).action;
      notify(action === "block" ? "Countries blocked" : "Countries allowed");
      mutation.reset();
    },
    onError: (error: Error) => notify(error.message),
  });

  const toggle = useMutation({
    mutationFn: (row: CountryRow) => {
      const blocking = row.blocked && row.enabled;
      return api("/api/v1/countries/bulk", {
        method: "POST",
        body: JSON.stringify({ action: blocking ? "allow" : "block", countryCodes: [row.code] }),
      });
    },
    onMutate: async (row) => {
      const key = ["countries", q, continent, page] as const;
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<CountryRow[]>(key);
      const blocking = row.blocked && row.enabled;
      client.setQueryData<CountryRow[]>(key, (current) =>
        current?.map((item) => (item.code === row.code ? { ...item, blocked: !blocking, enabled: !blocking } : item)),
      );
      return { previous, key };
    },
    onError: (error: Error, _row, context) => {
      if (context?.previous) client.setQueryData(context.key, context.previous);
      notify(error.message);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["countries"] });
    },
  });

  const continentOptions = useMemo(
    () => [{ label: "All continents", value: "" }, ...Object.entries(CONTINENTS).map(([value, label]) => ({ value, label }))],
    [],
  );

  const blockSelected = useCallback(() => {
    if (!selectedResources.length) return;
    mutation.mutate({ action: "block", countryCodes: selectedResources });
  }, [mutation, selectedResources]);

  const allowSelected = useCallback(() => {
    if (!selectedResources.length) return;
    mutation.mutate({ action: "allow", countryCodes: selectedResources });
  }, [mutation, selectedResources]);

  const blockContinent = useCallback(() => {
    if (!continent) return;
    mutation.mutate({ action: "block", continent: continent as ContinentCode });
  }, [continent, mutation]);

  const promotedBulkActions = [
    {
      content: "Block selected",
      onAction: blockSelected,
      disabled: mutation.isPending,
    },
    {
      content: "Allow selected",
      onAction: allowSelected,
      disabled: mutation.isPending,
    },
  ];

  const resourceName = { singular: "country", plural: "countries" };
  const continentLabel = continentOptions.find((option) => option.value === continent)?.label;

  return (
    <Page
      title="Country blocking"
      subtitle="Rules use ISO codes. Live detection uses MaxMind on the server-observed IP."
      fullWidth
      secondaryActions={
        continent
          ? [
              {
                content: "Block all in continent",
                onAction: blockContinent,
                disabled: mutation.isPending,
                loading: mutation.isPending,
              },
            ]
          : undefined
      }
    >
      <BlockStack gap="400">
        {query.isError ? <Banner tone="critical" title={(query.error as Error).message} /> : null}

        <Card padding="0">
          <Box padding="400" borderBlockEndWidth="025" borderColor="border-secondary">
            <InlineStack gap="300" wrap blockAlign="end">
              <Box minWidth="220px" maxWidth="320px" width="100%">
                <TextField
                  label="Search countries"
                  value={q}
                  onChange={(value) => {
                    setQ(value);
                    setPage(1);
                    clearSelection();
                  }}
                  autoComplete="off"
                  placeholder="Name or ISO code"
                  clearButton
                  onClearButtonClick={() => {
                    setQ("");
                    setPage(1);
                    clearSelection();
                  }}
                  loading={query.isFetching && !query.isLoading}
                />
              </Box>
              <Box minWidth="200px" maxWidth="260px" width="100%">
                <Select
                  label="Continent"
                  options={continentOptions}
                  value={continent}
                  onChange={(value) => {
                    setContinent(value);
                    setPage(1);
                    clearSelection();
                  }}
                />
              </Box>
            </InlineStack>
          </Box>

          {(q || continent) && !query.isLoading ? (
            <Box paddingInline="400" paddingBlock="200" background="bg-surface-secondary" borderBlockEndWidth="025" borderColor="border-secondary">
              <InlineStack gap="200" blockAlign="center" wrap>
                <Text as="span" variant="bodySm" tone="subdued">
                  Filters
                </Text>
                {q ? <Badge>{`Search: ${q}`}</Badge> : null}
                {continent ? <Badge tone="info">{continentLabel}</Badge> : null}
                <Button
                  variant="plain"
                  onClick={() => {
                    setQ("");
                    setContinent("");
                    setPage(1);
                    clearSelection();
                  }}
                >
                  Clear
                </Button>
              </InlineStack>
            </Box>
          ) : null}

          {query.isLoading ? (
            <Box padding="400">
              <BlockStack gap="400">
                <SkeletonBodyText lines={2} />
                <SkeletonBodyText lines={10} />
              </BlockStack>
            </Box>
          ) : rows.length === 0 ? (
            <Box padding="500">
              <EmptyState heading="No countries match" image="">
                <p>Try a different search or continent filter.</p>
              </EmptyState>
            </Box>
          ) : (
            <div className={query.isFetching ? "tb-chart-fade is-fetching" : undefined}>
              <IndexTable
                resourceName={resourceName}
                itemCount={rows.length}
                selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
                onSelectionChange={handleSelectionChange}
                headings={[
                  { title: "Country" },
                  { title: "Code" },
                  { title: "Continent" },
                  { title: "Status" },
                  { title: "Blocked requests", alignment: "end" },
                  { title: "Action", alignment: "end" },
                ]}
                promotedBulkActions={promotedBulkActions}
                hasZebraStriping
                pagination={{
                  hasPrevious: page > 1,
                  hasNext: rows.length >= 50,
                  onPrevious: () => {
                    setPage((current) => Math.max(1, current - 1));
                    clearSelection();
                  },
                  onNext: () => {
                    setPage((current) => current + 1);
                    clearSelection();
                  },
                  label: `Page ${page}`,
                }}
              >
                {rows.map((row, index) => {
                  const blocked = Boolean(row.blocked && row.enabled);
                  const toggling = toggle.isPending && toggle.variables?.code === row.code;
                  return (
                    <IndexTable.Row id={row.code} key={row.code} selected={selectedResources.includes(row.code)} position={index}>
                      <IndexTable.Cell>
                        <InlineStack gap="300" blockAlign="center" wrap={false}>
                          <img className="tb-flag" alt="" src={`https://flagcdn.com/24x18/${row.code.toLowerCase()}.png`} />
                          <Text as="span" variant="bodyMd" fontWeight="medium">
                            {row.name}
                          </Text>
                        </InlineStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text as="span" variant="bodyMd">
                          <span className="tb-mono">{row.code}</span>
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {row.continentName}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge tone={blocked ? "critical" : "success"}>{blocked ? "Blocked" : "Allowed"}</Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text as="span" variant="bodyMd" alignment="end" numeric>
                          {row.blockedRequests.toLocaleString()}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack align="end">
                          <Button
                            size="slim"
                            variant={blocked ? "secondary" : "primary"}
                            tone={blocked ? undefined : "critical"}
                            loading={toggling}
                            onClick={() => toggle.mutate(row)}
                          >
                            {blocked ? "Allow" : "Block"}
                          </Button>
                        </InlineStack>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}
              </IndexTable>
            </div>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
