import { useEffect, useRef, useState } from "react";
import { FileText, Star, MoreVertical, Pencil, Download, Trash2, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Chip } from "@/components/dashboard/primitives";
import { cn } from "@/lib/utils";
import { RESUME_PARSE_STATUS_LABELS } from "@/constants";
import { useSetDefaultResume, useDeleteResume, useRenameResume } from "@/features/resumes/hooks";
import { resumeService } from "@/services/ResumeService";
import type { Resume } from "@/types";
import { toast } from "sonner";

// Actions menu, rename, and delete all follow the same lightweight pattern
// used elsewhere in the dashboard (see ApplicationCard's ⋮ menu and the
// collections page's window.confirm delete) — no Radix Dialog/AlertDialog/
// DropdownMenu, which render with this app's dark theme tokens by default.

function statusTone(status: string | undefined): "green" | "blue" | "rose" | "default" {
  if (status === "ready") return "green";
  if (status === "processing" || status === "pending") return "blue";
  if (status === "failed") return "rose";
  return "default";
}

export function ResumeListItem({
  resume,
  selected,
  onSelect,
}: {
  resume: Resume;
  selected: boolean;
  onSelect: () => void;
}) {
  const setDefault = useSetDefaultResume();
  const del = useDeleteResume();
  const rename = useRenameResume();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(resume.name);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  function startRename() {
    setRenameValue(resume.name);
    setIsRenaming(true);
    setMenuOpen(false);
  }

  function commitRename() {
    const next = renameValue.trim();
    setIsRenaming(false);
    if (!next || next === resume.name) return;
    rename.mutate(
      { id: resume.id, name: next },
      { onError: () => toast.error("Could not rename resume.") },
    );
  }

  async function download() {
    setMenuOpen(false);
    if (!resume.file_url) {
      toast.error("No file to download.");
      return;
    }
    setDownloading(true);
    try {
      const url = await resumeService.getDownloadUrl(resume.file_url);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Could not open the file.");
    } finally {
      setDownloading(false);
    }
  }

  function handleDelete() {
    setMenuOpen(false);
    if (
      !window.confirm(
        `Delete "${resume.name}"? This removes its file and parsed data. This cannot be undone.`,
      )
    ) {
      return;
    }
    del.mutate(resume.id, {
      onSuccess: () => toast.success("Resume deleted."),
      onError: () => toast.error("Could not delete resume."),
    });
  }

  return (
    <div
      onClick={isRenaming ? undefined : onSelect}
      className={cn(
        "group relative rounded-2xl border bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all",
        isRenaming ? "cursor-default" : "cursor-pointer",
        selected
          ? "border-[#2563EB]/30 shadow-[0_2px_10px_-2px_rgba(37,99,235,0.18)] ring-1 ring-[#2563EB]/15"
          : "border-black/5 hover:border-black/10 hover:shadow-[0_2px_8px_rgba(0,0,0,0.07)]",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#2563EB]">
          <FileText className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          {isRenaming ? (
            <input
              autoFocus
              value={renameValue}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setIsRenaming(false);
              }}
              onBlur={commitRename}
              className="h-7 w-full rounded-md border border-[#2563EB]/40 bg-white px-2 text-sm font-semibold text-[oklch(0.2_0.02_265)] outline-none ring-2 ring-[#2563EB]/10"
            />
          ) : (
            <div className="flex items-center gap-2">
              <p className="truncate font-display font-semibold text-[oklch(0.2_0.02_265)]">
                {resume.name}
              </p>
              {resume.is_default && (
                <Chip tone="amber" className="shrink-0">
                  <Star className="h-3 w-3 fill-current" /> Default
                </Chip>
              )}
            </div>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[oklch(0.5_0.02_265)]">
            <Chip tone={statusTone(resume.parse_status)}>
              {RESUME_PARSE_STATUS_LABELS[resume.parse_status ?? "pending"] ?? "Pending"}
            </Chip>
            {resume.page_count != null && <span>{resume.page_count} pages</span>}
            {resume.file_size_bytes != null && (
              <span>{Math.round(resume.file_size_bytes / 1024)} KB</span>
            )}
            <span>Uploaded {format(parseISO(resume.created_at), "MMM d, yyyy")}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {!resume.is_default && (
            <button
              aria-label="Set as default"
              title="Set as default"
              className="grid h-8 w-8 place-items-center rounded-lg border border-black/5 bg-white text-[oklch(0.5_0.02_265)] opacity-0 transition-opacity hover:bg-black/[0.03] group-hover:opacity-100"
              onClick={() =>
                setDefault.mutate(resume.id, {
                  onSuccess: () => toast.success("Default resume updated."),
                })
              }
            >
              <Star className="h-3.5 w-3.5" />
            </button>
          )}

          <div ref={menuRef} className="relative">
            <button
              aria-label="More actions"
              onClick={() => setMenuOpen((o) => !o)}
              className={cn(
                "grid h-8 w-8 place-items-center rounded-lg border border-black/5 bg-white text-[oklch(0.5_0.02_265)] transition-opacity hover:bg-black/[0.03]",
                menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              )}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-9 z-20 w-48 overflow-hidden rounded-xl border border-black/5 bg-white p-1.5 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.2)]">
                <button
                  onClick={startRename}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-[oklch(0.35_0.02_265)] hover:bg-black/[0.04]"
                >
                  <Pencil className="h-3.5 w-3.5" /> Rename
                </button>
                <button
                  onClick={download}
                  disabled={downloading}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-[oklch(0.35_0.02_265)] hover:bg-black/[0.04] disabled:opacity-50"
                >
                  {downloading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  Download
                </button>
                <button
                  onClick={handleDelete}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
