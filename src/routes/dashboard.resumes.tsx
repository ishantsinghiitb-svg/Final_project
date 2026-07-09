import { createFileRoute } from "@tanstack/react-router";
import { FileText, Plus, Sparkles, Download, Copy, Wand2 } from "lucide-react";
import { DashCard, PageHeader, Chip, SectionTitle } from "@/components/dashboard/primitives";
import { resumes } from "@/lib/dashboard-data";

export const Route = createFileRoute("/dashboard/resumes")({
  head: () => ({ meta: [{ title: "Resumes — NextOffer" }, { name: "robots", content: "noindex" }] }),
  component: ResumesPage,
});

function ResumesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Resumes"
        title="Tailor your resume for every role, in seconds."
        subtitle="Keep one master resume, then let AI create job-specific versions that speak the recruiter's language."
        actions={
          <>
            <button className="hidden items-center gap-1.5 rounded-lg border border-black/5 bg-white px-3 py-2 text-sm font-medium hover:bg-black/[0.03] sm:inline-flex">
              <Wand2 className="h-4 w-4" /> Tailor with AI
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-3 py-2 text-sm font-medium text-white">
              <Plus className="h-4 w-4" /> Upload resume
            </button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-3">
          {resumes.map((r) => (
            <DashCard key={r.id} className="hover:shadow-md">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#2563EB]">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display font-semibold">{r.name}</p>
                  {r.tailoredFor && (
                    <p className="text-xs text-[oklch(0.5_0.02_265)]">Tailored for {r.tailoredFor}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[oklch(0.5_0.02_265)]">
                    <Chip tone={r.score >= 90 ? "green" : "blue"}>ATS {r.score}</Chip>
                    <span>{r.keywords} keywords matched</span>
                    <span>·</span>
                    <span>Used {r.used}×</span>
                    <span>·</span>
                    <span>{r.updated}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <button aria-label="Download" className="grid h-8 w-8 place-items-center rounded-lg border border-black/5 bg-white hover:bg-black/[0.03]">
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <button aria-label="Duplicate" className="grid h-8 w-8 place-items-center rounded-lg border border-black/5 bg-white hover:bg-black/[0.03]">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </DashCard>
          ))}
        </div>

        <div className="space-y-4">
          <DashCard>
            <SectionTitle>Live ATS score — Linear · Sr. Product Designer</SectionTitle>
            <div className="mt-3 flex items-end gap-3">
              <p className="font-display text-5xl font-semibold">92<span className="text-lg text-[oklch(0.5_0.02_265)]">%</span></p>
              <span className="pb-2 text-xs font-medium text-[#16A34A]">Strong fit — you're ready to apply.</span>
            </div>
            <div className="mt-5 space-y-3 text-xs">
              {[
                { l: "Skills coverage", v: 94, c: "from-[#2563EB] to-[#3B82F6]" },
                { l: "Experience match", v: 88, c: "from-[#7C3AED] to-[#A855F7]" },
                { l: "Keyword density", v: 76, c: "from-[#F59E0B] to-[#EAB308]" },
                { l: "Format clarity", v: 96, c: "from-[#22C55E] to-[#16A34A]" },
              ].map((r) => (
                <div key={r.l}>
                  <div className="flex justify-between text-[oklch(0.5_0.02_265)]">
                    <span>{r.l}</span>
                    <span className="font-medium text-[oklch(0.3_0.02_265)]">{r.v}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-black/5">
                    <div className={`h-full rounded-full bg-gradient-to-r ${r.c}`} style={{ width: `${r.v}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </DashCard>

          <DashCard className="bg-gradient-to-br from-[#2563EB]/[0.05] to-[#7C3AED]/[0.08]">
            <SectionTitle>AI suggestions</SectionTitle>
            <ul className="mt-3 space-y-2 text-sm">
              {[
                "Lead your summary with your design-systems work — Linear cares deeply about primitives.",
                "Reframe the Ramp project to emphasize cross-functional partnership with engineering.",
                "Add 'motion' and 'interaction' as skills — they're 4 of Linear's 10 job description keywords.",
              ].map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#7C3AED]" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
            <button className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium shadow-sm">
              <Wand2 className="h-3.5 w-3.5 text-[#7C3AED]" /> Apply all suggestions
            </button>
          </DashCard>
        </div>
      </div>
    </>
  );
}