import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Chromium as Chrome, Bookmark, FileText, BrainCircuit, Sparkles, Bot, Kanban, CalendarClock, StickyNote, ChartLine as LineChart, Check, Wand as Wand2, MousePointerClick, Search, Gauge } from "lucide-react";
import { Section } from "@/components/site/Section";
import { ButtonLink } from "@/components/site/PrimaryButton";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "Features — NextOffer" },
      {
        name: "description",
        content:
          "How NextOffer works — from saving your first job to landing the offer. Capture opportunities, optimize applications, and stay organized.",
      },
      { property: "og:title", content: "Features — NextOffer" },
      { property: "og:description", content: "A walkthrough of every step of your job search, in one workspace." },
    ],
  }),
  component: FeaturesPage,
});

function FeaturesPage() {
  return (
    <>
      <Section
        align="center"
        eyebrow="How it works"
        title={<>One workspace, start to offer.</>}
        description="NextOffer is three things in sequence: a way to capture opportunities, a way to optimize your applications, and a way to stay organized through the whole search."
      />

      <CaptureSection />
      <OptimizeSection />
      <OrganizeSection />

      <Section className="pb-32">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[oklch(0.22_0.06_265)] to-[oklch(0.18_0.08_290)] p-10 md:p-14">
          <h3 className="font-display text-3xl font-semibold md:text-4xl">Ready to try it?</h3>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Install the extension, connect a resume, and see your first match score in under two minutes.
          </p>
          <div className="mt-6 flex gap-3">
            <ButtonLink to="/signup" size="lg">Get Started <ArrowRight className="h-4 w-4" /></ButtonLink>
            <ButtonLink to="/pricing" size="lg" variant="outline">View pricing</ButtonLink>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Prefer to explore first?{" "}
            <Link to="/dashboard" className="underline underline-offset-4 hover:text-foreground">
              See the workspace
            </Link>
            .
          </p>
        </div>
      </Section>
    </>
  );
}

/* ----------------------------------------------- shared building blocks */

function Step({ n, label }: { n: number; label: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-xs font-semibold text-muted-foreground">
        {n}
      </span>
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
    </div>
  );
}

function ProblemSolutionOutcome({
  problem,
  solution,
  outcome,
}: {
  problem: string;
  solution: React.ReactNode;
  outcome: string;
}) {
  return (
    <div className="mt-8 grid gap-3 md:grid-cols-3">
      {[
        { k: "The problem", v: problem as React.ReactNode, tone: "text-muted-foreground" },
        { k: "How NextOffer helps", v: solution, tone: "text-foreground" },
        { k: "The outcome", v: outcome as React.ReactNode, tone: "text-[#93C5FD]" },
      ].map((b) => (
        <div key={b.k} className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{b.k}</p>
          <div className={`mt-2 text-sm ${b.tone}`}>{b.v}</div>
        </div>
      ))}
    </div>
  );
}

