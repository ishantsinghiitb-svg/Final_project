export function PanelHeader({ onCollapse }: { onCollapse: () => void }) {
  return (
    <div className="nextoffer-panel__header">
      <span>NextOffer</span>
      <button
        type="button"
        className="nextoffer-panel__collapse-btn"
        onClick={onCollapse}
        aria-label="Collapse panel"
      >
        ×
      </button>
    </div>
  );
}
