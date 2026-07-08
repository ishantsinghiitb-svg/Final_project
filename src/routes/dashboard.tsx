import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  Bell,
  Bookmark,
  Briefcase,
  CalendarClock,
  ChevronRight,
  FileText,
  Kanban,
  LineChart,
  Plus,
  Search,
  Settings,
  Sparkles,
  StickyNote,
  Target,
} from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard preview — NextOffer" },
      { name: "description", content: "A live preview of the NextOffer application dashboard." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="min-h-screen bg-[oklch(0.98_0.005_250)] text-[oklch(0.2_0.02_265)]">
      <div className="grid min-h-screen grid-cols-[240px_1fr]">
        <aside className="border-r border-black/5 bg-white/60 p-4 backdrop-blur">
          <Link to="/" className="mb-6 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED]">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </span>
            <span className="font-display text-[15px] font-semibold">NextOffer</span>
          </Link>
          <nav className="space-y-0.5">
            {[
              { i: Activity, l: "Overview", active: true },
              { i: Briefcase, l: "Jobs" },
              { i: Bookmark, l: "Saved" },
              { i: FileText, l: "Resumes" },
              { i: Target, l: "Applications" },
              { i: CalendarClock, l: "Interviews" },
              { i: StickyNote, l: "Notes" },
              { i: LineChart, l: "Analytics" },
            ].map((n) => (
              <button
                key={n.l}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                  n.active ? "bg-[oklch(0.95_0.02_265)] text-[#2563EB]" : "text-[oklch(0.45_0.02_265)] hover:bg-black/[0.03]"
                }`}
              >
                <n.i className="h-4 w-4" />
                {n.l}
              </button>
            ))}
          </nav>
          <div className="mt-8 rounded-xl border border-black/5 bg-gradient-to-br from-[#2563EB]/5 to-[#7C3AED]/10 p-4">
            <p className="text-xs font-semibold">Upgrade to Pro</p>
            <p className="mt-1 text-[11px] text-[oklch(0.45_0.02_265)]">Unlimited AI, cover letters, analytics.</p>
            <Link to="/pricing" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#2563EB]">
              See plans <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="mt-6">
            <button className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-[oklch(0.45_0.02_265)] hover:bg-black/[0.03]">
              <Settings className="h-4 w-4" /> Settings
            </button>
          </div>
        </aside>

        <div>
          <header className="flex items-center justify-between border-b border-black/5 bg-white/70 px-6 py-3 backdrop-blur">
            <div className="flex items-center gap-2 rounded-lg border border-black/5 bg-white px-3 py-2 text-sm text-[oklch(0.45_0.02_265)] w-[380px]">
              <Search className="h-4 w-4" />
              <input placeholder="Search jobs, companies, applications…" className="flex-1 bg-transparent outline-none" />
              <kbd className="rounded border border-black/10 bg-black/[0.03] px-1 text-[10px]">⌘K</kbd>
            </div>
            <div className="flex items-center gap-3">
              <button className="grid h-9 w-9 place-items-center rounded-lg border border-black/5 bg-white hover:bg-black/[0.03]">
                <Bell className="h-4 w-4" />
              </button>
              <button className="flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-3 py-2 text-sm font-medium text-white">
                <Plus className="h-4 w-4" /> Add job
              </button>
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#2563EB] to-[#7C3AED]" />
            </div>
          </header>

          <main className="space-y-6 p-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-[oklch(0.5_0.02_265)]">Overview</p>
              <h1 className="mt-1 font-display text-2xl font-semibold">Good afternoon, Ava.</h1>
              <p className="mt-1 text-sm text-[oklch(0.45_0.02_265)]">You have 5 interviews this week and 2 pending follow-ups.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              {[
                { l: "Active applications", v: "24", d: "+3 this week" },
                { l: "Interviews", v: "5", d: "2 upcoming" },
                { l: "Match avg.", v: "87%", d: "Across 12 roles" },
                { l: "Offers", v: "2", d: "$210k avg." },
              ].map((s) => (
                <div key={s.l} className="rounded-2xl border border-black/5 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                  <p className="text-xs text-[oklch(0.5_0.02_265)]">{s.l}</p>
                  <p className="mt-1 font-display text-2xl font-semibold">{s.v}</p>
                  <p className="mt-0.5 text-[11px] text-[#22C55E]">{s.d}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
              <div className="rounded-2xl border border-black/5 bg-white p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-[oklch(0.5_0.02_265)]">Applications over time</p>
                    <p className="mt-1 font-display text-lg font-semibold">142 <span className="text-sm text-[oklch(0.45_0.02_265)]">this quarter</span></p>
                  </div>
                  <span className="rounded-full bg-[#22C55E]/15 px-2 py-0.5 text-[11px] text-[#16A34A]">+22%</span>
                </div>
                <svg viewBox="0 0 500 160" className="mt-4 w-full">
                  <defs>
                    <linearGradient id="area2" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#2563EB" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[30, 70, 110].map((y) => (
                    <line key={y} x1="0" x2="500" y1={y} y2={y} stroke="oklch(0 0 0 / 0.05)" />
                  ))}
                  <path d="M0,120 C50,110 100,80 150,90 C200,100 240,50 290,60 C340,70 380,30 430,40 C460,45 480,30 500,25 L500,160 L0,160 Z" fill="url(#area2)" />
                  <path d="M0,120 C50,110 100,80 150,90 C200,100 240,50 290,60 C340,70 380,30 430,40 C460,45 480,30 500,25" fill="none" stroke="#2563EB" strokeWidth="2" />
                </svg>
              </div>

              <div className="rounded-2xl border border-black/5 bg-white p-5">
                <p className="text-xs text-[oklch(0.5_0.02_265)]">Recent activity</p>
                <ul className="mt-3 space-y-3 text-sm">
                  {[
                    { t: "Interview scheduled — Vercel", d: "in 45 min", c: "text-[#7C3AED]" },
                    { t: "Resume matched Linear at 92%", d: "1 hr ago", c: "text-[#2563EB]" },
                    { t: "Offer received — Stripe", d: "yesterday", c: "text-[#16A34A]" },
                    { t: "Saved 3 roles from Wellfound", d: "yesterday", c: "text-[oklch(0.5_0.02_265)]" },
                  ].map((r) => (
                    <li key={r.t} className="flex items-center justify-between">
                      <span>{r.t}</span>
                      <span className={`text-xs ${r.c}`}>{r.d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="rounded-2xl border border-black/5 bg-white p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Kanban className="h-4 w-4 text-[#2563EB]" />
                  <p className="font-semibold">Pipeline</p>
                </div>
                <button className="text-xs text-[#2563EB]">Open board →</button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                {[
                  { t: "Interested", tone: "text-[oklch(0.45_0.02_265)]", items: [{ c: "Linear", r: "Sr. Product Designer" }, { c: "Notion", r: "Design Engineer" }] },
                  { t: "Applied", tone: "text-[#2563EB]", items: [{ c: "Vercel", r: "Frontend Engineer" }, { c: "Raycast", r: "Design Engineer" }] },
                  { t: "Interview", tone: "text-[#7C3AED]", items: [{ c: "Stripe", r: "Design Systems" }, { c: "Anthropic", r: "Product Designer" }] },
                  { t: "Offer", tone: "text-[#16A34A]", items: [{ c: "Figma", r: "Sr. Frontend" }] },
                ].map((col) => (
                  <div key={col.t} className="rounded-xl border border-black/5 bg-[oklch(0.98_0.005_265)] p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className={`font-semibold ${col.tone}`}>{col.t}</span>
                      <span className="text-[oklch(0.5_0.02_265)]">{col.items.length}</span>
                    </div>
                    <div className="mt-2 space-y-2">
                      {col.items.map((it) => (
                        <div key={it.c + it.r} className="rounded-lg border border-black/5 bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                          <div className="flex items-center gap-2">
                            <div className="grid h-6 w-6 place-items-center rounded bg-black/5 text-[10px] font-semibold">{it.c[0]}</div>
                            <p className="text-xs font-semibold">{it.c}</p>
                          </div>
                          <p className="mt-1.5 text-[11px] text-[oklch(0.5_0.02_265)]">{it.r}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-black/5 bg-white p-5">
                <p className="text-xs text-[oklch(0.5_0.02_265)]">Resume match — Linear · Sr. Product Designer</p>
                <div className="mt-3 flex items-end gap-2">
                  <p className="font-display text-4xl font-semibold">92<span className="text-lg text-[oklch(0.5_0.02_265)]">%</span></p>
                  <span className="pb-2 text-xs text-[#16A34A]">Strong fit</span>
                </div>
                <div className="mt-4 space-y-2 text-xs">
                  {[
                    { l: "Skills coverage", v: 94, c: "bg-[#2563EB]" },
                    { l: "Experience", v: 88, c: "bg-[#7C3AED]" },
                    { l: "Keywords", v: 76, c: "bg-[#F59E0B]" },
                  ].map((r) => (
                    <div key={r.l}>
                      <div className="flex justify-between text-[oklch(0.5_0.02_265)]">
                        <span>{r.l}</span>
                        <span>{r.v}%</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-black/5">
                        <div className={`h-full rounded-full ${r.c}`} style={{ width: `${r.v}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-black/5 bg-white p-5">
                <p className="text-xs text-[oklch(0.5_0.02_265)]">Quick actions</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    { l: "Generate cover letter", i: Sparkles },
                    { l: "Tailor resume", i: FileText },
                    { l: "Add job manually", i: Plus },
                    { l: "Prep for interview", i: CalendarClock },
                  ].map((q) => (
                    <button
                      key={q.l}
                      className="flex items-center gap-2 rounded-xl border border-black/5 bg-[oklch(0.98_0.005_265)] px-3 py-2.5 text-sm hover:bg-black/[0.03]"
                    >
                      <q.i className="h-4 w-4 text-[#2563EB]" />
                      {q.l}
                    </button>
                  ))}
                </div>
                <div className="mt-4 rounded-xl border border-dashed border-black/10 p-4 text-center text-xs text-[oklch(0.5_0.02_265)]">
                  <p>Live preview only.</p>
                  <Link to="/signup" className="mt-1 inline-block font-medium text-[#2563EB]">Sign up to try the real app →</Link>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}