import { useState } from "react";
import { X, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { useImportJob } from "@/features/jobs/hooks";
import { detectJobSource } from "@/features/jobs/source-detection";

type Props = {
  open: boolean;
  onClose: () => void;
};

const inputClass =
  "h-9 w-full rounded-lg border border-black/5 bg-white px-3 text-sm text-[oklch(0.2_0.02_265)] placeholder:text-[oklch(0.6_0.02_265)] focus:border-[#2563EB]/40 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-colors";

const labelClass = "mb-1 block text-xs font-medium text-[oklch(0.4_0.02_265)]";

const emptyForm = { url: "", title: "", company: "", description: "", location: "" };

/**
 * ImportJobDialog — the dashboard half of the Module 4A manual-URL import
 * foundation. Deliberately minimal: URL + a few identity fields flow through
 * ManualImportService → the shared `upsert_global_job` RPC (same write path and
 * dedup as extension capture). The source is auto-detected from the URL. This
 * is additive — it does not change the existing Jobs UI.
 */
export function ImportJobDialog({ open, onClose }: Props) {
  const [form, setForm] = useState(emptyForm);
  const importJob = useImportJob();

  if (!open) return null;

  const detectedSource = form.url.trim() ? detectJobSource(form.url.trim()) : null;
  const isValid =
    form.url.trim().length > 0 &&
    form.title.trim().length > 0 &&
    form.company.trim().length > 0 &&
    form.description.trim().length > 0;

  const handleClose = () => {
    if (importJob.isPending) return;
    setForm(emptyForm);
    onClose();
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid || importJob.isPending) return;

    importJob.mutate(
      {
        url: form.url.trim(),
        title: form.title.trim(),
        company: form.company.trim(),
        description: form.description.trim(),
        location: form.location.trim() || undefined,
      },
      {
        onSuccess: (job) => {
          toast.success(`Imported ${job.role} at ${job.company_name}.`);
          setForm(emptyForm);
          onClose();
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Failed to import job.");
        },
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-job-title"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={handleClose}
      />

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)] animate-in slide-in-from-bottom-4 duration-300">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" />

        <div className="max-h-[85vh] overflow-y-auto p-6">
          <button
            onClick={handleClose}
            disabled={importJob.isPending}
            aria-label="Close"
            className="absolute right-4 top-5 grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.55_0.02_265)] hover:bg-black/[0.05] transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>

          <h2
            id="import-job-title"
            className="font-display text-base font-semibold text-[oklch(0.2_0.02_265)]"
          >
            Import a job by URL
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste a job link and a few details. We&apos;ll add it to your global board and
            de-duplicate it automatically.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
            <div>
              <label className={labelClass} htmlFor="import-url">
                Job URL
              </label>
              <input
                id="import-url"
                type="url"
                required
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://…"
                className={inputClass}
              />
              {detectedSource && (
                <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)]">
                  Detected source: <span className="font-medium">{detectedSource}</span>
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="import-title">
                  Title
                </label>
                <input
                  id="import-title"
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Software Engineer"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="import-company">
                  Company
                </label>
                <input
                  id="import-company"
                  type="text"
                  required
                  value={form.company}
                  onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                  placeholder="Acme Inc."
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="import-location">
                Location <span className="text-[oklch(0.6_0.02_265)]">(optional)</span>
              </label>
              <input
                id="import-location"
                type="text"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Remote"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="import-description">
                Description
              </label>
              <textarea
                id="import-description"
                required
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={4}
                placeholder="Paste the job description…"
                className="w-full resize-none rounded-lg border border-black/5 bg-white px-3 py-2 text-sm text-[oklch(0.2_0.02_265)] placeholder:text-[oklch(0.6_0.02_265)] focus:border-[#2563EB]/40 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={!isValid || importJob.isPending}
              className="relative inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] py-3 text-sm font-semibold text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25),0_6px_20px_-8px_rgba(37,99,235,0.7)] transition-all hover:-translate-y-px disabled:opacity-70 disabled:cursor-not-allowed disabled:translate-y-0"
            >
              {importJob.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Import job
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
