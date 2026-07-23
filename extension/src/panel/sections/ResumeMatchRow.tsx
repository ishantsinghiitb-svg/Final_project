import { useRef, useState } from "react";
import type { ResumeMatchSummary, ResumeOption } from "../../shared/messaging/types";

type AnalyzeOutcome =
  | { ok: true; score: number; label: string; creditsRemaining: number }
  | { ok: false; code: string; message: string };

type UploadOutcome = { ok: true; resume: ResumeOption } | { ok: false; message: string };

/**
 * AI Job Match section (Module 6C) — resume selector + upload + credits +
 * analyze, all directly in the extension. No dashboard visit required to run
 * an analysis: "Analyze Match"/"Re-analyze" call straight through to
 * `/api/extension/analyze-match` (via the background worker), which reuses
 * `ResumeMatchService.analyzeResumeMatch` exactly — same engine, cache,
 * versioning, and AI-Credit accounting as the dashboard. "View Details"
 * remains a dashboard deep-link on purpose: the full breakdown
 * (whatMatches/whatToImprove/summary/history) is dashboard-only by design.
 *
 * Per-resume results are cached locally so switching back to a previously
 * selected resume restores the cached score instantly, with no round trip and
 * no AI call. The parent keys this component by job, so navigating to a
 * different job remounts it with fresh state.
 */
