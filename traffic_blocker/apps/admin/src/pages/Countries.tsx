import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banner, BlockStack, Button, Card, Checkbox, EmptyState, InlineStack, Page, Select, TextField } from "@shopify/polaris";
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
}

function StatusToggle({ name, blocked, busy, onToggle }: { name: string; blocked: boolean; busy: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={blocked ? "tb-switch tb-switch-on" : "tb-switch"}
      aria-pressed={blocked}
      aria-label={`${blocked ? "Allow" : "Block"} ${name}`}
      disabled={busy}
      onClick={onToggle}
    >
      <span className="tb-switch-track" aria-hidden="true"><span className="tb-switch-knob" /></span>
      {blocked ? "Blocked" : "Allowed"}
    </button>
  );
}

export function CountriesPage({ notify }: { notify: (message: string) => void }) {
  const client = useQueryClient();
  const [q, setQ] = useState("");
  const [continent, setContinent] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["countries", q, continent, page],
    queryFn: () => api<CountryRow[]>(withQuery("/api/v1/countries", { q, continent, page, pageSize: 50 })),
  });
  const mutation = useMutation({
    mutationFn: (body: unknown) => api("/api/v1/countries/bulk", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["countries"] });
      setSelected([]);
      notify("Country rules updated");
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
      client.setQueryData<CountryRow[]>(key, (current) => current?.map((item) => (
        item.code === row.code ? { ...item, blocked: !blocking, enabled: !blocking } : item
      )));
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
  const rows = query.data ?? [];
  const allChecked = rows.length > 0 && rows.every((row) => selected.includes(row.code));
  const options = useMemo(() => [{ label: "All continents", value: "" }, ...Object.entries(CONTINENTS).map(([value, label]) => ({ value, label }))], []);
  return (
    <Page title="Country blocking" subtitle="Rules use ISO codes. Live detection uses MaxMind on the server-observed IP.">
      <BlockStack gap="400">
        <InlineStack gap="200">
          <Button disabled={!selected.length} loading={mutation.isPending} onClick={() => mutation.mutate({ action: "block", countryCodes: selected })}>Block selected</Button>
          <Button disabled={!selected.length} onClick={() => mutation.mutate({ action: "allow", countryCodes: selected })}>Allow selected</Button>
          <Button disabled={!continent} onClick={() => mutation.mutate({ action: "block", continent: continent as ContinentCode })}>Block all in continent</Button>
          <Button onClick={() => setSelected([])}>Clear selection</Button>
        </InlineStack>
        <InlineStack gap="300">
          <div style={{ minWidth: 240 }}><TextField label="Search" value={q} onChange={(value) => { setQ(value); setPage(1); }} autoComplete="off" /></div>
          <div style={{ minWidth: 220 }}><Select label="Continent" options={options} value={continent} onChange={(value) => { setContinent(value); setPage(1); }} /></div>
        </InlineStack>
        {query.isError ? <Banner tone="critical" title={(query.error as Error).message} /> : null}
        <Card>
          {query.isLoading ? <p>Loading countries…</p> : rows.length === 0 ? <EmptyState heading="No countries match" image="">Try a different search.</EmptyState> : (
            <table className="tb-table">
              <thead>
                <tr>
                  <th><Checkbox label="Select page" labelHidden checked={allChecked} onChange={(checked) => setSelected(checked ? rows.map((row) => row.code) : [])} /></th>
                  <th>Flag</th><th>Country</th><th>Code</th><th>Status</th><th>Blocked requests</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.code}>
                    <td><Checkbox label={row.name} labelHidden checked={selected.includes(row.code)} onChange={(checked) => setSelected(checked ? [...selected, row.code] : selected.filter((code) => code !== row.code))} /></td>
                    <td><img className="tb-flag" alt="" src={`https://flagcdn.com/24x18/${row.code.toLowerCase()}.png`} /></td>
                    <td>{row.name}</td>
                    <td>{row.code}</td>
                    <td>
                      <StatusToggle
                        name={row.name}
                        blocked={row.blocked && row.enabled}
                        busy={toggle.isPending && toggle.variables?.code === row.code}
                        onToggle={() => toggle.mutate(row)}
                      />
                    </td>
                    <td>{row.blockedRequests}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <InlineStack gap="200">
          <Button disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <Button onClick={() => setPage(page + 1)}>Next</Button>
        </InlineStack>
      </BlockStack>
    </Page>
  );
}
