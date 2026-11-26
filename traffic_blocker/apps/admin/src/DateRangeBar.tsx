import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  ActionList,
  BlockStack,
  Button,
  Card,
  Collapsible,
  InlineGrid,
  InlineStack,
  Popover,
  Text,
  TextField,
} from "@shopify/polaris";
import { useFilters, type Preset } from "./filters";

const PRESETS: Array<{ value: Preset; label: string }> = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "custom", label: "Custom" },
];

function isoDate(daysAgo = 0): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function presetLabel(preset: Preset, from: string, to: string): string {
  if (preset !== "custom") {
    return PRESETS.find((item) => item.value === preset)?.label ?? "Date range";
  }
  if (from && to) return `${from} → ${to}`;
  return "Custom range";
}

export function DateRangeBar({ trailing }: { trailing?: ReactNode }) {
  const filters = useFilters();
  const [open, setOpen] = useState(false);
  const label = useMemo(
    () => presetLabel(filters.preset, filters.from, filters.to),
    [filters.preset, filters.from, filters.to],
  );

  const selectPreset = useCallback(
    (preset: Preset) => {
      if (preset === "custom") {
        const from = filters.from || isoDate(6);
        const to = filters.to || isoDate(0);
        filters.setCustom(from, to);
      } else {
        filters.setPreset(preset);
      }
      setOpen(false);
    },
    [filters],
  );

  const activator = (
    <Button
      disclosure={open ? "up" : "down"}
      onClick={() => setOpen((current) => !current)}
      accessibilityLabel="Choose date range"
    >
      {label}
    </Button>
  );

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center" wrap gap="300">
          <InlineStack gap="300" blockAlign="center" wrap>
            <Text as="span" variant="bodyMd" fontWeight="semibold">
              Date range
            </Text>
            <Popover active={open} activator={activator} preferredAlignment="left" onClose={() => setOpen(false)}>
              <ActionList
                actionRole="menuitem"
                items={PRESETS.map((item) => ({
                  content: item.label,
                  active: filters.preset === item.value,
                  onAction: () => selectPreset(item.value),
                }))}
              />
            </Popover>
          </InlineStack>
          {trailing ? <div className="tb-date-trailing">{trailing}</div> : null}
        </InlineStack>

        <Collapsible open={filters.preset === "custom"} id="date-range-custom" transition={{ duration: "200ms", timingFunction: "ease" }}>
          <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
            <TextField
              label="From"
              type="date"
              value={filters.from}
              onChange={(value) => filters.setCustom(value, filters.to || isoDate(0))}
              autoComplete="off"
            />
            <TextField
              label="To"
              type="date"
              value={filters.to}
              onChange={(value) => filters.setCustom(filters.from || isoDate(6), value)}
              autoComplete="off"
            />
          </InlineGrid>
        </Collapsible>
      </BlockStack>
    </Card>
  );
}
