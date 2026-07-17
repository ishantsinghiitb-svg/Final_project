import type { PanelJob } from "../../types";

/**
 * Real, mountable section components for AI modules planned but not yet
 * built. Each takes the same `{ job }` prop shape as the shipped sections so
 * adding one to the panel later is "mount one more component in
 * FloatingPanel.tsx," not a redesign. None are imported/rendered anywhere
 * yet — intentionally unmounted per the approved plan.
 */
type FutureSectionProps = { job: PanelJob };

export function ResumeMatchSection(_props: FutureSectionProps) {
  return null;
}

export function AtsScoreSection(_props: FutureSectionProps) {
  return null;
}

export function SkillMatchSection(_props: FutureSectionProps) {
  return null;
}

export function MissingSkillsSection(_props: FutureSectionProps) {
  return null;
}

export function SalaryInsightsSection(_props: FutureSectionProps) {
  return null;
}

export function InterviewProbabilitySection(_props: FutureSectionProps) {
  return null;
}

export function NotesSection(_props: FutureSectionProps) {
  return null;
}

export function JobStatusSection(_props: FutureSectionProps) {
  return null;
}
