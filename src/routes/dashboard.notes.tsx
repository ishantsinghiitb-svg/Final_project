import { createFileRoute } from "@tanstack/react-router";
import { StickyNote } from "lucide-react";
import { PageHeader, EmptyState, StickyPageHeader } from "@/components/dashboard/primitives";
import { DashButtonLink } from "@/components/dashboard/DashButton";

export const Route = createFileRoute("/dashboard/notes")({
  head: () => ({ meta: [{ title: "Notes — OfferLyst" }, { name: "robots", content: "noindex" }] }),
  component: NotesPage,
});

// ── Notes ────────────────────────────────────────────────────────────────────
//
// This page previously rendered four fixture notes from
// `src/lib/dashboard-data.ts` (about companies the user had never applied to),
// with a "New note" button that did nothing. There is no notes table, service
// or hook behind it — standalone notes were never built.
//
// Notes that DO exist and persist are the per-application and per-interview
// ones (`useUpdateNotes`, and the interview detail page's Notes card). Rather
// than keep showing invented content, this points at where notes actually
// live. The route is kept so existing links and the command palette entry
// still resolve.

function NotesPage() {
  return (
    <>
      <StickyPageHeader>
        <PageHeader
          eyebrow="Notes"
          title="Notes live with the role they belong to."
          subtitle="Rather than a separate pile of notes, each application and each interview keeps its own."
        />
      </StickyPageHeader>

      <EmptyState
        icon={StickyNote}
        title="Nothing to show here"
        body="Open an application to keep notes on that role, or an interview to note what the round covers and the questions you want to ask."
        cta={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <DashButtonLink to="/dashboard/applications" size="sm">
              Go to Applications
            </DashButtonLink>
            <DashButtonLink to="/dashboard/interviews" size="sm" variant="outline">
              Go to Interviews
            </DashButtonLink>
          </div>
        }
      />
    </>
  );
}
