import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  X,
  Loader2,
  ExternalLink,
  Paperclip,
  Download,
  Building2,
  User,
  CalendarClock,
  AlarmClock,
  Link2,
  AlertCircle,
} from "lucide-react";
import { Chip } from "@/components/dashboard/primitives";
import { useDialogA11y } from "@/hooks/useDialogA11y";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { fetchGmailMessageBody, fetchGmailAttachmentBytes } from "@/server-functions/gmail";
import { gmailDeepLink } from "@/features/gmail/utils";
import { readSuggestionSummary, confidenceTier, relativeDay } from "@/features/gmail/summary";
import {
  isHighlightLine,
  attachmentKind,
  attachmentKindLabel,
  formatBytes,
} from "@/features/gmail/preview";
import type { GmailSuggestionListItem } from "@/repositories/GmailRepository";

// ── ReviewPanel (Module 9A) ──
//
// "The user should never have to leave NextOffer to understand an email."
// The old Review surface was a small centred dialog showing only the edit
// form — enough to accept a suggestion, not enough to decide whether to. This
// is a full side panel: extracted facts at the top, then the real email body,
// its links and attachments, then the actions.
//
// The body is fetched live rather than read from the DB: gmail_messages
// stores only Gmail's short snippet by design (the module never persists
// email content), so the panel calls fetchGmailMessageBody on open. That
// keeps the privacy model intact — content is shown, never stored — at the
// cost of one request per opened email, which is why it's keyed and cached
// by react-query rather than refetched on every render.
//
// The body renders as TEXT, never HTML. A recruiter's email is untrusted
// input; rendering its markup would put arbitrary sender-controlled content
// into the dashboard's DOM.

type Props = {
  suggestion: GmailSuggestionListItem;
  googleEmail: string | null;
  onClose: () => void;
  onAccept: () => void;
  onEdit: () => void;
  onDismiss: () => void;
  busy: boolean;
};

