import { create } from "zustand";

export type Preset = "24h" | "7d" | "30d" | "90d" | "custom";

interface Filters {
  preset: Preset;
  from: string;
  to: string;
  setPreset: (preset: Preset) => void;
  setCustom: (from: string, to: string) => void;
}

export const useFilters = create<Filters>((set) => ({
  preset: "7d",
  from: "",
  to: "",
  setPreset: (preset) => set({ preset }),
  setCustom: (from, to) => set({ preset: "custom", from, to }),
}));
