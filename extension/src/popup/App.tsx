import { useEffect, useState } from "react";

import logoMark from "../assets/icons/icon-48.png";
import { panelStyles } from "../panel/panelStyles";
import { CtaRow } from "../panel/sections/CtaRow";
import { JobIdentity } from "../panel/sections/JobIdentity";
import { MetadataChipRow } from "../panel/sections/MetadataChipRow";
import type { PanelActions, PendingAction } from "../panel/types";
import { env } from "../shared/env";
import { sendMessage } from "../shared/messaging/bus";
import { MessageType } from "../shared/messaging/types";
import type { CurrentJobState } from "../shared/messaging/types";

/** How many times to re-poll GET_CURRENT_JOB before accepting "no job" — covers the window while the content script's own parse→auth→sync round trip is still in flight. */
const CURRENT_JOB_POLL_ATTEMPTS = 6;
const CURRENT_JOB_POLL_DELAY_MS = 400;

/**
 * Lightweight companion popup — a status/quick-action surface, not a second
 * place to import jobs (that UI was removed; see Module 4A QA notes). It has
 * no direct channel to the content script running on the active tab, so it
 * reads the same job/CTA state the floating panel already computed via the
 * `GET_CURRENT_JOB` bridge (background/handlers/currentJob.ts) and reuses the
 * SAME presentational sections and message types the floating panel uses
 * (`JobIdentity`, `MetadataChipRow`, `CtaRow`, `SAVE_JOB`/`APPLY_AND_TRACK`/
 * `TRACK_APPLICATION`) rather than reimplementing any of that logic.
 */
export function App() {
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<CurrentJobState | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentJob(): Promise<void> {
      // Resolved here (not by the background) — a service worker has no
      // window of its own, so `currentWindow: true` there falls back to
      // "the last-focused window" instead of reliably meaning "the tab this
      // popup was opened over." The popup, being the actual UI surface the
      // user just clicked, doesn't have that ambiguity.
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (cancelled) return;
      if (typeof tab?.id !== "number") {
        setCurrent(null);
        setLoading(false);
        return;
      }

      // The content script may still be mid parse→auth→sync round trip when
      // the popup is opened (its own debounce alone is ~600ms) — poll briefly
      // rather than accepting a single "nothing yet" as final.
      for (let attempt = 1; attempt <= CURRENT_JOB_POLL_ATTEMPTS; attempt++) {
        if (cancelled) return;

        const response = await sendMessage<CurrentJobState | null>({
          type: MessageType.GET_CURRENT_JOB,
          payload: { tabId: tab.id },
        }).catch(() => null);

        if (cancelled) return;

        const data = response?.ok ? response.data : null;
        if (data) {
          setCurrent(data);
          setLoading(false);
          return;
        }

        if (attempt < CURRENT_JOB_POLL_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, CURRENT_JOB_POLL_DELAY_MS));
        }
      }

      if (!cancelled) {
        setCurrent(null);
        setLoading(false);
      }
    }

    void loadCurrentJob();

    return () => {
      cancelled = true;
    };
  }, []);

  async function runAction(
    type:
      | typeof MessageType.SAVE_JOB
      | typeof MessageType.APPLY_AND_TRACK
      | typeof MessageType.TRACK_APPLICATION,
    pendingKind: NonNullable<PendingAction>,
  ): Promise<void> {
    if (!current || pending) return;
    setPending(pendingKind);

    const response = await sendMessage<{ application?: { id: string; status: string } }>({
      type,
      payload: { globalJobId: current.globalJobId },
    });

    setPending(null);
    if (!response.ok) return;

    setCurrent((prev) =>
      prev
        ? {
            ...prev,
            state: type === MessageType.SAVE_JOB ? "saved" : "tracked",
            applicationId: response.data.application?.id ?? prev.applicationId,
          }
        : prev,
    );
  }

  const actions: PanelActions = {
    onApplyAndTrack: () => void runAction(MessageType.APPLY_AND_TRACK, "applyAndTrack"),
    onSaveForLater: () => void runAction(MessageType.SAVE_JOB, "save"),
    onTrackApplication: () => void runAction(MessageType.TRACK_APPLICATION, "track"),
    onViewInNextOffer: () => {
      if (!current) return;
      const url = current.applicationId
        ? `${env.appUrl}/dashboard/applications/${current.applicationId}`
        : `${env.appUrl}/dashboard/jobs/${current.globalJobId}`;
      window.open(url, "_blank");
    },
    onOpenInNextOffer: () => window.open(env.appUrl, "_blank"),
  };

  return (
    <main className="popup">
      {/* Reuses the floating panel's own stylesheet so JobIdentity/
          MetadataChipRow/CtaRow render identically here — no separate copy
          of their CSS. Rules scoped to classes this page doesn't use
          (the floating shell/launcher) simply don't match anything. */}
      <style>{panelStyles}</style>

      <section className="popup__brand">
        <img className="popup__logo" src={logoMark} width="40" height="40" alt="" />
        <h1 className="popup__title">NextOffer</h1>
        <p className="popup__subtitle">AI Job Copilot</p>
        <p className="popup__tagline">
          Track jobs, save opportunities, manage applications and prepare for interviews.
        </p>
      </section>

      <section className="popup__section">
        <p className="popup__section-title">Extension Status</p>
        <p className="popup__status-active">✓ Extension Active</p>
        <p className="popup__hint">
          If the floating panel doesn't appear on this page, refresh the page once.
        </p>
      </section>

      {loading ? (
        <section className="popup__section">
          <p className="popup__section-title">Current Job</p>
          <p className="popup__hint">Checking this page for a job…</p>
        </section>
      ) : (
        current && (
          <section className="popup__section">
            <p className="popup__section-title">Current Job</p>
            <JobIdentity job={current.job} />
            <MetadataChipRow job={current.job} />
            <div className="popup__cta">
              <CtaRow
                kind={current.state}
                isClosed={current.job.isClosed}
                pending={pending}
                actions={actions}
                readyLabels={{
                  primary: "Track Application",
                  primaryPending: "Tracking…",
                  secondary: "Save Job",
                  secondaryPending: "Saving…",
                }}
              />
            </div>
          </section>
        )
      )}
    </main>
  );
}
