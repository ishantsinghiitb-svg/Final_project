// ── Meeting link branding (Module 9 UX pass) ──
//
// Interview cards showed a generic "online" icon + raw link text for every
// video interview regardless of provider — this makes Google Meet/Zoom/
// Teams links visually recognizable at a glance, the way a native calendar
// app would, without needing to fetch or store anything new.

export type MeetingProvider = "google_meet" | "zoom" | "teams" | "other";

const PROVIDER_PATTERNS: { provider: MeetingProvider; pattern: RegExp }[] = [
  { provider: "google_meet", pattern: /meet\.google\.com/i },
  { provider: "zoom", pattern: /zoom\.us/i },
  { provider: "teams", pattern: /teams\.microsoft\.com|teams\.live\.com/i },
];

export function detectMeetingProvider(link: string | null | undefined): MeetingProvider {
  if (!link) return "other";
  const match = PROVIDER_PATTERNS.find(({ pattern }) => pattern.test(link));
  return match?.provider ?? "other";
}

export const MEETING_PROVIDER_LABEL: Record<MeetingProvider, string> = {
  google_meet: "Google Meet",
  zoom: "Zoom",
  teams: "Microsoft Teams",
  other: "Online",
};
