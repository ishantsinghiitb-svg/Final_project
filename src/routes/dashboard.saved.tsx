import { createFileRoute, Link } from "@tanstack/react-router";
import { Bookmark, MapPin, Sparkles } from "lucide-react";
import { DashCard, PageHeader, Chip, CompanyMark, EmptyState } from "@/components/dashboard/primitives";
import { DashButtonLink } from "@/components/dashboard/DashButton";
import { jobs } from "@/lib/dashboard-data";

export const Route = createFileRoute("/dashboard/saved")({
  head: () => ({ meta: [{ title: "Saved jobs — NextOffer" }, { name: "robots", content: "noindex" }] }),
  component: SavedPage,
});

function SavedPage() {
  const saved = jobs.filter((j) => j.saved);
  const groups = [
    { title: "Applied", items: saved.filter((j) => j.stage === "applied") },
    { title: "Interested", items: saved.filter((j) => j.stage === "interested" || !j.stage) },
    { title: "In progress", items: saved.filter((j) => j.stage === "interview" || j.stage === "offer") },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Saved"
        title="Everything you bookmarked, in one place."
        subtitle="Jobs you saved from the extension, LinkedIn, Wellfound, or added manually — organized by where you are with each one."
      />

      {saved.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="Nothing saved yet"
          body="Install the extension and hit the bookmark icon on any job posting to send it here."
          cta={
            <DashButtonLink to="/features">
              Get the extension
            </DashButtonLink>
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="mb-2 flex items-center justify-between">
                <p className="font-display text-sm font-semibold">{g.title}</p>
                <span className="text-xs text-[oklch(0.5_0.02_265)]">{g.items.length} roles</span>
              </div>
              {g.items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-black/10 bg-white/50 px-4 py-3 text-xs text-[oklch(0.5_0.02_265)]">
                  Nothing here yet — {g.title.toLowerCase()} will show up once you take action.
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {g.items.map((j) => (
                    <DashCard key={j.id} className="hover:shadow-md">
                      <div className="flex items-start justify-between">
                        <CompanyMark company={j.company} tone={j.logoTone} size={38} />
                        <Chip tone={j.match >= 88 ? "green" : "blue"}>
                          <Sparkles className="h-2.5 w-2.5" />
                          {j.match}%
                        </Chip>
                      </div>
                      <p className="mt-3 font-display font-semibold">{j.role}</p>
                      <p className="text-xs text-[oklch(0.5_0.02_265)]">{j.company}</p>
                      <p className="mt-2 flex items-center gap-1 text-xs text-[oklch(0.5_0.02_265)]">
                        <MapPin className="h-3 w-3" /> {j.location} · {j.salary}
                      </p>
                      {j.nextStep && (
                        <div className="mt-3 rounded-lg bg-[oklch(0.97_0.01_265)] px-3 py-2 text-xs">
                          Next: <span className="font-medium">{j.nextStep}</span>
                        </div>
                      )}
                    </DashCard>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}