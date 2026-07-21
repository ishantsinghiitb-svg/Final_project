import type { CollectionColor } from "@/types";

// ── Color presets ────────────────────────────────────────────────────────────
// Mirrors the Chip tone vocabulary already used across the dashboard
// (see components/dashboard/primitives.tsx#Chip) so a collection's color
// always renders consistently with every other tone-based UI in the app —
// no new color system.

export const COLLECTION_COLOR_META: Record<
  CollectionColor,
  { label: string; dot: string; chipTone: "default" | "blue" | "purple" | "green" | "amber" | "rose" }
> = {
  default: { label: "Gray", dot: "bg-slate-400", chipTone: "default" },
  blue: { label: "Blue", dot: "bg-blue-500", chipTone: "blue" },
  purple: { label: "Purple", dot: "bg-purple-500", chipTone: "purple" },
  green: { label: "Green", dot: "bg-green-500", chipTone: "green" },
  amber: { label: "Amber", dot: "bg-amber-500", chipTone: "amber" },
  rose: { label: "Rose", dot: "bg-rose-500", chipTone: "rose" },
};

export const COLLECTION_COLOR_OPTIONS: CollectionColor[] = [
  "default",
  "blue",
  "purple",
  "green",
  "amber",
  "rose",
];

export const DEFAULT_COLLECTION_COLOR: CollectionColor = "blue";
