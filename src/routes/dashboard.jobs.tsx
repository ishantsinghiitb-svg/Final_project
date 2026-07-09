import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ListFilter as Filter, MapPin, Plus, Search, SlidersHorizontal, Bookmark, BookmarkCheck, ArrowUpRight, Sparkles } from "lucide-react";
import { DashCard, PageHeader, Chip, CompanyMark, EmptyState } from "@/components/dashboard/primitives";
import { DashButton, DashButtonLink } from "@/components/dashboard/DashButton";
import { jobs as seed } from "@/lib/dashboard-data";

export const Route = createFileRoute("/dashboard/jobs")({
  head: () => ({ meta: [{ title: "Jobs — NextOffer" }, { name: "robots", content: "noindex" }] }),
  component: JobsPage,
});

const sources = ["All sources", "LinkedIn", "Wellfound", "Greenhouse", "Lever", "Ashby", "Careers"] as const;

function JobsPage() {
  const [q, setQ] = useState("");
  const [source, setSource] = useState<(typeof sources)[number]>("All sources");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [minMatch, setMinMatch] = useState(0);
  const [saved, setSaved] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(seed.map((j) => [j.id, !!j.saved])),
  );

  const filtered = useMemo(() => {
    return seed.filter((j) => {
      if (q && !(j.company + " " + j.role + " " + j.location).toLowerCase().includes(q.toLowerCase())) return false;
      if (source !== "All sources" && j.source !== source) return false;
      if (remoteOnly && !j.remote) return false;
      if (j.match < minMatch) return false;
      return true;
    });
  }, [q, source, remoteOnly, minMatch]);

  return (
    <>
      <PageHeader
        eyebrow="Jobs"
        title="Discover roles worth your time."
        subtitle="Every job you save from the extension or add manually shows up here — ranked by how well it matches you."
        actions={
          <DashButton>
            <Plus className="h-4 w-4" /> Add job
          </DashButton>
        }
      />

      <DashCard padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-black/5 p-3">
          <div className="flex flex-1 min-w-[220px] items-center gap-2 rounded-lg border border-black/5 bg-white px-3 py-2 text-sm">
            <Search className="h-4 w-4 text-[oklch(0.5_0.02_265)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search company, role, location…"
              className="flex-1 bg-transparent outline-none placeholder:text-[oklch(0.55_0.02_265)]"
            />
          </div>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as (typeof sources)[number])}
            className="rounded-lg border border-black/5 bg-white px-3 py-2 text-sm"
          >
            {sources.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 rounded-lg border border-black/5 bg-white px-3 py-2 text-sm">
            <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} />
            Remote only
          </label>
          <label className="inline-flex items-center gap-2 rounded-lg border border-black/5 bg-white px-3 py-2 text-sm">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Match ≥
            <input
              type="range"
              min={0}
              max={95}
              step={5}
              value={minMatch}
              onChange={(e) => setMinMatch(Number(e.target.value))}
              className="w-24 accent-[#2563EB]"
            />
            <span className="w-8 text-xs font-medium">{minMatch}%</span>
          </label>
        </div>

        {filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={Filter}
              title="No jobs match those filters"
              body="Try widening your match threshold or clearing the search."
              cta={
                <DashButton
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQ("");
                    setSource("All sources");
                    setRemoteOnly(false);
                    setMinMatch(0);
                  }}
                >
                  Reset filters
                </DashButton>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-black/5">
            {filtered.map((j) => (
              <li key={j.id} className="group flex items-center gap-4 px-4 py-3 hover:bg-[oklch(0.98_0.005_265)]">
                <CompanyMark company={j.company} tone={j.logoTone} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-display text-sm font-semibold">{j.role}</p>
                    <Chip tone={j.match >= 88 ? "green" : j.match >= 80 ? "blue" : "default"}>
                      <Sparkles className="h-2.5 w-2.5" /> {j.match}%
                    </Chip>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-[oklch(0.5_0.02_265)]">
                    {j.company} · <MapPin className="inline h-3 w-3" /> {j.location} · {j.salary}
                  </p>
                </div>
                <span className="hidden text-[11px] text-[oklch(0.55_0.02_265)] md:inline">{j.source}</span>
                <span className="hidden w-16 text-right text-[11px] text-[oklch(0.55_0.02_265)] md:inline">{j.posted}</span>
                <button
                  onClick={() => setSaved((s) => ({ ...s, [j.id]: !s[j.id] }))}
                  aria-label={saved[j.id] ? "Unsave" : "Save"}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-black/5 bg-white text-[oklch(0.4_0.02_265)] hover:bg-black/[0.03]"
                >
                  {saved[j.id] ? <BookmarkCheck className="h-4 w-4 text-[#2563EB]" /> : <Bookmark className="h-4 w-4" />}
                </button>
                <DashButtonLink to="/dashboard/applications" size="sm" className="hidden md:inline-flex">
                  Apply <ArrowUpRight className="h-3 w-3" />
                </DashButtonLink>
              </li>
            ))}
          </ul>
        )}
      </DashCard>
    </>
  );
}