export function ReviewPanel({
  suggestion,
  googleEmail,
  onClose,
  onAccept,
  onEdit,
  onDismiss,
  busy,
}: Props) {
  const { session } = useAuth();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleClose = () => {
    if (busy) return;
    onClose();
  };
  const panelRef = useDialogA11y<HTMLDivElement>(true, handleClose);

  const summary = readSuggestionSummary(suggestion);
  const tier = confidenceTier(suggestion.confidence);

  const bodyQuery = useQuery({
    queryKey: ["gmail", "message-body", suggestion.gmail_message_id],
    queryFn: () =>
      fetchGmailMessageBody({
        data: {
          accessToken: session?.access_token ?? "",
          gmailMessageRowId: suggestion.gmail_message_id,
        },
      }),
    enabled: Boolean(session?.access_token),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const body = bodyQuery.data?.ok ? bodyQuery.data.body : null;
  const bodyError = bodyQuery.data && !bodyQuery.data.ok ? bodyQuery.data.message : null;

  /**
   * Downloads an attachment without leaving NextOffer. Bytes are fetched
   * through the same accept-time server function (they're never stored), then
   * handed to the browser via a temporary object URL — revoked immediately so
   * the blob doesn't leak for the life of the page.
   */
  async function handleDownload(attachment: {
    gmailAttachmentId: string;
    filename: string;
    mimeType: string;
  }) {
    if (!session?.access_token) return;
    setDownloadingId(attachment.gmailAttachmentId);
    try {
      const result = await fetchGmailAttachmentBytes({
        data: {
          accessToken: session.access_token,
          gmailMessageRowId: suggestion.gmail_message_id,
          gmailAttachmentId: attachment.gmailAttachmentId,
        },
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      const binary = atob(result.base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: attachment.mimeType || "application/octet-stream" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Couldn't download that attachment.");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={handleClose}
      />
      <div
        ref={panelRef}
        className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-black/5 bg-white shadow-[0_0_60px_-10px_rgba(0,0,0,0.3)] animate-in slide-in-from-right duration-300"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-black/5 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base font-semibold text-[oklch(0.2_0.02_265)]">
                {summary?.headline ?? "Review suggestion"}
              </h2>
              <Chip tone={tier.tone}>{tier.display}</Chip>
            </div>
            {summary?.reason && (
              <p className="mt-1 text-sm text-[oklch(0.45_0.02_265)]">{summary.reason}</p>
            )}
            {summary?.action && (
              <p className="mt-1.5 text-sm">
                <span className="font-medium text-[#B45309]">Action required: </span>
                <span className="text-[oklch(0.35_0.02_265)]">{summary.action}</span>
              </p>
            )}
          </div>
          <button
            onClick={handleClose}
            disabled={busy}
            aria-label="Close"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[oklch(0.55_0.02_265)] hover:bg-black/[0.05] disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Extracted facts */}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
            <Fact
              icon={Building2}
              label="Company"
              value={summary?.company ?? suggestion.company_name}
            />
            <Fact icon={Paperclip} label="Role" value={summary?.role} />
            <Fact icon={User} label="Recruiter" value={summary?.recruiter} />
            <Fact icon={User} label="From" value={body?.fromAddress ?? suggestion.fromAddress} />
            <Fact
              icon={CalendarClock}
              label="Received"
              value={summary?.receivedAtIso ? relativeDay(summary.receivedAtIso) : null}
            />
            <Fact
              icon={AlarmClock}
              label="Classification"
              value={suggestion.category.replace(/_/g, " ")}
            />
          </dl>

          {/* The per-suggestion confidence evidence ("Detected because…") is
              deliberately NOT rendered. It's a classifier-debugging aid, and
              for someone triaging their job search it's noise competing with
              the email itself. The evidence is still generated and stored on
              every suggestion (summary.confidenceReasons) — it simply has no
              UI, so the intelligence stays available without spending screen
              space on it. The confidence tier in the header is the part that
              actually informs a decision. */}

          {/* Email preview */}
          <div className="mt-5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[oklch(0.5_0.02_265)]">
                Original email
              </p>
              {googleEmail && suggestion.externalMessageId && (
                <a
                  href={gmailDeepLink(googleEmail, suggestion.externalMessageId)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] hover:underline"
                >
                  Open in Gmail <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {suggestion.subject && (
              <p className="mt-1.5 text-sm font-medium text-[oklch(0.25_0.02_265)]">
                {suggestion.subject}
              </p>
            )}

            <div className="mt-2 rounded-xl border border-black/5 bg-black/[0.012] px-3.5 py-3">
              {bodyQuery.isLoading ? (
                <p className="flex items-center gap-2 text-xs text-[oklch(0.55_0.02_265)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading email…
                </p>
              ) : bodyError || bodyQuery.isError ? (
                <p className="flex items-start gap-1.5 text-xs text-[#B45309]">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {bodyError ?? "Couldn't load this email from Gmail."} You can still open it in
                  Gmail above.
                </p>
              ) : body ? (
                <div className="space-y-1">
                  {body.bodyText.split("\n").map((line, i) =>
                    line.trim().length === 0 ? (
                      <div key={i} className="h-2" />
                    ) : (
                      <p
                        key={i}
                        className={
                          isHighlightLine(line)
                            ? "rounded bg-[#F59E0B]/10 px-1.5 py-0.5 text-xs font-medium text-[oklch(0.25_0.02_265)]"
                            : "text-xs leading-relaxed text-[oklch(0.4_0.02_265)]"
                        }
                      >
                        {line}
                      </p>
                    ),
                  )}
                </div>
              ) : (
                <p className="text-xs text-[oklch(0.55_0.02_265)]">
                  {suggestion.subject ? "No preview available." : "Nothing to preview."}
                </p>
              )}
            </div>
          </div>

          {/* Links */}
          {body && body.links.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[oklch(0.5_0.02_265)]">
                Links in this email
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {body.links.map((l) => (
                  <a
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1 text-xs font-medium text-[#2563EB] hover:bg-black/[0.02]"
                  >
                    <Link2 className="h-3 w-3" />
                    {l.label}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Attachments */}
          {body && body.attachments.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[oklch(0.5_0.02_265)]">
                Attachments
              </p>
              <div className="mt-1.5 space-y-1.5">
                {body.attachments.map((a) => {
                  const kind = attachmentKind(a.filename, a.mimeType);
                  return (
                    <div
                      key={a.gmailAttachmentId}
                      className="flex items-center gap-2.5 rounded-lg border border-black/5 px-3 py-2"
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-[oklch(0.55_0.02_265)]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-[oklch(0.25_0.02_265)]">
                          {a.filename}
                        </p>
                        <p className="text-[11px] text-[oklch(0.55_0.02_265)]">
                          {attachmentKindLabel(kind)}
                          {formatBytes(a.size) && ` · ${formatBytes(a.size)}`}
                        </p>
                      </div>
                      <button
                        onClick={() => void handleDownload(a)}
                        disabled={downloadingId === a.gmailAttachmentId}
                        title={`Download ${a.filename}`}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-[#2563EB] hover:bg-black/[0.03] disabled:opacity-50"
                      >
                        {downloadingId === a.gmailAttachmentId ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Download className="h-3 w-3" />
                        )}
                        Download
                      </button>
                    </div>
                  );
                })}
              </div>
              {suggestion.type === "import_attachment" && (
                <p className="mt-1.5 text-[11px] text-[oklch(0.55_0.02_265)]">
                  Accepting this suggestion saves the attachment to the linked application.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t border-black/5 px-5 py-4">
          <button
            onClick={onDismiss}
            disabled={busy}
            className="rounded-xl border border-black/5 bg-white px-3.5 py-2.5 text-sm font-medium text-[oklch(0.45_0.02_265)] hover:bg-black/[0.03] disabled:opacity-50"
          >
            Dismiss
          </button>
          <button
            onClick={onEdit}
            disabled={busy}
            className="rounded-xl border border-black/5 bg-white px-3.5 py-2.5 text-sm font-medium text-[oklch(0.3_0.02_265)] hover:bg-black/[0.03] disabled:opacity-50"
          >
            Edit…
          </button>
          <button
            onClick={onAccept}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] py-2.5 text-sm font-semibold text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25),0_6px_20px_-8px_rgba(37,99,235,0.7)] disabled:opacity-70"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Adding…
              </>
            ) : (
              // Wording only — this still runs the exact same resolve/accept
              // path (GmailService.resolveSuggestion with action "accept").
              // "Add Application" says what actually happens; "Accept" left
              // people guessing what they were accepting.
              "Add Application"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <>
      <dt className="flex items-center gap-1.5 text-xs text-[oklch(0.55_0.02_265)]">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </dt>
      <dd className="text-sm capitalize text-[oklch(0.25_0.02_265)]">{value}</dd>
    </>
  );
}
