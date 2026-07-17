import logoMark from "../../assets/icons/icon-32.png";

export function PanelHeader({ onCollapse }: { onCollapse: () => void }) {
  return (
    <div className="nextoffer-panel__header">
      <span className="nextoffer-panel__brand">
        <img src={logoMark} width="18" height="18" alt="" aria-hidden="true" />
        NextOffer
      </span>
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
