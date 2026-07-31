import { Link } from "@tanstack/react-router";
import { ChevronRight, History } from "lucide-react";
import { DashCard, Chip, EmptyState } from "@/components/dashboard/primitives";
import { formatGeneratedAt } from "@/features/ai/format";
import { MOCK_SESSION_STATUS_LABELS } from "@/features/mock-interview/constants";
import { formatElapsed } from "@/features/mock-interview/timer";
import { performanceBandForScore } from "@/features/mock-interview/performanceBand";
import type { MockInterviewSession } from "@/features/mock-interview/types";
import { cn } from "@/lib/utils";

// ── PastSessionsList (Module 7C) ──
//
// Every mock interview session for this interview — each Start is its own
// paid, independently-reportable session (unlike Interview Preparation's
// single workspace), so this is a real history list, not a single card.

function scoreTone(score: number): "green" | "blue" | "amber" | "rose" {
  if (score >= 70) return "green";
  if (score >= 55) return "blue";
  if (score >= 35) return "amber";
  return "rose";
}

export function PastSessionsList({
  interviewId,
  sessions,
}: {
  interviewId: string;
  sessions: MockInterviewSession[];
}) {
  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No mock interviews yet"
        body="Your past sessions and reports will show up here once you start your first one."
      />
    );
  }

  return (
    <div className="space-y-2">
      {sessions.map((session) => {
        const isOpenable = session.status === "concluded" && Boolean(session.report);
        const isResumable = session.status === "active" || session.status === "paused";
        const content = (
          <DashCard
            padded={false}
            className={cn(
              "flex items-center gap-3 px-4 py-3.5 transition-colors",
              (isOpenable || isResumable) && "hover:border-black/10",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-medium text-[oklch(0.2_0.02_265)]">
                  {session.interviewer_role_label}
                </span>
                <Chip tone="default">{MOCK_SESSION_STATUS_LABELS[session.status]}</Chip>
                {session.report && (
                  <Chip tone={scoreTone(session.report.overallPerformance.score)}>
                    {performanceBandForScore(session.report.overallPerformance.score)} ·{" "}
                    {session.report.overallPerformance.score}
                  </Chip>
                )}
              </div>
              <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)]">
                {formatGeneratedAt(session.created_at)} · {session.turn_count} question
                {session.turn_count === 1 ? "" : "s"} · {formatElapsed(session.elapsed_ms)}
              </p>
            </div>
            {(isOpenable || isResumable) && (
              <ChevronRight className="h-4 w-4 shrink-0 text-[oklch(0.6_0.02_265)]" />
            )}
          </DashCard>
        );

        if (isOpenable) {
          return (
            <Link
              key={session.id}
              to="/dashboard/interviews/$interviewId/mock/$sessionId/report"
              params={{ interviewId, sessionId: session.id }}
            >
              {content}
            </Link>
          );
        }
        if (isResumable) {
          return (
            <Link
              key={session.id}
              to="/dashboard/interviews/$interviewId/mock/$sessionId"
              params={{ interviewId, sessionId: session.id }}
            >
              {content}
            </Link>
          );
        }
        return <div key={session.id}>{content}</div>;
      })}
    </div>
  );
}
