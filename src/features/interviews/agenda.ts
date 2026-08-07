import { addWeeks, endOfWeek, isSameDay, parseISO, startOfDay } from "date-fns";

// ── Agenda view grouping (Module 9B) ──
//
// Pure date-bucketing logic, split out of InterviewAgendaView.tsx so it can
// be unit tested directly (see agenda.test.ts) without mounting the
// component, mirroring how ics.ts keeps interview-detail pure logic out of
// the components that render it.

const GROUP_ORDER = ["Past", "Today", "This week", "Next week", "Later"] as const;
export type GroupLabel = (typeof GROUP_ORDER)[number];
export { GROUP_ORDER };

export function groupFor(iso: string, now: Date): GroupLabel {
  const date = parseISO(iso);
  if (date < startOfDay(now)) return "Past";
  if (isSameDay(date, now)) return "Today";

  const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
  if (date <= thisWeekEnd) return "This week";

  const nextWeekEnd = endOfWeek(addWeeks(now, 1), { weekStartsOn: 1 });
  if (date <= nextWeekEnd) return "Next week";

  return "Later";
}
