import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DashCard, SectionTitle } from "@/components/dashboard/primitives";
import { useAuth } from "@/context/AuthContext";
import { useDeleteAccount } from "@/features/account/hooks";

// ── Delete account (production audit B6) ──
//
// Deliberately the app's only truly irreversible action, so it gets a
// heavier confirmation than the plain window.confirm() used for a resume
// delete: the dialog stays disabled until the user types the exact
// confirmation phrase, not just a click. On success there is nothing left to
// invalidate or navigate away FROM gracefully — the account is gone, so this
// signs out locally and sends the browser to the homepage.

const CONFIRM_PHRASE = "DELETE MY ACCOUNT";

export function DeleteAccountCard() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const deleteAccount = useDeleteAccount();
  const [confirmText, setConfirmText] = useState("");
  const [open, setOpen] = useState(false);

  const canConfirm = confirmText.trim() === CONFIRM_PHRASE;

  async function handleConfirm() {
    const result = await deleteAccount.mutateAsync();
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setOpen(false);
    await signOut();
    toast.success("Your account and all associated data have been deleted.");
    navigate({ to: "/" });
  }

  return (
    <DashCard className="border-rose-200">
      <SectionTitle>Danger zone</SectionTitle>
      <p className="mt-2 text-sm text-[oklch(0.5_0.02_265)]">
        Permanently delete your account and everything associated with it — applications, resumes,
        saved jobs, interviews, Gmail/Calendar connections, and any AI usage history. This cannot be
        undone.
      </p>

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setConfirmText("");
        }}
      >
        <AlertDialogTrigger asChild>
          <button
            type="button"
            className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[13px] font-medium text-rose-600 transition-colors hover:bg-rose-100"
          >
            Delete account
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account permanently?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This deletes your account and every piece of data tied to it — applications,
                  resumes and their stored files, saved and collected jobs, interviews, Gmail and
                  Calendar connections and synced data, suggestions, and AI usage history. There is
                  no undo.
                </p>
                <p>
                  Type <span className="font-mono font-semibold text-foreground">{CONFIRM_PHRASE}</span>{" "}
                  below to confirm.
                </p>
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={CONFIRM_PHRASE}
                  className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
                  autoComplete="off"
                  aria-label="Type DELETE MY ACCOUNT to confirm"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAccount.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canConfirm || deleteAccount.isPending}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirm();
              }}
              className={cn(buttonVariants({ variant: "destructive" }))}
            >
              {deleteAccount.isPending ? "Deleting…" : "Delete my account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashCard>
  );
}
