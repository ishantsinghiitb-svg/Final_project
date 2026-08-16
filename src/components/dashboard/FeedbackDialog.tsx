import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { X, Loader2, Send, Bug, Lightbulb, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSubmitFeedback } from "@/features/feedback/hooks";
import type { FeedbackCategory } from "@/types";

// ── FeedbackDialog (Module 13 · Phase 3) ──
//
// A single persisted "report a problem / suggest something" path, reachable
// from anywhere in the dashboard. Complements src/content/contact.ts's
// mailto flow rather than replacing it — that stays for anything the user
// wants a reply to; this is a lightweight one-way note the founder reviews
// directly in Supabase (no admin UI, out of scope for this task).

type Props = {
  open: boolean;
  onClose: () => void;
};

const CATEGORIES: { value: FeedbackCategory; label: string; icon: typeof Bug }[] = [
  { value: "bug", label: "Report a bug", icon: Bug },
  { value: "idea", label: "Suggest something", icon: Lightbulb },
  { value: "other", label: "Something else", icon: MessageSquare },
];

const MAX_LENGTH = 4000;

export function FeedbackDialog({ open, onClose }: Props) {
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [message, setMessage] = useState("");
  const submitFeedback = useSubmitFeedback();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!open) return null;

  const isValid = message.trim().length > 0 && message.trim().length <= MAX_LENGTH;

  const handleClose = () => {
    if (submitFeedback.isPending) return;
    setCategory("bug");
    setMessage("");
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitFeedback.isPending) return;

    submitFeedback.mutate(
      { category, message: message.trim(), pagePath: pathname },
      {
        onSuccess: () => {
          toast.success("Thanks — we read every note.");
          setCategory("bug");
          setMessage("");
          onClose();
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Failed to send feedback.");
        },
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-dialog-title"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={handleClose}
      />

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)] animate-in slide-in-from-bottom-4 duration-300">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" />

        <form onSubmit={handleSubmit} className="max-h-[85vh] overflow-y-auto p-6">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitFeedback.isPending}
            aria-label="Close"
            className="absolute right-4 top-5 grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.55_0.02_265)] hover:bg-black/[0.05] transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>

          <h2
            id="feedback-dialog-title"
            className="font-display text-base font-semibold text-[oklch(0.2_0.02_265)]"
          >
            Send feedback
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tell us what's broken or what you'd like to see. We read every one.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {CATEGORIES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setCategory(value)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center text-xs font-medium transition-colors",
                  category === value
                    ? "border-[#2563EB]/30 bg-[#2563EB]/[0.06] text-[#2563EB]"
                    : "border-black/5 bg-white text-[oklch(0.45_0.02_265)] hover:bg-black/[0.03]",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            <label
              htmlFor="feedback-message"
              className="mb-1 block text-xs font-medium text-[oklch(0.4_0.02_265)]"
            >
              What's on your mind?
            </label>
            <textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={MAX_LENGTH}
              placeholder="The more detail, the faster we can act on it…"
              className="w-full resize-none rounded-lg border border-black/5 bg-white px-3 py-2 text-sm text-[oklch(0.2_0.02_265)] placeholder:text-[oklch(0.6_0.02_265)] focus:border-[#2563EB]/40 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-colors"
            />
            <p className="mt-1 text-right text-[10px] text-[oklch(0.6_0.02_265)]">
              {message.length}/{MAX_LENGTH}
            </p>
          </div>

          <button
            type="submit"
            disabled={!isValid || submitFeedback.isPending}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgba(37,99,235,0.6)] transition-all hover:-translate-y-px hover:shadow-[0_6px_20px_-4px_rgba(37,99,235,0.7)] disabled:opacity-70 disabled:cursor-not-allowed disabled:translate-y-0"
          >
            {submitFeedback.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send feedback
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
