import type { QueryClient } from "@tanstack/react-query";

// ── Shared cross-domain invalidation keys (Module 9) ──
//
// Every domain a Gmail/Calendar sync or suggestion accept can mutate — broad,
// cross-cutting invalidation on purpose, since a single accept/sync can touch
// applications, interviews, reminders and attachments (plus the application
// timeline, which nests under "applications" and invalidates along with it).
//
// Lives in its own file, imported by BOTH features/gmail/hooks and
// features/google/hooks, so neither has to import the other just for this
// constant — features/gmail/hooks must never import from features/google/hooks
// (see google/hooks' own header comment on the established one-directional
// dependency), and this avoids recreating that circularity risk while still
// removing the previous duplicate definition.
export const MUTATED_DOMAIN_KEYS = [
  ["applications"],
  ["interviews"],
  ["application-reminders"],
  ["application-attachments"],
];

export function invalidateMutatedDomains(queryClient: QueryClient): void {
  for (const key of MUTATED_DOMAIN_KEYS) void queryClient.invalidateQueries({ queryKey: key });
}
