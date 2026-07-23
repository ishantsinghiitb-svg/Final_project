import { createRoot, type Root } from "react-dom/client";

import {
  FloatingPanel,
  type PanelActions,
  type PanelViewState,
  type PendingAction,
} from "../panel/FloatingPanel";
import { panelStyles } from "../panel/panelStyles";

const HOST_ID = "nextoffer-panel-host";

/**
 * Imperative wrapper around the React panel so the content-script
 * orchestrator (plain event-driven code, not a React tree) can mount/update/
 * remove it without owning a render loop itself. Rendered inside a shadow
 * root so LinkedIn's page styles can't affect it and vice versa.
 */
export class PanelController {
  private host: HTMLDivElement | null = null;
  private root: Root | null = null;

  update(state: PanelViewState, actions: PanelActions, pending: PendingAction): void {
    // Recreate whenever there's no root yet, OR the previously-appended host
    // is no longer actually in the page (some hiring-page SPAs rewrite
    // `document.body` during hydration/client-side routing after this first
    // mounted, silently carrying the panel off with whatever else they
    // replace) — rendering into a detached root would otherwise succeed with
    // nothing visible on screen.
    if (!this.root || !this.host || !document.body.contains(this.host)) {
      this.root?.unmount();

      this.host = document.createElement("div");
      this.host.id = HOST_ID;
      document.body.appendChild(this.host);

      const shadow = this.host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = panelStyles;
      shadow.appendChild(style);

      const container = document.createElement("div");
      shadow.appendChild(container);

      this.root = createRoot(container);
    }

    this.root.render(<FloatingPanel state={state} actions={actions} pending={pending} />);
  }

  destroy(): void {
    this.root?.unmount();
    this.root = null;
    this.host?.remove();
    this.host = null;
  }
}
