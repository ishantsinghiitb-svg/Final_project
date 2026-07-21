import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  FileText,
  Plus,
  Loader2,
  Mail,
  Phone,
  MapPin,
  Linkedin,
  Github,
  Globe,
  Sparkles,
  Star,
  Gauge,
} from "lucide-react";
import {
  DashCard,
  PageHeader,
  EmptyState,
  StickyPageHeader,
  SectionTitle,
} from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import { ResumeUploadDialog } from "@/components/dashboard/resumes/ResumeUploadDialog";
import { ResumeListItem } from "@/components/dashboard/resumes/ResumeListItem";
import { ResumeHealthPanel } from "@/components/dashboard/resumes/ResumeHealthPanel";
import { useResumes, useResumeParsed, useReparseResume } from "@/features/resumes/hooks";
import { useAICredits } from "@/features/ai/hooks";
import type { ResumeParsed } from "@/repositories/ResumeParsedRepository";

export const Route = createFileRoute("/dashboard/resumes")({
  head: () => ({
    meta: [{ title: "Resumes — NextOffer" }, { name: "robots", content: "noindex" }],
  }),
  component: ResumesPage,
});

function ResumesPage() {
  const { data: resumes = [], isLoading } = useResumes();
  const { data: credits } = useAICredits();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Keep a valid selection: prefer the default resume, else the first.
  useEffect(() => {
    if (resumes.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !resumes.some((r) => r.id === selectedId)) {
      const preferred = resumes.find((r) => r.is_default) ?? resumes[0];
      setSelectedId(preferred.id);
    }
  }, [resumes, selectedId]);

  const selected = useMemo(
    () => resumes.find((r) => r.id === selectedId) ?? null,
    [resumes, selectedId],
  );
  const defaultResume = useMemo(() => resumes.find((r) => r.is_default) ?? null, [resumes]);

  // Fetched once here and passed down — avoids the detail panel re-subscribing
  // to the same query key with its own hook call.
  const { data: parsed } = useResumeParsed(selected?.id);
  const reparse = useReparseResume();

  return (
    <>
      <StickyPageHeader>
        <PageHeader
          eyebrow="Resumes"
          title="Manage your resumes."
          subtitle="Upload, organize, and keep a default resume. Every upload is parsed and gets an instant health report."
          actions={
            <DashButton onClick={() => setUploadOpen(true)}>
              <Plus className="h-4 w-4" /> Upload resume
            </DashButton>
          }
        />
      </StickyPageHeader>

      {isLoading ? (
        <div className="grid place-items-center py-20 text-[oklch(0.5_0.02_265)]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : resumes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No resumes yet"
          body="Upload a PDF resume to get started. We extract the text and generate a deterministic health report — no AI credits used."
          cta={
            <DashButton onClick={() => setUploadOpen(true)}>
              <Plus className="h-4 w-4" /> Upload resume
            </DashButton>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <StatTile icon={FileText} label="Total resumes" value={String(resumes.length)} />
            <StatTile
              icon={Star}
              label="Default resume"
              value={defaultResume?.name ?? "None set"}
              tone="text-[#B45309]"
            />
            <StatTile
              icon={Sparkles}
              label="AI credits"
              value={credits ? `${credits.creditsRemaining} / ${credits.creditsTotal}` : "—"}
              tone={credits?.featureLocked ? "text-[#E11D48]" : "text-[#7C3AED]"}
            />
            <StatTile
              icon={Gauge}
              label={selected ? `Health · ${selected.name}` : "Health score"}
              value={parsed?.health ? `${parsed.health.score}/100` : "—"}
              tone="text-[#2563EB]"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-3">
              {resumes.map((r) => (
                <ResumeListItem
                  key={r.id}
                  resume={r}
                  selected={r.id === selectedId}
                  onSelect={() => setSelectedId(r.id)}
                />
              ))}
            </div>

            <div className="space-y-4">
              {selected && (
                <ResumeDetail
                  resumeId={selected.id}
                  parseStatus={selected.parse_status}
                  parseError={selected.parse_error}
                  parsed={parsed ?? null}
                  onReparse={() => reparse.mutate(selected.id)}
                  reparsing={reparse.isPending}
                />
              )}
            </div>
          </div>
        </>
      )}

      <ResumeUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone = "text-[#2563EB]",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <DashCard className="flex items-center gap-3">
      <div
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-black/[0.03] ${tone}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-[oklch(0.5_0.02_265)]">{label}</p>
        <p className="truncate font-display text-lg font-semibold text-[oklch(0.2_0.02_265)]">
          {value}
        </p>
      </div>
    </DashCard>
  );
}

function ResumeDetail({
  resumeId,
  parseStatus,
  parseError,
  parsed,
  onReparse,
  reparsing,
}: {
  resumeId: string;
  parseStatus: string | undefined;
  parseError: string | null | undefined;
  parsed: ResumeParsed | null;
  onReparse: () => void;
  reparsing: boolean;
}) {
  const contact = parsed?.structured?.contact;

  return (
    <>
      <DashCard key={resumeId}>
        <ResumeHealthPanel
          health={parsed?.health ?? null}
          parseStatus={parseStatus}
          parseError={parseError}
          onReparse={onReparse}
          reparsing={reparsing}
        />
      </DashCard>

      {contact && (
        <DashCard>
          <SectionTitle>Extracted details</SectionTitle>
          <div className="mt-3 space-y-2 text-sm text-[oklch(0.3_0.02_265)]">
            {contact.name && (
              <p className="font-display text-base font-semibold text-[oklch(0.2_0.02_265)]">
                {contact.name}
              </p>
            )}
            {contact.email && <Detail icon={Mail} value={contact.email} />}
            {contact.phone && <Detail icon={Phone} value={contact.phone} />}
            {contact.location && <Detail icon={MapPin} value={contact.location} />}
            {contact.linkedin && (
              <Detail icon={Linkedin} value={contact.linkedin} href={contact.linkedin} />
            )}
            {contact.github && (
              <Detail icon={Github} value={contact.github} href={contact.github} />
            )}
            {contact.portfolio && (
              <Detail icon={Globe} value={contact.portfolio} href={contact.portfolio} />
            )}
            {!contact.email &&
              !contact.phone &&
              !contact.location &&
              !contact.linkedin &&
              !contact.github &&
              !contact.portfolio && (
                <p className="text-[oklch(0.55_0.02_265)]">No contact details detected.</p>
              )}
          </div>

          {parsed?.structured && parsed.structured.skills.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[oklch(0.5_0.02_265)]">
                Skills
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {parsed.structured.skills.slice(0, 30).map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] text-[oklch(0.35_0.02_265)]"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {parsed?.structured && parsed.structured.detectedSections.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[oklch(0.5_0.02_265)]">
                Detected sections
              </p>
              <p className="mt-1 text-sm capitalize text-[oklch(0.4_0.02_265)]">
                {parsed.structured.detectedSections.join(" · ")}
              </p>
            </div>
          )}
        </DashCard>
      )}
    </>
  );
}

function Detail({
  icon: Icon,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  href?: string;
}) {
  const content = (
    <p className="flex items-center gap-2 truncate">
      <Icon className="h-3.5 w-3.5 shrink-0 text-[oklch(0.5_0.02_265)]" />
      <span className="truncate">{value}</span>
    </p>
  );
  if (!href) return content;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="block hover:text-[#2563EB]">
      {content}
    </a>
  );
}
