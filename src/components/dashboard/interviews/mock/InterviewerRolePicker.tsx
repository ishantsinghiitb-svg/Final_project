import { interviewerRolesFor, type RoleFamily } from "@/features/mock-interview/interviewerRoles";
import { cn } from "@/lib/utils";

// ── InterviewerRolePicker (Module 7C) ──
//
// Deterministic, zero-AI-call role list (see interviewerRoles.ts) — the
// available roles adapt to the job family and round, with the first one
// pre-selected as "Suggested for this round" while staying fully overridable,
// per the product spec's "HR Round → HR Recruiter, but changeable" example.

export function InterviewerRolePicker({
  family,
  round,
  value,
  onChange,
}: {
  family: RoleFamily;
  round: string;
  value: string;
  onChange: (roleId: string) => void;
}) {
  const roles = interviewerRolesFor(family, round);
  const suggestedId = roles[0]?.id;

  return (
    <div className="space-y-2">
      {roles.map((role) => {
        const selected = value === role.id;
        return (
          <label
            key={role.id}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors",
              selected
                ? "border-[#2563EB]/40 bg-[#2563EB]/[0.04]"
                : "border-black/5 bg-white hover:border-black/10",
            )}
          >
            <input
              type="radio"
              name="interviewer-role"
              className="mt-0.5 h-4 w-4 shrink-0 border-black/20 text-[#2563EB] focus:ring-[#2563EB]/30"
              checked={selected}
              onChange={() => onChange(role.id)}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-medium text-[oklch(0.2_0.02_265)]">{role.label}</span>
                {role.id === suggestedId && (
                  <span className="rounded-full bg-[#22C55E]/12 px-1.5 py-0.5 text-[10px] font-medium text-[#16A34A]">
                    Suggested for this round
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-[oklch(0.5_0.02_265)]">{role.blurb}</p>
            </div>
          </label>
        );
      })}
    </div>
  );
}
