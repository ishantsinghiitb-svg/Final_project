import { createFileRoute } from "@tanstack/react-router";
import { DashCard, PageHeader, SectionTitle, Chip, StickyPageHeader } from "@/components/dashboard/primitives";

export const Route = createFileRoute("/dashboard/analytics")({
  head: () => ({ meta: [{ title: "Analytics — NextOffer" }, { name: "robots", content: "noindex" }] }),
  component: AnalyticsPage,
});

const funnel = [
  { label: "Roles saved", v: 68, w: 100, tone: "from-[#93C5FD] to-[#60A5FA]" },
  { label: "Applied", v: 42, w: 62, tone: "from-[#60A5FA] to-[#3B82F6]" },
  { label: "Recruiter call", v: 18, w: 27, tone: "from-[#3B82F6] to-[#6366F1]" },
  { label: "Onsite", v: 8, w: 12, tone: "from-[#6366F1] to-[#8B5CF6]" },
  { label: "Offer", v: 2, w: 3, tone: "from-[#8B5CF6] to-[#7C3AED]" },
];

const bars = [4, 6, 9, 5, 8, 12, 7, 10, 14, 11, 9, 13];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function AnalyticsPage() {
  return (
    <>
      <StickyPageHeader>
      <PageHeader
        eyebrow="Analytics"
        title="Signal, not vanity metrics."
        subtitle="See what's actually moving the needle — where you're getting traction and where things are stalling."
      />
      </StickyPageHeader>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { l: "Response rate", v: "42%", d: "+8% vs. last month", tone: "text-[#16A34A]" },
          { l: "Interview rate", v: "18%", d: "Above industry avg.", tone: "text-[#7C3AED]" },
          { l: "Median cycle", v: "17d", d: "First touch → offer", tone: "text-[#2563EB]" },
          { l: "Best match score", v: "94", d: "Linear · Sr. Designer", tone: "text-[#2563EB]" },
        ].map((s) => (
          <DashCard key={s.l}>
            <p className="text-xs text-[oklch(0.5_0.02_265)]">{s.l}</p>
            <p className="mt-1 font-display text-2xl font-semibold">{s.v}</p>
            <p className={`mt-0.5 text-[11px] ${s.tone}`}>{s.d}</p>
          </DashCard>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <DashCard>
          <SectionTitle action={<Chip tone="green">+22% this quarter</Chip>}>
            Applications over time
          </SectionTitle>
          <div className="mt-4 flex items-end gap-2">
            {bars.map((v, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-md bg-gradient-to-t from-[#2563EB] to-[#7C3AED]"
                  style={{ height: `${(v / 14) * 140}px` }}
                />
                <span className="text-[10px] text-[oklch(0.55_0.02_265)]">{months[i]}</span>
              </div>
            ))}
          </div>
        </DashCard>

        <DashCard>
          <SectionTitle>Application funnel</SectionTitle>
          <div className="mt-4 space-y-2">
            {funnel.map((f) => (
              <div key={f.label}>
                <div className="flex justify-between text-xs">
                  <span className="text-[oklch(0.4_0.02_265)]">{f.label}</span>
                  <span className="font-medium">{f.v}</span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-black/5">
                  <div className={`h-full rounded-full bg-gradient-to-r ${f.tone}`} style={{ width: `${f.w}%` }} />
                </div>
              </div>
            ))}
          </div>
        </DashCard>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <DashCard>
          <SectionTitle>Where responses come from</SectionTitle>
          <ul className="mt-3 space-y-3 text-sm">
            {[
              { s: "LinkedIn", pct: 34 },
              { s: "Referrals", pct: 28 },
              { s: "Wellfound", pct: 18 },
              { s: "Company pages", pct: 12 },
              { s: "Greenhouse boards", pct: 8 },
            ].map((r) => (
              <li key={r.s}>
                <div className="flex justify-between text-xs">
                  <span>{r.s}</span>
                  <span className="text-[oklch(0.5_0.02_265)]">{r.pct}%</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-black/5">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" style={{ width: `${r.pct * 2}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </DashCard>

        <DashCard>
          <SectionTitle>What's working</SectionTitle>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#16A34A]" />
              <span>Resumes tailored with AI get <b>2.3× more responses</b> than your master resume.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2563EB]" />
              <span>You apply fastest on <b>Tuesdays</b> — and Tuesday apps convert best too.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#7C3AED]" />
              <span>Roles above <b>85% match</b> land you an interview 4× more often than 70–85%.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#F59E0B]" />
              <span>3 apps have been quiet for 10+ days — a nudge usually helps.</span>
            </li>
          </ul>
        </DashCard>
      </div>
    </>
  );
}