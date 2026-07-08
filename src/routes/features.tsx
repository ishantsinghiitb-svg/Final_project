import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Chrome, Bookmark, FileText, BrainCircuit, Sparkles, Bot, Kanban, CalendarClock, StickyNote, LineChart, KeyRound } from "lucide-react";
import { Section } from "@/components/site/Section";
import { ButtonLink } from "@/components/site/PrimaryButton";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "Features — NextOffer" },
      { name: "description", content: "Every capability of NextOffer — from the Chrome extension to AI resume match, ATS score, kanban tracker, interview prep and analytics." },
      { property: "og:title", content: "Features — NextOffer" },
      { property: "og:description", content: "A complete AI job search copilot. Extension, resumes, ATS, tracker, analytics." },
    ],
  }),
  component: FeaturesPage,
});

const items = [
  { icon: KeyRound, title: "Google & Email Authentication", desc: "Sign in with Google, Apple, or a passwordless email link. Your data, encrypted at rest." },
  { icon: Chrome, title: "Chrome Extension", desc: "Save any job with one click. Works on LinkedIn, Wellfound, Greenhouse, Lever, Naukri and any career page." },
  { icon: Bookmark, title: "Save Jobs", desc: "Bookmark roles as you browse. NextOffer keeps context — company, salary, source — attached." },
  { icon: Sparkles, title: "Automatic Job Data Extraction", desc: "Titles, salary bands, requirements, and locations parsed automatically. No copy-paste." },
  { icon: FileText, title: "Job Library", desc: "One home for every role. Filter by fit, stage, salary, remote, seniority. Everything searchable." },
  { icon: FileText, title: "Resume Management", desc: "Store multiple resumes and versions. Assign them per role, share via link, or export to PDF." },
  { icon: BrainCircuit, title: "AI Resume Match", desc: "See a per-role match score, gaps, and rewrites — grounded in the job description." },
  { icon: Sparkles, title: "ATS Score", desc: "Real-time compatibility with modern applicant tracking systems, with fixes that move the needle." },
  { icon: BrainCircuit, title: "Skill Gap Analysis", desc: "Know what's missing before an interviewer does — and get a study plan." },
  { icon: Bot, title: "AI Cover Letter Generator", desc: "Personalized cover letters that sound like you, generated in seconds and editable in place." },
  { icon: Kanban, title: "Kanban Application Tracker", desc: "Applied → Interview → Offer → Closed. Drag between stages, add notes, get nudges." },
  { icon: CalendarClock, title: "Interview Tracker", desc: "Rounds, panelists, prep notes, salary, and follow-ups. Nothing slips." },
  { icon: StickyNote, title: "Personal Notes", desc: "Rich notes per company and role. Great for recruiter chats and gut checks." },
  { icon: LineChart, title: "Analytics Dashboard", desc: "Response rate, funnel, offer velocity — the metrics that predict outcomes." },
];

function FeaturesPage() {
  return (
    <>
      <Section
        align="center"
        eyebrow="Features"
        title={<>A copilot, not another tab.</>}
        description="NextOffer is designed to sit alongside your existing job search — with just enough intelligence to make the whole thing feel effortless."
      >
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {items.map((f) => (
            <div key={f.title} className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 transition-colors hover:border-white/15">
              <div className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-[#93C5FD]">
                <f.icon className="h-4 w-4" />
              </div>
              <p className="mt-4 font-display text-[15px] font-semibold">{f.title}</p>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section className="pb-32">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[oklch(0.22_0.06_265)] to-[oklch(0.18_0.08_290)] p-10 md:p-14">
          <h3 className="font-display text-3xl font-semibold md:text-4xl">Ready to try it?</h3>
          <p className="mt-3 max-w-xl text-muted-foreground">Install the extension, connect a resume, and see your first match score in under two minutes.</p>
          <div className="mt-6 flex gap-3">
            <ButtonLink to="/signup" size="lg">Get Started <ArrowRight className="h-4 w-4" /></ButtonLink>
            <ButtonLink to="/pricing" size="lg" variant="outline">View pricing</ButtonLink>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Prefer to explore first? <Link to="/dashboard" className="underline underline-offset-4 hover:text-foreground">Watch the demo</Link>.
          </p>
        </div>
      </Section>
    </>
  );
}