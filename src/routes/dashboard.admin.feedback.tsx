import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, MessageSquareText } from "lucide-react";
import { Chip, DashCard, EmptyState } from "@/components/dashboard/primitives";
import { cn } from "@/lib/utils";
import { useAdminFeedback } from "@/features/admin/hooks";
import type { FeedbackCategory } from "@/types";

export const Route = createFileRoute("/dashboard/admin/feedback")({
  component: AdminFeedbackPage,
});

const CATEGORY_META: Record<FeedbackCategory, { label: string; tone: "rose" | "blue" | "default" }> = {
  bug: { label: "Bug", tone: "rose" },
  idea: { label: "Idea", tone: "blue" },
  other: { label: "Other", tone: "default" },
};

const FILTERS: { value: FeedbackCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "bug", label: "Bugs" },
  { value: "idea", label: "Ideas" },
  { value: "other", label: "Other" },
];

function AdminFeedbackPage() {
  const { data: feedback, isLoading, isError } = useAdminFeedback();
  const [filter, setFilter] = useState<FeedbackCategory | "all">("all");

  const filtered = useMemo(() => {
    if (!feedback) return [];
    return filter === "all" ? feedback : feedback.filter((f) => f.category === filter);
  }, [feedback, filter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-[oklch(0.5_0.02_265)]">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading feedback…
      </div>
    );
  }

  if (isError) {
    return (
      <DashCard>
        <p className="text-sm text-rose-600">Failed to load feedback. Try refreshing.</p>
      </DashCard>
    );
  }

  if (!feedback || feedback.length === 0) {
    return (
      <EmptyState
        icon={MessageSquareText}
        title="No feedback yet"
        body="Submissions from the in-app feedback dialog will show up here."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              filter === f.value
                ? "bg-[oklch(0.95_0.02_265)] text-[#2563EB]"
                : "border border-black/5 bg-white text-[oklch(0.45_0.02_265)] hover:bg-black/[0.03]",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <DashCard>
          <p className="text-sm text-[oklch(0.5_0.02_265)]">No feedback in this category.</p>
        </DashCard>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((item) => {
            const meta = CATEGORY_META[item.category];
            return (
              <DashCard key={item.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Chip tone={meta.tone}>{meta.label}</Chip>
                    <span className="text-sm font-medium text-[oklch(0.2_0.02_265)]">
                      {item.userFullName || item.userEmail || "Unknown user"}
                    </span>
                  </div>
                  <span className="text-xs tabular-nums text-[oklch(0.5_0.02_265)]">
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2.5 whitespace-pre-wrap text-sm text-[oklch(0.3_0.02_265)]">
                  {item.message}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-[oklch(0.5_0.02_265)]">
                  {item.userEmail && <span>{item.userEmail}</span>}
                  {item.pagePath && <span>Submitted from {item.pagePath}</span>}
                </div>
              </DashCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
