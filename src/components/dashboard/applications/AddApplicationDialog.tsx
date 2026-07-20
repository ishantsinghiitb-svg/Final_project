import { useState } from "react";
import { X, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useCreateManualApplication } from "@/features/applications/hooks";
import { ALL_STATUSES, STATUS_META } from "@/features/applications/constants";
import type { ManualApplicationInput } from "@/features/applications/types";
import type { ApplicationStatus } from "@/types";

type Props = {
  open: boolean;
  onClose: () => void;
};

const inputClass =
  "h-9 w-full rounded-lg border border-black/5 bg-white px-3 text-sm text-[oklch(0.2_0.02_265)] placeholder:text-[oklch(0.6_0.02_265)] focus:border-[#2563EB]/40 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-colors";

const labelClass = "mb-1 block text-xs font-medium text-[oklch(0.4_0.02_265)]";

const emptyForm = {
  company_name: "",
  role: "",
  status: "applied" as ApplicationStatus,
  location: "",
  url: "",
  salary: "",
  notes: "",
};

/**
 * AddApplicationDialog
 *
 * "+ Add Application" — manual entry for applications tracked outside the
 * Global Job Board / LinkedIn extension flows. If a matching GlobalJob
 * exists it's reused server-side (see ApplicationService.createManual);
 * otherwise the application is created with just the entered fields.
 */
export function AddApplicationDialog({ open, onClose }: Props) {
  const [form, setForm] = useState(emptyForm);
  const createManual = useCreateManualApplication();

  if (!open) return null;

  const isValid = form.company_name.trim().length > 0 && form.role.trim().length > 0;

  const handleClose = () => {
    if (createManual.isPending) return;
    setForm(emptyForm);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || createManual.isPending) return;

    const input: ManualApplicationInput = {
      company_name: form.company_name.trim(),
      role: form.role.trim(),
      status: form.status,
      location: form.location.trim() || undefined,
      url: form.url.trim() || undefined,
      salary: form.salary.trim() ? Number(form.salary) : undefined,
      notes: form.notes.trim() || undefined,
    };

    createManual.mutate(input, {
      onSuccess: () => {
        toast.success(`Added ${input.role} at ${input.company_name}.`);
        setForm(emptyForm);
        onClose();
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "Failed to add application.");
      },
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-application-title"
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
            disabled={createManual.isPending}
            aria-label="Close"
            className="absolute right-4 top-5 grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.55_0.02_265)] hover:bg-black/[0.05] transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>

          <h2
            id="add-application-title"
            className="font-display text-base font-semibold text-[oklch(0.2_0.02_265)]"
          >
            Add Application
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Track an application you made outside NextOffer.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="add-app-company">
                  Company
                </label>
                <input
                  id="add-app-company"
                  type="text"
                  required
                  value={form.company_name}
                  onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                  placeholder="Acme Inc."
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="add-app-role">
                  Role
                </label>
                <input
                  id="add-app-role"
                  type="text"
                  required
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  placeholder="Software Engineer"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="add-app-status">
                  Status
                </label>
                <select
                  id="add-app-status"
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as ApplicationStatus }))
                  }
                  className={inputClass}
                >
                  {ALL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_META[s].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="add-app-location">
                  Location
                </label>
                <input
                  id="add-app-location"
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="Remote"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="add-app-url">
                Job URL <span className="text-[oklch(0.6_0.02_265)]">(optional)</span>
              </label>
              <input
                id="add-app-url"
                type="url"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://…"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="add-app-salary">
                Salary <span className="text-[oklch(0.6_0.02_265)]">(optional)</span>
              </label>
              <input
                id="add-app-salary"
                type="number"
                min={0}
                value={form.salary}
                onChange={(e) => setForm((f) => ({ ...f, salary: e.target.value }))}
                placeholder="120000"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="add-app-notes">
                Notes <span className="text-[oklch(0.6_0.02_265)]">(optional)</span>
              </label>
              <textarea
                id="add-app-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                placeholder="Anything worth remembering…"
                className="w-full resize-none rounded-lg border border-black/5 bg-white px-3 py-2 text-sm text-[oklch(0.2_0.02_265)] placeholder:text-[oklch(0.6_0.02_265)] focus:border-[#2563EB]/40 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={!isValid || createManual.isPending}
              className="relative inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] py-2.5 text-sm font-semibold text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25),0_6px_20px_-8px_rgba(37,99,235,0.7)] transition-all hover:-translate-y-px disabled:opacity-70 disabled:cursor-not-allowed disabled:translate-y-0"
            >
              {createManual.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Adding…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add Application
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
