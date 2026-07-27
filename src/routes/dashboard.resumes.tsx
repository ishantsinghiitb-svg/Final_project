import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  Wand2,
  History,
} from "lucide-react";
import { toast } from "sonner";
import {
  Chip,
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
import { OptimizeEntryDialog } from "@/components/dashboard/optimizer/OptimizeEntryDialog";
import { DownloadMenu } from "@/components/dashboard/optimizer/DownloadMenu";
import { VersionHistoryDialog } from "@/components/dashboard/optimizer/VersionHistoryDialog";
import { useResumes, useResumeParsed, useReparseResume } from "@/features/resumes/hooks";
import { useResumeVersionsList } from "@/features/optimizer/hooks";
import { useAICredits } from "@/features/ai/hooks";
import {
  downloadResume,
  parseResumeText,
  type DownloadFormat,
} from "@/features/optimizer/download";
import type { OptimizationRecord } from "@/features/optimizer/types";
import type { ResumeParsed } from "@/repositories/ResumeParsedRepository";
import type { Resume, ResumeVersion } from "@/types";

export const Route = createFileRoute("/dashboard/resumes")({
  head: () => ({
    meta: [{ title: "Resumes — NextOffer" }, { name: "robots", content: "noindex" }],
  }),
  component: ResumesPage,
});

function ResumesPage() {
  const navigate = useNavigate();
  const { data: resumes = [], isLoading } = useResumes();
  const { data: credits } = useAICredits();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [optimizeEntryOpen, setOptimizeEntryOpen] = useState(false);
  // True only when the upload dialog was opened from the "Optimize resume" →
  // "Upload new resume" path — the plain "Upload resume" button leaves this
  // false, so its existing behavior (no redirect) is unaffected.
  const [uploadForOptimize, setUploadForOptimize] = useState(false);
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

  function goToOptimize(resumeId: string) {
    void navigate({ to: "/dashboard/resumes/$resumeId/optimize", params: { resumeId } });
  }

  return (
    <>
      <StickyPageHeader>
        <PageHeader
          eyebrow="Resumes"
          title="Manage your resumes."
          subtitle="Upload, organize, and keep a default resume. Every upload is parsed and gets an instant health report."
          actions={
            <>
              <DashButton variant="outline" onClick={() => setUploadOpen(true)}>
                <Plus className="h-4 w-4" /> Upload resume
              </DashButton>
              <DashButton onClick={() => setOptimizeEntryOpen(true)}>
                <Sparkles className="h-4 w-4" /> Optimize resume
              </DashButton>
            </>
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
                <ResumeLibraryEntry
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

      <ResumeUploadDialog
        open={uploadOpen}
        onOpenChange={(next) => {
          setUploadOpen(next);
          if (!next) setUploadForOptimize(false);
        }}
        onUploaded={uploadForOptimize ? goToOptimize : undefined}
      />

      <OptimizeEntryDialog
        open={optimizeEntryOpen}
        resumes={resumes}
        onOpenChange={setOptimizeEntryOpen}
        onSelectExisting={goToOptimize}
        onUploadNew={() => {
          setUploadForOptimize(true);
          setUploadOpen(true);
        }}
      />
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

/**
 * One resume in the library list, together with its optimized versions (if
 * any) nested directly beneath it — never a separate section elsewhere on the
 * page. Each version carries an "Optimized" badge so it's visually distinct
 * from the base resume while still reading as part of the same entry.
 */
function ResumeLibraryEntry({
  resume,
  selected,
  onSelect,
}: {
  resume: Resume;
  selected: boolean;
  onSelect: () => void;
}) {
  const { data: versions = [] } = useResumeVersionsList(resume.id);
  const optimizedVersions = versions.filter((v) => v.source === "optimizer");

  return (
    <div className="space-y-1.5">
      <ResumeListItem resume={resume} selected={selected} onSelect={onSelect} />
      {optimizedVersions.length > 0 && (
        <div className="ml-4 space-y-1.5 border-l-2 border-black/5 pl-3">
          {optimizedVersions.map((v) => (
            <VersionRow key={v.id} version={v} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Defensively read a version's stored optimizer change record (may be absent/legacy). */
function readOptimizationRecord(version: ResumeVersion): OptimizationRecord | null {
  const raw = version.optimization;
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Partial<OptimizationRecord>;
  if (!Array.isArray(rec.changes)) return null;
  return rec as OptimizationRecord;
}

function VersionRow({ version }: { version: ResumeVersion }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const record = readOptimizationRecord(version);

  async function handleDownload(format: DownloadFormat) {
    try {
      const doc = parseResumeText(version.content);
      await downloadResume(doc, version.name ?? "resume", format);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed.");
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-black/5 bg-white px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-medium text-[oklch(0.3_0.02_265)]">
            <span className="truncate">{version.name ?? `Version ${version.version_number}`}</span>
            <Chip tone="purple" className="shrink-0">
              <Wand2 className="h-3 w-3" /> Optimized
            </Chip>
          </p>
          <p className="mt-0.5 text-[11px] text-[oklch(0.55_0.02_265)]">
            {new Date(version.created_at).toLocaleDateString()}
            {version.category ? ` · ${version.category}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {record && (
            <button
              onClick={() => setHistoryOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs font-medium text-[oklch(0.4_0.02_265)] transition-colors hover:border-[#7C3AED]/30 hover:text-[#7C3AED]"
            >
              <History className="h-3.5 w-3.5" /> Changes
            </button>
          )}
          <DownloadMenu onDownload={handleDownload} size="sm" />
        </div>
      </div>

      <VersionHistoryDialog
        open={historyOpen}
        versionName={version.name ?? `Version ${version.version_number}`}
        versionNumber={version.version_number}
        record={record}
        onClose={() => setHistoryOpen(false)}
      />
    </>
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
  const navigate = useNavigate();
  const contact = parsed?.structured?.contact;
  const ready = parseStatus === "ready";

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

      {ready && (
        <DashCard className="border-[#7C3AED]/15 bg-gradient-to-br from-[#2563EB]/[0.04] to-[#7C3AED]/[0.06]">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/70 text-[#7C3AED]">
              <Wand2 className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-semibold text-[oklch(0.22_0.02_265)]">
                Optimize this resume
              </p>
              <p className="mt-0.5 text-xs text-[oklch(0.45_0.02_265)]">
                Review AI suggestions and save an improved version. You keep control of every
                change.
              </p>
              <button
                onClick={() =>
                  void navigate({
                    to: "/dashboard/resumes/$resumeId/optimize",
                    params: { resumeId },
                  })
                }
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-3.5 py-2 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgba(37,99,235,0.6)] transition-all hover:-translate-y-px"
              >
                <Sparkles className="h-4 w-4" /> Optimize resume
              </button>
            </div>
          </div>
        </DashCard>
      )}

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
