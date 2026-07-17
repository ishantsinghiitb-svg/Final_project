import logoMark from "../assets/icons/icon-48.png";

/**
 * Collapsed default state's inner content — an icon-only button showing the
 * official NextOffer logo mark. Position, shape, and the expand/collapse
 * morph all live on the shared shell wrapper in `FloatingPanel.tsx` so the
 * launcher and the expanded panel are the same DOM node growing/shrinking,
 * not two disconnected elements.
 */
export function CollapsedLauncher({ onExpand }: { onExpand: () => void }) {
  return (
    <button
      type="button"
      className="nextoffer-launcher-btn"
      onClick={onExpand}
      aria-label="Open NextOffer panel"
    >
      <img src={logoMark} width="50" height="50" alt="" aria-hidden="true" />
    </button>
  );
}
