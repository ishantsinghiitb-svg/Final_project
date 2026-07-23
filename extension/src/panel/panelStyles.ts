/**
 * Injected into the panel's shadow root as a <style> tag, so LinkedIn's page
 * styles can't bleed in and vice versa.
 */
export const panelStyles = `
:host, * {
  box-sizing: border-box;
}

/*
 * The shell is the single element that morphs between the collapsed
 * launcher and the expanded panel — same node, animated width/height/
 * border-radius/shadow, so expanding feels like it grows out of the
 * launcher rather than a second element appearing next to it.
 */
.nextoffer-shell {
  position: fixed;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2147483647;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  overflow: hidden;
  background: #ffffff;
  animation: nextoffer-mount 0.22s ease;
  /*
   * max-height (not height) is animated — CSS can't tween to/from "auto",
   * so the collapsed/expanded states below cap it at a fixed value instead;
   * actual content height stays natural and scrolls if it ever exceeds that cap.
   */
  transition:
    width 0.3s cubic-bezier(0.34, 1.4, 0.64, 1),
    max-height 0.3s cubic-bezier(0.34, 1.4, 0.64, 1),
    border-radius 0.26s ease,
    box-shadow 0.26s ease;
}

@keyframes nextoffer-mount {
  from { opacity: 0; transform: translateY(-50%) scale(0.9); }
  to { opacity: 1; transform: translateY(-50%) scale(1); }
}

/* ── Collapsed launcher ──
 * The shell must be exactly the size of the launcher button and center it, so
 * the two circles are concentric and read as ONE clean floating button. When
 * the shell was larger than the button (and didn't center it), the extra ring
 * of shell — its white background + drop shadow — peeked out on one side as a
 * clipped "second circle" artifact. */
.nextoffer-shell--collapsed {
  width: 60px;
  max-height: 60px;
  border-radius: 999px;
  box-shadow: 0 6px 18px -4px rgba(10, 102, 194, 0.45);
  display: grid;
  place-items: center;
}

.nextoffer-shell--collapsed:hover {
  box-shadow: 0 10px 24px -4px rgba(10, 102, 194, 0.55);
}

.nextoffer-launcher-btn {
  width: 60px;
  height: 60px;
  border: 1.5px solid #a8ccf0;
  border-radius: 999px;
  background: #ffffff;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: transform 0.18s ease;
}

.nextoffer-shell--collapsed:hover .nextoffer-launcher-btn {
  transform: scale(1.08);
}

.nextoffer-shell--collapsed:active .nextoffer-launcher-btn {
  transform: scale(0.96);
}

/* ── Expanded panel ── */
.nextoffer-shell--expanded {
  width: 296px;
  max-height: min(480px, 80vh);
  border-radius: 16px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 20px 48px -12px rgba(15, 23, 42, 0.28);
  display: flex;
  flex-direction: column;
  animation: nextoffer-expand-in 0.22s ease;
}

@keyframes nextoffer-expand-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.nextoffer-panel__header {
  padding: 12px 10px 12px 16px;
  background: linear-gradient(135deg, #0a66c2, #2563eb);
  color: #ffffff;
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.01em;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.nextoffer-panel__brand {
  display: flex;
  align-items: center;
  gap: 7px;
}

.nextoffer-panel__collapse-btn {
  appearance: none;
  border: none;
  background: transparent;
  color: #ffffff;
  font-size: 18px;
  line-height: 1;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  cursor: pointer;
  opacity: 0.85;
  transition: opacity 0.15s ease, background 0.15s ease;
}

.nextoffer-panel__collapse-btn:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.16);
}

.nextoffer-panel__body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 13px;
  color: #1a1a1a;
  overflow-y: auto;
}

/* ── Job identity ── */
.nextoffer-panel__identity {
  min-width: 0;
}

.nextoffer-panel__identity-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.nextoffer-panel__identity-text {
  min-width: 0;
  flex: 1;
}

/* Company logo — mirrors the dashboard CompanyMark (rounded, contained, white bg). */
.nextoffer-panel__logo {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  object-fit: contain;
  background: #fff;
}

.nextoffer-panel__logo-fallback {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
}

.nextoffer-panel__title {
  font-weight: 600;
  line-height: 1.35;
}

.nextoffer-panel__company {
  color: #5b6472;
  margin-top: 2px;
}

.nextoffer-panel__closed {
  display: inline-block;
  margin-top: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #fdecea;
  color: #b3261e;
  font-size: 11px;
  font-weight: 600;
}

/* ── Metadata chips — reserves room for future AI-module chips without a layout change ── */
.nextoffer-panel__chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.nextoffer-panel__chip {
  padding: 3px 9px;
  border-radius: 999px;
  background: #eef3f8;
  color: #0a66c2;
  font-size: 11px;
  font-weight: 600;
}

/* ── CTA row ── */
.nextoffer-panel__cta-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nextoffer-panel__btn--tracked {
  background: #e6f6ec;
  color: #0a7d3f;
}

.nextoffer-shell--expanded button.nextoffer-panel__btn--tracked:disabled {
  opacity: 1;
  cursor: default;
}

/* Excludes the header's collapse button — it has its own compact sizing above. */
.nextoffer-shell--expanded button:not(.nextoffer-panel__collapse-btn) {
  appearance: none;
  border: none;
  border-radius: 9px;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  width: 100%;
  transition: transform 0.12s ease, opacity 0.12s ease, box-shadow 0.12s ease;
}

.nextoffer-shell--expanded button:not(.nextoffer-panel__collapse-btn):disabled {
  cursor: not-allowed;
  opacity: 0.6;
  transform: none;
}

.nextoffer-panel__btn--primary {
  background: linear-gradient(135deg, #0a66c2, #2563eb);
  color: #ffffff;
  box-shadow: 0 4px 12px -4px rgba(37, 99, 235, 0.5);
}

.nextoffer-panel__btn--primary:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px -4px rgba(37, 99, 235, 0.6);
}

.nextoffer-panel__btn--secondary {
  background: #eef3f8;
  color: #0a66c2;
}

.nextoffer-panel__btn--secondary:not(:disabled):hover {
  background: #e2edf9;
}

/* ── AI Job Match section (Module 6C) — selector + credits + cached score + actions ── */
.nextoffer-panel__match {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.06), rgba(124, 58, 237, 0.08));
}

.nextoffer-panel__match-resume {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nextoffer-panel__match-resume-label {
  font-size: 11px;
  font-weight: 600;
  color: #5b6472;
}

.nextoffer-panel__upload-btn {
  align-self: flex-start;
  width: auto !important;
  min-height: 0 !important;
  padding: 5px 10px !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  border: 1px dashed rgba(37, 99, 235, 0.4) !important;
  background: rgba(37, 99, 235, 0.06) !important;
  color: #2563eb !important;
  border-radius: 7px !important;
}

.nextoffer-panel__match-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
  padding-top: 8px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.nextoffer-panel__match-title {
  font-weight: 700;
  font-size: 13px;
  color: #1a1a1a;
}

.nextoffer-panel__match-credits {
  font-size: 11px;
  font-weight: 600;
  color: #5b6472;
}

.nextoffer-panel__match-score {
  font-size: 20px;
  font-weight: 700;
  color: #7c3aed;
  line-height: 1.1;
}

.nextoffer-panel__match-label {
  font-size: 12px;
  font-weight: 600;
  color: #1a1a1a;
  margin-top: -4px;
}

.nextoffer-panel__match-hint {
  font-size: 11px;
  color: #5b6472;
}

.nextoffer-panel__match-error {
  font-size: 11px;
  color: #b3261e;
}

.nextoffer-panel__match-actions {
  display: flex;
  gap: 8px;
}

.nextoffer-panel__match-confirm {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(0, 0, 0, 0.08);
  font-size: 11.5px;
  color: #1a1a1a;
}

.nextoffer-panel__match-confirm-actions {
  display: flex;
  gap: 8px;
}

.nextoffer-panel__match-select {
  flex: 1;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
  background: #ffffff;
  color: #1a1a1a;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
}

.nextoffer-panel__match-select:focus-visible {
  outline: 2px solid rgba(37, 99, 235, 0.4);
  outline-offset: 1px;
}

/* The two-button action rows share width; single buttons stay full-width via
   the base rule. Specificity must beat the shell's width:100% button rule above. */
.nextoffer-shell--expanded .nextoffer-panel__match-actions button,
.nextoffer-shell--expanded .nextoffer-panel__match-confirm-actions button {
  flex: 1;
  width: auto;
  padding: 8px 10px;
  font-size: 12px;
}

/* ── Unsupported-hiring-page message (Module 4C) ── */
.nextoffer-panel__list {
  margin: 0;
  padding-left: 18px;
  color: #1a1a1a;
}

/* ── No-job (supported host, nothing to save on this page) ── */
.nextoffer-panel__empty-title {
  font-weight: 600;
  font-size: 14px;
  color: #1a1a1a;
}
`;
