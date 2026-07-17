/**
 * Injected into the panel's shadow root as a <style> tag, so LinkedIn's page
 * styles can't bleed in and vice versa.
 */
export const panelStyles = `
:host, * {
  box-sizing: border-box;
}

.nextoffer-panel {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2147483647;
  width: 280px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  color: #1a1a1a;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  border: 1px solid #e5e5e5;
}

.nextoffer-panel__header {
  padding: 10px 14px;
  background: #0a66c2;
  color: #ffffff;
  font-weight: 600;
  font-size: 13px;
}

.nextoffer-panel__body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nextoffer-panel__summary {
  margin-bottom: 4px;
}

.nextoffer-panel__title {
  font-weight: 600;
  line-height: 1.3;
}

.nextoffer-panel__company {
  color: #555;
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

.nextoffer-panel__saved-badge {
  color: #0a7d3f;
  font-weight: 600;
}

.nextoffer-panel button {
  appearance: none;
  border: none;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  width: 100%;
}

.nextoffer-panel button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.nextoffer-panel__btn--primary {
  background: #0a66c2;
  color: #ffffff;
}

.nextoffer-panel__btn--secondary {
  background: #eef3f8;
  color: #0a66c2;
}
`;
