/**
 * Collapsed default state's inner content — an icon-only button. Position,
 * shape, and the expand/collapse morph all live on the shared shell wrapper
 * in `FloatingPanel.tsx` so the launcher and the expanded panel are the same
 * DOM node growing/shrinking, not two disconnected elements.
 */
export function CollapsedLauncher({ onExpand }: { onExpand: () => void }) {
  return (
    <button
      type="button"
      className="nextoffer-launcher-btn"
      onClick={onExpand}
      aria-label="Open NextOffer panel"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
        <rect x="4" y="7" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M9 7V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path d="M4 12h16" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </button>
  );
}