function FeatureRow({
  n,
  step,
  icon: Icon,
  title,
  children,
  preview,
  reverse,
  problem,
  solution,
  outcome,
}: {
  n: number;
  step: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children?: React.ReactNode;
  preview: React.ReactNode;
  reverse?: boolean;
  problem: string;
  solution: React.ReactNode;
  outcome: string;
}) {
  return (
    <div>
      <div className="grid items-center gap-12 md:grid-cols-2">
        <div className={reverse ? "order-2 md:order-1" : ""}>
          <Step n={n} label={step} />
          <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-gradient-to-br from-white/5 to-transparent text-[#93C5FD]">
            <Icon className="h-5 w-5" />
          </div>
          <h3 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">{title}</h3>
          <div className="mt-4 text-muted-foreground">{children}</div>
        </div>
        <div className={reverse ? "order-1 md:order-2" : ""}>{preview}</div>
      </div>
      <ProblemSolutionOutcome problem={problem} solution={solution} outcome={outcome} />
    </div>
  );
}

function MiniCheck({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#22C55E]/20 text-[#22C55E]">
        <Check className="h-3 w-3" />
      </span>
      <span className="text-muted-foreground">{children}</span>
    </li>
  );
}

/* ----------------------------------------------- 1. Capture */

function CaptureSection() {
  return (
    <Section
      eyebrow="Capture opportunities"
      title="Save the jobs worth your time."
      description="The best roles are scattered across a dozen sites. NextOffer gives you one way to grab them all — with context attached."
    >
      <div className="space-y-24">
        <FeatureRow
          n={1}
          step="Capture"
          icon={Chrome}
          title="Save any job, from any site, in one click."
          preview={<ExtensionPreview />}
          problem="You find a great role on LinkedIn, another on Greenhouse, a third on a company's careers page — and by the weekend you've forgotten which was which."
          solution={
            <>
              <p className="mb-4">
                The NextOffer Chrome extension sits in your browser and reads
                the page when you click it. Title, company, salary, location,
                requirements — extracted and saved automatically.
              </p>
              <ul className="space-y-2.5">
                <MiniCheck>Works on LinkedIn, Wellfound, Greenhouse, Lever, Ashby, Naukri</MiniCheck>
                <MiniCheck>Lands in your job library with a match score</MiniCheck>
                <MiniCheck>Add it to your pipeline in the column you choose</MiniCheck>
              </ul>
            </>
          }
          outcome="Every role you're considering lives in one searchable library — no more lost tabs."
        />

        <FeatureRow
          n={2}
          step="Capture"
          icon={Sparkles}
          title="Automatic job data extraction."
          reverse
          preview={<ExtractionPreview />}
          problem="Copy-pasting job details into a spreadsheet is slow and lossy — you miss the salary band, the tech stack, or the exact title."
          solution="NextOffer parses the posting for you and fills in the fields. You see a clean card with everything you'd want to compare later."
          outcome="A job library you actually want to return to, with the details that matter for deciding whether to apply."
        />

        <FeatureRow
          n={3}
          step="Capture"
          icon={Bookmark}
          title="A job library you'll actually use."
          preview={<LibraryPreview />}
          problem="Bookmarks and spreadsheets don't filter well — you can't easily find 'remote senior roles above 85% match.'"
          solution="NextOffer keeps every saved role searchable and filterable: by fit, stage, salary, remote, and seniority."
          outcome="When you sit down to apply, the right roles are already surfaced — no scrolling through 200 browser tabs."
        />
      </div>
    </Section>
  );
}

/* ----------------------------------------------- 2. Optimize */

function OptimizeSection() {
  return (
    <Section
      eyebrow="Optimize applications"
      title="Tailor your resume. Beat the bots. Write the letter."
      description="A generic resume gets filtered out. NextOffer grounds every suggestion in the job you're actually applying to."
    >
      <div className="space-y-24">
        <FeatureRow
          n={4}
          step="Optimize"
          icon={BrainCircuit}
          title="Resume match, grounded in the JD."
          preview={<MatchPreview />}
          problem="You have one resume and fifty roles. Which one should you rewrite for, and how much rewriting is enough?"
          solution={
            <>
              <p className="mb-4">
                Upload your resume once. NextOffer scores it against the actual
                job description — per skill, keyword, and experience level — and
                shows you the gaps.
              </p>
              <ul className="space-y-2.5">
                <MiniCheck>Per-role match score, not a generic number</MiniCheck>
                <MiniCheck>Skills coverage, experience level, keyword density, tone</MiniCheck>
                <MiniCheck>Suggestions tied to specific JD lines</MiniCheck>
              </ul>
            </>
          }
          outcome="You know which resume to send — and what to change before you send it."
        />

        <FeatureRow
          n={5}
          step="Optimize"
          icon={Gauge}
          title="ATS score that reflects reality."
          reverse
          preview={<ATSPreview />}
          problem="Most resumes are rejected by applicant tracking software before a human reads them."
          solution="NextOffer checks your resume against modern ATS rules in real time — formatting, parsing, keyword density, section completeness — and shows fixes ranked by impact."
          outcome="Your resume gets through the bots and in front of a recruiter."
        />

        <FeatureRow
          n={6}
          step="Optimize"
          icon={Wand2}
          title="Skill gap analysis."
          preview={<GapPreview />}
          problem="You can't fix what you can't see. Job descriptions list skills you may not have — and you don't know which ones matter."
          solution="NextOffer maps the JD's required skills against your resume and highlights the real gaps, with a short study plan for the ones that come up most."
          outcome="You walk into the interview knowing the territory — and what to study first."
        />

        <FeatureRow
          n={7}
          step="Optimize"
          icon={Bot}
          title="Cover letters in your voice."
          reverse
          preview={<CoverLetterPreview />}
          problem="Writing a cover letter for every application is the worst kind of homework — and generic templates get ignored."
          solution={
            <>
              <p className="mb-4">
                NextOffer drafts a cover letter from your resume and the job
                description — referencing real projects you've shipped, in a
                tone you can tune.
              </p>
              <ul className="space-y-2.5">
                <MiniCheck>Generated from your resume + the JD, not a template</MiniCheck>
                <MiniCheck>Editable in place, exportable to PDF</MiniCheck>
                <MiniCheck>Saved with the application, one per role</MiniCheck>
              </ul>
            </>
          }
          outcome="A cover letter that sounds like you — in seconds, not an hour."
        />
      </div>
    </Section>
  );
}

/* ----------------------------------------------- 3. Organize */

function OrganizeSection() {
  return (
    <Section
      eyebrow="Stay organized"
      title="Track every step. Never drop the ball."
      description="A kanban for your search, a tracker for your interviews, a home for your notes, and the numbers that predict outcomes."
    >
      <div className="space-y-24">
        <FeatureRow
          n={8}
          step="Organize"
          icon={Kanban}
          title="A kanban tracker for job search."
          preview={<KanbanPreview />}
          problem="Spreadsheets don't tell you what's stalled, what's waiting on you, or what needs a nudge."
          solution="NextOffer's pipeline board shows every application from Interested to Offer — drag between stages, add notes, and get nudged when something goes quiet."
          outcome="You always know what's next, and nothing slips through the cracks."
        />

        <FeatureRow
          n={9}
          step="Organize"
          icon={CalendarClock}
          title="Interview tracker with prep built in."
          reverse
          preview={<InterviewPreview />}
          problem="Interviews come with rounds, panelists, prep notes, salary questions, and follow-ups — and they all live in your head."
          solution="NextOffer keeps every interview in one place: the type, the interviewer, the prep, and AI-generated likely questions for that role and round."
          outcome="The night before is calm. You walk in ready."
        />

        <FeatureRow
          n={10}
          step="Organize"
          icon={StickyNote}
          title="Personal notes, kept in context."
          preview={<NotesPreview />}
          problem="Recruiter chats, salary bands, gut feelings — these live in a dozen places and never where you need them."
          solution="NextOffer attaches notes to the company and role they belong to, with tags for prep, questions, follow-ups, and ideas."
          outcome="When it's time to decide between two offers, your reasoning is already organized."
        />

        <FeatureRow
          n={11}
          step="Organize"
          icon={LineChart}
          title="Analytics that predict outcomes."
          reverse
          preview={<AnalyticsPreview />}
          problem="You don't know what's working. Are your tailored resumes getting more responses? Is Tuesday actually the best day to apply?"
          solution="NextOffer shows response rate by resume, average time-to-interview, offer velocity, and where you drop off in the funnel — the signals, not the vanity metrics."
          outcome="You spend your time on what's actually moving you toward an offer."
        />
      </div>
    </Section>
  );
}

/* ----------------------------------------------- previews */

function Frame({ children, tone = "from-[#2563EB]/15 to-[#7C3AED]/10" }: { children: React.ReactNode; tone?: string }) {
  return (
    <div className="relative">
      <div className={`absolute -inset-8 -z-10 rounded-3xl bg-gradient-to-br ${tone} blur-3xl`} />
      <div className="rounded-2xl border border-white/10 bg-[oklch(0.19_0.03_265)]/80 p-4 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)] backdrop-blur">
        {children}
      </div>
    </div>
  );
}

function ExtensionPreview() {
  return (
    <Frame>
      <div className="flex items-center gap-2 border-b border-white/5 pb-3">
        <MousePointerClick className="h-4 w-4 text-[#93C5FD]" />
        <p className="text-xs text-muted-foreground">linkedin.com/jobs/view/…</p>
      </div>
      <div className="mt-4 flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-white/20 to-white/5" />
        <div className="flex-1">
          <p className="text-sm font-semibold">Senior Frontend Engineer</p>
          <p className="text-xs text-muted-foreground">Linear · Remote · $180k – $230k</p>
        </div>
        <button className="rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-3 py-1.5 text-xs font-medium text-white">Save</button>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
        {[
          { l: "Match", v: "92%", c: "text-[#22C55E]" },
          { l: "ATS", v: "88", c: "text-[#A78BFA]" },
          { l: "Fit", v: "Strong", c: "text-[#93C5FD]" },
        ].map((s) => (
          <div key={s.l} className="rounded-md border border-white/5 bg-white/[0.02] p-2">
            <p className="text-[10px] uppercase text-muted-foreground">{s.l}</p>
            <p className={`mt-0.5 font-semibold ${s.c}`}>{s.v}</p>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function ExtractionPreview() {
  const rows = [
    { l: "Title", v: "Senior Frontend Engineer" },
    { l: "Company", v: "Linear" },
    { l: "Salary", v: "$180k – $230k" },
    { l: "Location", v: "Remote · US" },
    { l: "Seniority", v: "Senior" },
    { l: "Stack", v: "React, TypeScript, Node" },
  ];
  return (
    <Frame tone="from-[#7C3AED]/15 to-[#2563EB]/10">
      <p className="px-1 pb-3 text-xs text-muted-foreground">Auto-extracted from the posting</p>
      <div className="divide-y divide-white/5 rounded-xl border border-white/5">
        {rows.map((r) => (
          <div key={r.l} className="flex items-center justify-between px-3 py-2.5 text-xs">
            <span className="text-muted-foreground">{r.l}</span>
            <span className="font-medium">{r.v}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function LibraryPreview() {
  const jobs = [
    { c: "Linear", r: "Sr. Product Designer", m: 94, t: "text-[#22C55E]" },
    { c: "Vercel", r: "Frontend Engineer", m: 91, t: "text-[#22C55E]" },
    { c: "Notion", r: "Product Engineer", m: 86, t: "text-[#93C5FD]" },
    { c: "Anthropic", r: "Product Designer", m: 82, t: "text-[#93C5FD]" },
  ];
  return (
    <Frame>
      <div className="flex items-center gap-2 border-b border-white/5 pb-3">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">remote · senior · ≥85% match</p>
      </div>
      <div className="mt-3 space-y-2">
        {jobs.map((j) => (
          <div key={j.c} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
            <div className="grid h-7 w-7 place-items-center rounded bg-white/10 text-[10px] font-semibold">{j.c[0]}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{j.c}</p>
              <p className="text-[11px] text-muted-foreground">{j.r}</p>
            </div>
            <span className={`text-xs font-semibold ${j.t}`}>{j.m}%</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function MatchPreview() {
  return (
    <Frame tone="from-[#7C3AED]/15 to-[#2563EB]/10">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Match analysis</span>
        <span className="rounded-full bg-[#22C55E]/15 px-2 py-0.5 text-[#22C55E]">Strong fit</span>
      </div>
      <div className="mt-4 flex items-end gap-2">
        <p className="font-display text-5xl font-semibold">92<span className="text-2xl text-muted-foreground">%</span></p>
        <p className="pb-2 text-xs text-muted-foreground">resume ↔ job description</p>
      </div>
      <div className="mt-5 space-y-3 text-xs">
        {[
          { l: "Skills coverage", v: 94 },
          { l: "Experience level", v: 88 },
          { l: "Keywords", v: 76 },
          { l: "Tone & clarity", v: 90 },
        ].map((r) => (
          <div key={r.l}>
            <div className="flex justify-between text-muted-foreground">
              <span>{r.l}</span>
              <span>{r.v}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-white/5">
              <div className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" style={{ width: `${r.v}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function ATSPreview() {
  return (
    <Frame>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">ATS compatibility</p>
        <span className="rounded-full bg-[#22C55E]/15 px-2 py-0.5 text-[11px] text-[#22C55E]">Ready</span>
      </div>
      <div className="mt-3 flex items-center gap-4">
        <svg viewBox="0 0 48 48" className="h-16 w-16 -rotate-90">
          <circle cx="24" cy="24" r="20" stroke="oklch(1 0 0 / 0.08)" strokeWidth="4" fill="none" />
          <circle cx="24" cy="24" r="20" stroke="#7C3AED" strokeWidth="4" fill="none" strokeDasharray={`${(88 / 100) * 125.6} 125.6`} strokeLinecap="round" />
        </svg>
        <div>
          <p className="font-display text-3xl font-semibold">88<span className="text-base text-muted-foreground">/100</span></p>
          <p className="text-[11px] text-muted-foreground">vs. Greenhouse rules</p>
        </div>
      </div>
      <div className="mt-5 space-y-2 text-xs">
        {[
          { l: "Keyword density", v: 82, c: "from-[#2563EB] to-[#3B82F6]" },
          { l: "Format & parsing", v: 96, c: "from-[#22C55E] to-[#16A34A]" },
        ].map((r) => (
          <div key={r.l}>
            <div className="flex justify-between text-muted-foreground"><span>{r.l}</span><span>{r.v}%</span></div>
            <div className="mt-1 h-1.5 rounded-full bg-white/5">
              <div className={`h-full rounded-full bg-gradient-to-r ${r.c}`} style={{ width: `${r.v}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function GapPreview() {
  return (
    <Frame tone="from-[#7C3AED]/15 to-[#2563EB]/10">
      <p className="px-1 pb-3 text-xs text-muted-foreground">Skill gap — Linear · Sr. Product Designer</p>
      <div className="space-y-3 text-xs">
        {[
          { l: "Design systems", v: 88, c: "bg-[#22C55E]" },
          { l: "Motion", v: 72, c: "bg-[#F59E0B]" },
          { l: "Canvas / rendering", v: 35, c: "bg-[#EF4444]" },
        ].map((s) => (
          <div key={s.l}>
            <div className="flex justify-between text-muted-foreground"><span>{s.l}</span><span>{s.v}%</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div className={`h-full ${s.c}`} style={{ width: `${s.v}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[11px] text-muted-foreground">
        Study plan: <span className="text-foreground">Canvas fundamentals (2h)</span> — comes up in 3 of the JD's 8 requirements.
      </div>
    </Frame>
  );
}

function CoverLetterPreview() {
  return (
    <Frame>
      <div className="flex items-center justify-between border-b border-white/5 pb-3 text-xs">
        <span className="text-muted-foreground">Cover letter · Linear · Sr. Product Designer</span>
        <span className="inline-flex items-center gap-1 text-[#A78BFA]"><Bot className="h-3 w-3" /> AI draft</span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Hi Karri — I've followed Linear's craft since the first public beta. At
        Ramp I led the design-systems rollout that cut our component sprawl by
        40%, and I'd love to bring that discipline to your primitives team…
      </p>
      <div className="mt-4 flex items-center gap-2">
        <button className="rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] text-muted-foreground">Regenerate</button>
        <button className="rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-2.5 py-1.5 text-[11px] font-medium text-white">Export PDF</button>
      </div>
    </Frame>
  );
}

function KanbanPreview() {
  const cols = [
    { t: "Applied", tone: "text-[#93C5FD]", items: ["Vercel", "Raycast"] },
    { t: "Interview", tone: "text-[#A78BFA]", items: ["Stripe", "Anthropic"] },
    { t: "Offer", tone: "text-[#22C55E]", items: ["Figma"] },
  ];
  return (
    <Frame>
      <div className="grid grid-cols-3 gap-2">
        {cols.map((c) => (
          <div key={c.t} className="rounded-xl border border-white/5 bg-white/[0.02] p-2">
            <p className={`px-1 pb-2 text-[10px] font-semibold ${c.tone}`}>{c.t}</p>
            <div className="space-y-1.5">
              {c.items.map((it) => (
                <div key={it} className="rounded-lg border border-white/5 bg-white/[0.02] p-2">
                  <p className="text-[10px] font-semibold">{it}</p>
                  <p className="text-[9px] text-muted-foreground">Senior</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function InterviewPreview() {
  return (
    <Frame tone="from-[#7C3AED]/15 to-[#2563EB]/10">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Linear — Design round</p>
        <span className="rounded-full bg-[#7C3AED]/15 px-2 py-0.5 text-[11px] text-[#A78BFA]">Today</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">with Karri Saarinen</p>
      <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Likely questions</p>
        <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
          <li>"Walk us through your favorite product's design."</li>
          <li>"How do you handle disagreements with engineering?"</li>
        </ul>
      </div>
    </Frame>
  );
}

function NotesPreview() {
  const notes = [
    { t: "Questions for Linear onsite", tag: "Question" },
    { t: "Follow up with Guillermo (Vercel)", tag: "Followup" },
    { t: "STAR — Design system rollout", tag: "Prep" },
  ];
  return (
    <Frame>
      <div className="space-y-2">
        {notes.map((n) => (
          <div key={n.t} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">{n.t}</p>
              <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-muted-foreground">{n.tag}</span>
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function AnalyticsPreview() {
  return (
    <Frame tone="from-[#7C3AED]/15 to-[#2563EB]/10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Weekly activity</p>
          <p className="mt-1 font-display text-2xl font-semibold">142 <span className="text-sm text-muted-foreground">applications</span></p>
        </div>
        <span className="rounded-full bg-[#22C55E]/15 px-2 py-0.5 text-[11px] text-[#22C55E]">+22%</span>
      </div>
      <svg viewBox="0 0 320 140" className="mt-4 h-40 w-full">
        <defs>
          <linearGradient id="fa" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#7C3AED" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[20, 50, 80, 110].map((y) => (
          <line key={y} x1="0" x2="320" y1={y} y2={y} stroke="oklch(1 0 0 / 0.05)" />
        ))}
        <path d="M0,100 C40,90 60,60 100,70 C140,80 160,30 200,40 C240,50 260,20 320,30 L320,140 L0,140 Z" fill="url(#fa)" />
        <path d="M0,100 C40,90 60,60 100,70 C140,80 160,30 200,40 C240,50 260,20 320,30" stroke="#2563EB" strokeWidth="2" fill="none" />
      </svg>
    </Frame>
  );
}
