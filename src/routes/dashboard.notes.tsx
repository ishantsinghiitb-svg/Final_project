import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search, StickyNote } from "lucide-react";
import { DashCard, PageHeader, Chip, EmptyState } from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import { notes, type Note } from "@/lib/dashboard-data";

export const Route = createFileRoute("/dashboard/notes")({
  head: () => ({ meta: [{ title: "Notes — NextOffer" }, { name: "robots", content: "noindex" }] }),
  component: NotesPage,
});

const tagTone: Record<Note["tag"], "blue" | "purple" | "amber" | "green"> = {
  Prep: "purple",
  Question: "blue",
  Followup: "amber",
  Idea: "green",
};

function NotesPage() {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(notes[0]?.id);
  const filtered = notes.filter((n) =>
    (n.title + n.body + (n.company ?? "")).toLowerCase().includes(q.toLowerCase()),
  );
  const selected = notes.find((n) => n.id === active) ?? filtered[0];

  return (
    <>
      <PageHeader
        eyebrow="Notes"
        title="Everything worth remembering."
        subtitle="Prep notes, follow-up drafts, questions to ask — kept next to the roles they belong to."
        actions={
          <DashButton>
            <Plus className="h-4 w-4" /> New note
          </DashButton>
        }
      />

      {notes.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title="No notes yet"
          body="Jot down anything — prep, questions, follow-up drafts — and NextOffer will keep it linked to the right role."
          cta={
            <DashButton size="sm">
              <Plus className="h-4 w-4" /> New note
            </DashButton>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <DashCard padded={false}>
            <div className="flex items-center gap-2 border-b border-black/5 px-3 py-2">
              <Search className="h-4 w-4 text-[oklch(0.5_0.02_265)]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search notes"
                className="flex-1 bg-transparent py-1 text-sm outline-none"
              />
            </div>
            <ul className="max-h-[520px] divide-y divide-black/5 overflow-y-auto">
              {filtered.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => setActive(n.id)}
                    className={`block w-full px-4 py-3 text-left ${
                      selected?.id === n.id ? "bg-[oklch(0.97_0.01_265)]" : "hover:bg-[oklch(0.98_0.005_265)]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="truncate text-sm font-medium">{n.title}</p>
                      <Chip tone={tagTone[n.tag]}>{n.tag}</Chip>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-[oklch(0.5_0.02_265)]">{n.body}</p>
                    <p className="mt-1 text-[11px] text-[oklch(0.55_0.02_265)]">
                      {n.company ? `${n.company} · ` : ""}
                      {n.updated}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </DashCard>

          <DashCard>
            {selected ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-display text-lg font-semibold">{selected.title}</p>
                    <p className="mt-0.5 text-xs text-[oklch(0.5_0.02_265)]">
                      {selected.company ? `${selected.company} · ` : ""}
                      {selected.updated}
                    </p>
                  </div>
                  <Chip tone={tagTone[selected.tag]}>{selected.tag}</Chip>
                </div>
                <textarea
                  defaultValue={selected.body}
                  key={selected.id}
                  className="mt-4 min-h-[280px] w-full resize-none rounded-xl border border-black/5 bg-[oklch(0.98_0.005_265)] p-4 text-sm leading-relaxed outline-none focus:border-[#2563EB]/30 focus:ring-2 focus:ring-[#2563EB]/10"
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button className="rounded-lg border border-black/5 bg-white px-3 py-1.5 text-xs font-medium hover:bg-black/[0.03]">Discard</button>
                  <DashButton size="sm">Save note</DashButton>
                </div>
              </>
            ) : (
              <p className="text-sm text-[oklch(0.5_0.02_265)]">No note selected.</p>
            )}
          </DashCard>
        </div>
      )}
    </>
  );
}