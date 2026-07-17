import { useState } from "react";
import { Plus, Pencil, Trash2, Mail, Linkedin, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Chip } from "@/components/dashboard/primitives";
import {
  useContacts,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
} from "@/features/applications/hooks/contacts";
import type { ApplicationContact, ApplicationContactType } from "@/types";
import { cn } from "@/lib/utils";

const CONTACT_TYPE_LABELS: Record<ApplicationContactType, string> = {
  recruiter: "Recruiter",
  hiring_manager: "Hiring Manager",
  referral: "Referral",
};

const CONTACT_TYPE_OPTIONS = Object.keys(CONTACT_TYPE_LABELS) as ApplicationContactType[];

const inputClass =
  "h-9 w-full rounded-lg border border-black/5 bg-white px-3 text-sm text-[oklch(0.2_0.02_265)] placeholder:text-[oklch(0.6_0.02_265)] focus:border-[#2563EB]/40 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-colors";
const labelClass = "mb-1 block text-xs font-medium text-[oklch(0.4_0.02_265)]";

type FormState = {
  type: ApplicationContactType;
  name: string;
  email: string;
  linkedin_url: string;
  notes: string;
};

const emptyForm: FormState = { type: "recruiter", name: "", email: "", linkedin_url: "", notes: "" };

function ContactFormDialog({
  applicationId,
  editing,
  onClose,
}: {
  applicationId: string;
  editing: ApplicationContact | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    editing
      ? {
          type: editing.type,
          name: editing.name,
          email: editing.email ?? "",
          linkedin_url: editing.linkedin_url ?? "",
          notes: editing.notes ?? "",
        }
      : emptyForm,
  );
  const createContact = useCreateContact(applicationId);
  const updateContact = useUpdateContact(applicationId);
  const isPending = createContact.isPending || updateContact.isPending;
  const isValid = form.name.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isPending) return;

    const payload = {
      type: form.type,
      name: form.name.trim(),
      email: form.email.trim() || null,
      linkedin_url: form.linkedin_url.trim() || null,
      notes: form.notes.trim() || null,
    };

    if (editing) {
      updateContact.mutate(
        { id: editing.id, updates: payload },
        {
          onSuccess: () => {
            toast.success("Contact updated.");
            onClose();
          },
          onError: () => toast.error("Failed to update contact."),
        },
      );
    } else {
      createContact.mutate(payload, {
        onSuccess: () => {
          toast.success("Contact added.");
          onClose();
        },
        onError: () => toast.error("Failed to add contact."),
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)] animate-in slide-in-from-bottom-4 duration-300">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" />
        <div className="p-6">
          <button
            onClick={onClose}
            disabled={isPending}
            aria-label="Close"
            className="absolute right-4 top-5 grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.55_0.02_265)] hover:bg-black/[0.05] transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>

          <h2 className="font-display text-base font-semibold text-[oklch(0.2_0.02_265)]">
            {editing ? "Edit Contact" : "Add Contact"}
          </h2>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="contact-type">Type</label>
                <select
                  id="contact-type"
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as ApplicationContactType }))}
                  className={inputClass}
                >
                  {CONTACT_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>{CONTACT_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="contact-name">Name</label>
                <input
                  id="contact-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Jane Doe"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="contact-email">Email <span className="text-[oklch(0.6_0.02_265)]">(optional)</span></label>
              <input
                id="contact-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="jane@company.com"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="contact-linkedin">LinkedIn URL <span className="text-[oklch(0.6_0.02_265)]">(optional)</span></label>
              <input
                id="contact-linkedin"
                type="url"
                value={form.linkedin_url}
                onChange={(e) => setForm((f) => ({ ...f, linkedin_url: e.target.value }))}
                placeholder="https://linkedin.com/in/…"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="contact-notes">Notes <span className="text-[oklch(0.6_0.02_265)]">(optional)</span></label>
              <textarea
                id="contact-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="w-full resize-none rounded-lg border border-black/5 bg-white px-3 py-2 text-sm text-[oklch(0.2_0.02_265)] placeholder:text-[oklch(0.6_0.02_265)] focus:border-[#2563EB]/40 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={!isValid || isPending}
              className="relative inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] py-2.5 text-sm font-semibold text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25),0_6px_20px_-8px_rgba(37,99,235,0.7)] transition-all hover:-translate-y-px disabled:opacity-70 disabled:cursor-not-allowed disabled:translate-y-0"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Save Changes" : "Add Contact"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const CONTACT_TONE: Record<ApplicationContactType, "blue" | "purple" | "green"> = {
  recruiter: "blue",
  hiring_manager: "purple",
  referral: "green",
};

export function ApplicationContacts({ applicationId }: { applicationId: string }) {
  const { data: contacts = [], isLoading } = useContacts(applicationId);
  const deleteContact = useDeleteContact(applicationId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ApplicationContact | null>(null);

  const openAdd = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (c: ApplicationContact) => { setEditing(c); setDialogOpen(true); };
  const closeDialog = () => setDialogOpen(false);

  const handleDelete = (id: string) => {
    deleteContact.mutate(
      { id },
      {
        onSuccess: () => toast.success("Contact removed."),
        onError: () => toast.error("Failed to remove contact."),
      },
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-[oklch(0.55_0.02_265)]">
          Recruiters, hiring managers, and referrals for this application.
        </p>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-medium text-[#2563EB] hover:bg-[#2563EB]/5 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {isLoading ? (
          <div className="flex items-center gap-2 py-3 text-xs text-[oklch(0.5_0.02_265)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading contacts…
          </div>
        ) : contacts.length === 0 ? (
          <p className="py-2 text-xs text-[oklch(0.55_0.02_265)]">No contacts added yet.</p>
        ) : (
          contacts.map((c) => (
            <div
              key={c.id}
              className="group flex items-start gap-3 rounded-xl border border-black/5 bg-white p-3 hover:bg-[oklch(0.99_0.005_265)] transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-medium text-[oklch(0.2_0.02_265)]">{c.name}</p>
                  <Chip tone={CONTACT_TONE[c.type]}>{CONTACT_TYPE_LABELS[c.type]}</Chip>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-[oklch(0.5_0.02_265)]">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-[#2563EB]">
                      <Mail className="h-3 w-3" /> {c.email}
                    </a>
                  )}
                  {c.linkedin_url && (
                    <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-[#2563EB]">
                      <Linkedin className="h-3 w-3" /> LinkedIn
                    </a>
                  )}
                </div>
                {c.notes && <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)]">{c.notes}</p>}
              </div>
              <div className={cn("flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100")}>
                <button
                  onClick={() => openEdit(c)}
                  aria-label="Edit contact"
                  className="grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.5_0.02_265)] hover:bg-black/[0.05] hover:text-[oklch(0.2_0.02_265)] transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(c.id)}
                  aria-label="Delete contact"
                  className="grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.5_0.02_265)] hover:bg-rose-50 hover:text-rose-600 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {dialogOpen && (
        <ContactFormDialog applicationId={applicationId} editing={editing} onClose={closeDialog} />
      )}
    </div>
  );
}
