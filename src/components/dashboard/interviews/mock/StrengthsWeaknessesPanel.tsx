import { CheckCircle2, XCircle } from "lucide-react";
import { DashCard } from "@/components/dashboard/primitives";
import type { MockInterviewReportContent } from "@/features/mock-interview/types";

export function StrengthsWeaknessesPanel({ report }: { report: MockInterviewReportContent }) {
  if (report.strengths.length === 0 && report.weaknesses.length === 0) return null;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {report.strengths.length > 0 && (
        <DashCard>
          <p className="font-display text-sm font-semibold text-[oklch(0.2_0.02_265)]">Strengths</p>
          <ul className="mt-2 space-y-1.5">
            {report.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5 text-sm text-[oklch(0.35_0.02_265)]">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#16A34A]" /> {s}
              </li>
            ))}
          </ul>
        </DashCard>
      )}
      {report.weaknesses.length > 0 && (
        <DashCard>
          <p className="font-display text-sm font-semibold text-[oklch(0.2_0.02_265)]">
            Weaknesses
          </p>
          <ul className="mt-2 space-y-1.5">
            {report.weaknesses.map((w, i) => (
              <li key={i} className="flex items-start gap-1.5 text-sm text-[oklch(0.35_0.02_265)]">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#E11D48]" /> {w}
              </li>
            ))}
          </ul>
        </DashCard>
      )}
    </div>
  );
}
