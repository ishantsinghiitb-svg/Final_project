import { Compass, CheckCircle2, AlertTriangle, XCircle, PenLine, Sprout } from "lucide-react";
import { DashCard } from "@/components/dashboard/primitives";
import { cn } from "@/lib/utils";
import type { CareerSignal } from "@/features/optimizer/types";

// ── CareerSignalsSection (Module 6E · Transformation Coach) ──
//
// Answers the SECOND product question — "what does a top resume in this category
// usually demonstrate that mine doesn't?" — as EDUCATION, never rewrites. Its
// core principle is the honesty split: a signal the candidate genuinely has is a
// resume improvement ("surface it"); a signal with no real evidence is a career-
// development opportunity ("build it"), NEVER something to add to the résumé.
// The `developmental` flag (enforced server-side) drives that split so the UI
// can never tell a user to write experience they don't have.

const PRESENCE_META: Record<
  CareerSignal["presence"],
  { label: string; tone: string; icon: typeof CheckCircle2 }
> = {
  yes: { label: "Clearly shown", tone: "bg-[#22C55E]/12 text-[#16A34A]", icon: CheckCircle2 },
  partial: { label: "Partially shown", tone: "bg-amber-50 text-[#B45309]", icon: AlertTriangle },
  no: { label: "Not shown", tone: "bg-rose-50 text-[#E11D48]", icon: XCircle },
};

function SignalRow({ signal }: { signal: CareerSignal }) {
  const presence = PRESENCE_META[signal.presence];
  const PresenceIcon = presence.icon;
  const isBuild = signal.developmental;

  return (
    <li className="rounded-xl border border-black/5 bg-white p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-[oklch(0.25_0.02_265)]">{signal.signal}</span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
            presence.tone,
          )}
        >
          <PresenceIcon className="h-3 w-3" />
          {presence.label}
        </span>
        <span
          className={cn(
            "ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
            isBuild ? "bg-[#7C3AED]/10 text-[#7C3AED]" : "bg-[#2563EB]/10 text-[#2563EB]",
          )}
        >
          {isBuild ? <Sprout className="h-3 w-3" /> : <PenLine className="h-3 w-3" />}
          {isBuild ? "Build this experience" : "Surface on your resume"}
        </span>
      </div>

      {signal.importance && (
        <p className="mt-1.5 text-xs leading-relaxed text-[oklch(0.5_0.02_265)]">
          <span className="font-medium text-[oklch(0.4_0.02_265)]">Why it matters: </span>
          {signal.importance}
        </p>
      )}

      {signal.recommendation && (
        <p className="mt-1.5 text-sm leading-relaxed text-[oklch(0.3_0.02_265)]">
          <span className="font-semibold text-[oklch(0.28_0.02_265)]">
            {isBuild ? "Career development: " : "On your resume: "}
          </span>
          {signal.recommendation}
        </p>
      )}

      {/* Practical ways to GAIN the experience (developmental gaps only). */}
      {signal.waysToBuild.length > 0 && (
        <div className="mt-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[oklch(0.5_0.02_265)]">
            Ways to build this
          </p>
          <ul className="mt-1 space-y-1">
            {signal.waysToBuild.map((w, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-[oklch(0.4_0.02_265)]">
                <Sprout className="mt-0.5 h-3 w-3 shrink-0 text-[#7C3AED]" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {signal.example && (
        <div className="mt-2 rounded-lg bg-black/[0.02] px-2.5 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[oklch(0.55_0.02_265)]">
            {signal.exampleIsTemplate ? "Illustrative template" : "Example"}
          </p>
          <p className="mt-0.5 text-xs italic leading-relaxed text-[oklch(0.45_0.02_265)]">
            {signal.example}
          </p>
        </div>
      )}
    </li>
  );
}

export function CareerSignalsSection({
  signals,
  categoryLabel,
}: {
  signals: CareerSignal[];
  categoryLabel: string;
}) {
  if (signals.length === 0) return null;

  return (
    <DashCard>
      <div className="flex items-center gap-2">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#7C3AED]/10 text-[#7C3AED]">
          <Compass className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold text-[oklch(0.22_0.02_265)]">
            Signals recruiters expect
          </p>
          <p className="truncate text-[11px] text-[oklch(0.5_0.02_265)]">
            What strong {categoryLabel} resumes usually demonstrate
          </p>
        </div>
      </div>

      <p className="mt-3 rounded-lg bg-[#2563EB]/[0.03] px-3 py-2 text-xs leading-relaxed text-[oklch(0.45_0.02_265)]">
        These go beyond editing what's already on your resume. Where you genuinely have the
        experience, we show you how to surface it. Where you don't, we suggest building it — we
        never recommend adding experience you haven't gained.
      </p>

      <ul className="mt-3 space-y-2">
        {signals.map((s, i) => (
          <SignalRow key={`${s.signal}-${i}`} signal={s} />
        ))}
      </ul>
    </DashCard>
  );
}
