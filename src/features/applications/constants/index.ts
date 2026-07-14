import type { ApplicationStatus } from "@/types";
import type { ApplicationSort, ApplicationSortOption } from "../types";

// ── Status metadata ──────────────────────────────────────────────────────────

export type StatusMeta = {
  label: string;
  bg: string;
  text: string;
  dot: string;
  tone: "default" | "blue" | "purple" | "green" | "amber" | "rose";
  kanbanOrder?: number;
};

export const STATUS_META: Record<ApplicationStatus, StatusMeta> = {
  wishlist: {
    label: "Wishlist",
    bg: "bg-slate-100",
    text: "text-slate-600",
    dot: "bg-slate-400",
    tone: "default",
    kanbanOrder: 0,
  },
  applied: {
    label: "Applied",
    bg: "bg-blue-50",
    text: "text-blue-600",
    dot: "bg-blue-500",
    tone: "blue",
    kanbanOrder: 1,
  },
  online_assessment: {
    label: "Online Assessment",
    bg: "bg-purple-50",
    text: "text-purple-600",
    dot: "bg-purple-500",
    tone: "purple",
    kanbanOrder: 2,
  },
  interview: {
    label: "Interview",
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
    tone: "amber",
    kanbanOrder: 3,
  },
  offer: {
    label: "Offer",
    bg: "bg-green-50",
    text: "text-green-700",
    dot: "bg-green-500",
    tone: "green",
    kanbanOrder: 4,
  },
  rejected: {
    label: "Rejected",
    bg: "bg-rose-50",
    text: "text-rose-600",
    dot: "bg-rose-500",
    tone: "rose",
    kanbanOrder: 5,
  },
  withdrawn: {
    label: "Withdrawn",
    bg: "bg-slate-100",
    text: "text-slate-500",
    dot: "bg-slate-400",
    tone: "default",
  },
  accepted: {
    label: "Accepted",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
    tone: "green",
  },
};

export const KANBAN_COLUMNS: ApplicationStatus[] = (
  Object.entries(STATUS_META) as [ApplicationStatus, StatusMeta][]
)
  .filter(([, meta]) => meta.kanbanOrder !== undefined)
  .sort(([, a], [, b]) => (a.kanbanOrder ?? 0) - (b.kanbanOrder ?? 0))
  .map(([status]) => status);

export const ALL_STATUSES: ApplicationStatus[] = [
  "wishlist",
  "applied",
  "online_assessment",
  "interview",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
];

// ── Sort options ─────────────────────────────────────────────────────────────

export const SORT_OPTIONS: Record<ApplicationSortOption, ApplicationSort> = {
  recently_updated: { field: "updated_at", direction: "desc" },
  recently_applied: { field: "applied_at", direction: "desc" },
  company_az: { field: "company_name", direction: "asc" },
  company_za: { field: "company_name", direction: "desc" },
  status: { field: "status", direction: "asc" },
};

export const SORT_LABELS: Record<ApplicationSortOption, string> = {
  recently_updated: "Recently Updated",
  recently_applied: "Recently Applied",
  company_az: "Company A\u2192Z",
  company_za: "Company Z\u2192A",
  status: "Status",
};

export const DEFAULT_APPLICATION_SORT: ApplicationSort = {
  field: "updated_at",
  direction: "desc",
};

export const DEFAULT_APPLICATION_SORT_OPTION: ApplicationSortOption =
  "recently_updated";
