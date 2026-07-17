import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, Video, Sparkles, Clock, User } from "lucide-react";
import { DashCard, PageHeader, Chip, CompanyMark, SectionTitle, StickyPageHeader } from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import { interviews } from "@/lib/dashboard-data";

export const Route = createFileRoute("/dashboard/interviews")({
  head: () => ({ meta: [{ title: "Interviews — NextOffer" }, { name: "robots", content: "noindex" }] }),
  component: InterviewsPage,
});

const typeTone: Record<string, "blue" | "purple" | "green" | "amber" | "rose"> = {
  Recruiter: "blue",
  Technical: "purple",
  Design: "purple",
  Behavioral: "amber",
  Onsite: "rose",
  "Offer chat": "green",
};

function InterviewsPage() {
  const [next, ...upcoming] = interviews;

  return (
    <>
      <StickyPageHeader>
      <PageHeader
        eyebrow="Interviews"
        title="Walk in prepared, walk out confident."
        subtitle="Every interview lives here with AI-generated prep, likely questions, and space for your notes afterward."
      />
      </StickyPageHeader>

      {next && (
        <DashCard className="border-[#7C3AED]/15 bg-gradient-to-br from-[#7C3AED]/[0.06] to-[#2563EB]/[0.04]">
          <div className="flex flex-wrap items-start gap-4">
            <CompanyMark company={next.company} tone="from-[#7C3AED] to-[#2563EB]" size={56} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-display text-lg font-semibold">{next.company}</p>
                <Chip tone={typeTone[next.type]}>{next.type} round</Chip>
              </div>
              <p className="text-sm text-[oklch(0.45_0.02_265)]">{next.role}</p>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-[oklch(0.5_0.02_265)]">
                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {next.when} · {next.time}</span>
                <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> {next.interviewer}</span>
                {next.link && (
                  <span className="inline-flex items-center gap-1"><Video className="h-3 w-3" /> {next.link}</span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-black/5 bg-white px-3 py-2 text-sm font-medium hover:bg-black/[0.03]">
                Reschedule
              </button>
              <DashButton>
                <Sparkles className="h-4 w-4" /> Open AI prep
              </DashButton>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-black/5 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[oklch(0.55_0.02_265)]">Likely questions</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                <li>"Walk us through the design of your favorite product."</li>
                <li>"How do you handle disagreements with engineering?"</li>
                <li>"What would you change about Linear's UI?"</li>
              </ul>
            </div>
            <div className="rounded-xl border border-black/5 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[oklch(0.55_0.02_265)]">Company research</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                <li>Just shipped Cycles v2 and Insights</li>
                <li>Series C · 130 people · profitable</li>
                <li>Design-led, cares about primitives</li>
              </ul>
            </div>
            <div className="rounded-xl border border-black/5 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[oklch(0.55_0.02_265)]">Your prep note</p>
              <p className="mt-2 text-sm text-[oklch(0.4_0.02_265)]">{next.prep}</p>
              <button className="mt-2 text-xs font-medium text-[#2563EB]">Open note →</button>
            </div>
          </div>
        </DashCard>
      )}

      <div>
        <SectionTitle>Coming up</SectionTitle>
        <ul className="mt-3 divide-y divide-black/5 overflow-hidden rounded-2xl border border-black/5 bg-white">
          {upcoming.map((i) => (
            <li key={i.id} className="flex items-center gap-4 px-4 py-3 hover:bg-[oklch(0.98_0.005_265)]">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-[oklch(0.97_0.01_265)] text-[oklch(0.4_0.02_265)]">
                <CalendarClock className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium">{i.company}</p>
                  <Chip tone={typeTone[i.type]}>{i.type}</Chip>
                </div>
                <p className="truncate text-xs text-[oklch(0.5_0.02_265)]">{i.role} · with {i.interviewer}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">{i.when}</p>
                <p className="text-[11px] text-[oklch(0.55_0.02_265)]">{i.time}</p>
              </div>
              <button className="hidden rounded-lg border border-black/5 bg-white px-3 py-1.5 text-xs font-medium hover:bg-black/[0.03] md:block">
                Prep
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}