export function ResumeMatchRow({
  resumes,
  initialMatch,
  credits,
  onViewDetails,
  onAnalyze,
  onFetchMatch,
  onUploadResume,
}: {
  resumes: ResumeOption[];
  /** Cached match for `resumes[0]` (the default), supplied by the sync result. */
  initialMatch: ResumeMatchSummary | null;
  /** Remaining AI credits, or null when unknown. */
  credits: number | null;
  onViewDetails: (resumeId: string | null) => void;
  onAnalyze: (resumeId: string, forceRefresh: boolean) => Promise<AnalyzeOutcome>;
  onFetchMatch: (resumeId: string) => Promise<ResumeMatchSummary | null>;
  onUploadResume: (file: {
    name: string;
    type: string;
    bytes: ArrayBuffer;
  }) => Promise<UploadOutcome>;
}) {
  // Defensive: a CurrentJobState persisted by a PRE-update content script (read
  // from chrome.storage.session right after the extension updates, before the
  // next sync rewrites it) can lack `resumes`. Never let that stale shape crash
  // the panel — treat a missing list as empty.
  const options = resumes ?? [];
  const initialId = options[0]?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  // Cache of results this panel instance has itself fetched or produced —
  // switched-to resumes AND just-completed in-panel analyses, including of the
  // DEFAULT resume. Checked before `initialMatch` in the derivation below: an
  // analysis run just now is always the freshest truth, even for the default
  // resume, so it must win over the (now-stale) sync-time prop rather than the
  // other way around.
  const [cache, setCache] = useState<Record<string, ResumeMatchSummary | null>>({});
  const [switching, setSwitching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirmForce, setConfirmForce] = useState<boolean | null>(null); // null = no confirm shown
  const [errorText, setErrorText] = useState<string | null>(null);
  // Live-updated after a successful in-panel analyze so the balance reflects
  // immediately without waiting for the next sync.
  const [creditsOverride, setCreditsOverride] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const creditsRemaining = creditsOverride ?? credits;
  const outOfCredits = creditsRemaining !== null && creditsRemaining <= 0;
  const selectedResume = options.find((r) => r.id === selectedId) ?? null;
  const match: ResumeMatchSummary | null | undefined =
    selectedId !== null && selectedId in cache
      ? cache[selectedId]
      : selectedId === initialId
        ? initialMatch
        : undefined;
  const busy = switching || uploading || analyzing;

  async function handleSelect(id: string): Promise<void> {
    setErrorText(null);
    setConfirmForce(null);
    setSelectedId(id);
    if (id === initialId || id in cache) return; // instant — no round trip
    setSwitching(true);
    try {
      const result = await onFetchMatch(id);
      setCache((prev) => ({ ...prev, [id]: result }));
    } catch {
      setCache((prev) => ({ ...prev, [id]: null }));
    } finally {
      setSwitching(false);
    }
  }

  async function handleUploadChange(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setErrorText(null);
    setUploading(true);
    try {
      const bytes = await file.arrayBuffer();
      const result = await onUploadResume({ name: file.name, type: file.type, bytes });
      if (result.ok) {
        setSelectedId(result.resume.id);
      } else {
        setErrorText(result.message);
      }
    } catch {
      setErrorText("Couldn't upload that file. Try again.");
    } finally {
      setUploading(false);
    }
  }

  async function confirmAndAnalyze(): Promise<void> {
    if (!selectedId || confirmForce === null) return;
    const forceRefresh = confirmForce;
    setConfirmForce(null);
    setAnalyzing(true);
    setErrorText(null);
    try {
      const result = await onAnalyze(selectedId, forceRefresh);
      if (result.ok) {
        setCache((prev) => ({
          ...prev,
          [selectedId]: { score: result.score, label: result.label },
        }));
        setCreditsOverride(result.creditsRemaining);
      } else {
        setErrorText(result.message);
      }
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="nextoffer-panel__match">
      {options.length > 0 && (
        <div className="nextoffer-panel__match-resume">
          <span className="nextoffer-panel__match-resume-label">Resume</span>
          <select
            className="nextoffer-panel__match-select"
            value={selectedId ?? ""}
            onChange={(e) => void handleSelect(e.target.value)}
            disabled={busy}
            aria-label="Resume used for match"
          >
            {options.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.isDefault ? " (Default)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        style={{ display: "none" }}
        onChange={(e) => void handleUploadChange(e)}
      />
      <button
        className="nextoffer-panel__upload-btn"
        onClick={() => fileInputRef.current?.click()}
        disabled={busy}
      >
        {uploading ? "Uploading…" : "Upload Resume"}
      </button>

      <div className="nextoffer-panel__match-head">
        <span className="nextoffer-panel__match-title">AI Job Match</span>
      </div>
      <span className="nextoffer-panel__match-credits">
        AI Credits Remaining: {creditsRemaining ?? "—"}
      </span>

      {errorText && <span className="nextoffer-panel__match-error">{errorText}</span>}

      {switching ? (
        <span className="nextoffer-panel__match-hint">Checking…</span>
      ) : match ? (
        <>
          <span className="nextoffer-panel__match-score">{match.score}%</span>
          <span className="nextoffer-panel__match-label">{match.label}</span>
          <div className="nextoffer-panel__match-actions">
            <button
              className="nextoffer-panel__btn--secondary"
              onClick={() => onViewDetails(selectedId)}
              disabled={busy}
            >
              View Details
            </button>
            <button
              className="nextoffer-panel__btn--secondary"
              onClick={() => setConfirmForce(true)}
              disabled={busy || outOfCredits || !selectedId}
              title={outOfCredits ? "You're out of AI credits" : undefined}
            >
              {analyzing ? "Re-analyzing…" : "Re-analyze"}
            </button>
          </div>
        </>
      ) : (
        <button
          className="nextoffer-panel__btn--primary"
          onClick={() => setConfirmForce(false)}
          disabled={busy || outOfCredits || !selectedId}
          title={outOfCredits ? "You're out of AI credits" : undefined}
        >
          {analyzing ? "Analyzing…" : "Analyze Match"}
        </button>
      )}

      {confirmForce !== null && (
        <div className="nextoffer-panel__match-confirm">
          <span>
            Use <strong>1 AI credit</strong> to {confirmForce ? "re-analyze" : "analyze"} with{" "}
            {selectedResume?.name ?? "this resume"}?
          </span>
          <div className="nextoffer-panel__match-confirm-actions">
            <button
              className="nextoffer-panel__btn--primary"
              onClick={() => void confirmAndAnalyze()}
            >
              Confirm
            </button>
            <button
              className="nextoffer-panel__btn--secondary"
              onClick={() => setConfirmForce(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
