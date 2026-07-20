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
    const hadRootBefore = Boolean(this.root);
    const removedExternally = Boolean(this.root && this.host && !document.body.contains(this.host));
    if (removedExternally) {
      console.debug("[NextOffer][DEBUG] 10. Subsequent code removed the host?", true);
    } else if (hadRootBefore) {
      console.debug("[NextOffer][DEBUG] 10. Subsequent code removed the host?", false, "(re-render, host untouched)");
    }

    if (!this.root || !this.host || !document.body.contains(this.host)) {
      this.root?.unmount();

      this.host = document.createElement("div");
      this.host.id = HOST_ID;
      console.debug("[NextOffer][DEBUG] 5. Host element created?", true);
      document.body.appendChild(this.host);
      console.debug(
        "[NextOffer][DEBUG] 8. Host element attached to document.body?",
        document.body.contains(this.host),
      );

      const shadow = this.host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = panelStyles;
      shadow.appendChild(style);

      const container = document.createElement("div");
      shadow.appendChild(container);

      this.root = createRoot(container);
      console.debug("[NextOffer][DEBUG] 6. React root mounted?", this.root !== null);
    }

    this.root.render(<FloatingPanel state={state} actions={actions} pending={pending} />);

    const host = this.host;
    queueMicrotask(() => {
      if (!host) return;
      const hostStyle = getComputedStyle(host);
      const shellEl = host.shadowRoot?.querySelector<HTMLElement>(".nextoffer-shell") ?? null;
      const shellStyle = shellEl ? getComputedStyle(shellEl) : null;
      console.debug("[NextOffer][DEBUG] 9. Host element visible? (computed)", {
        hostConnected: host.isConnected,
        hostDisplay: hostStyle.display,
        hostVisibility: hostStyle.visibility,
        shellFound: shellEl !== null,
        shellDisplay: shellStyle?.display,
        shellVisibility: shellStyle?.visibility,
        shellPosition: shellStyle?.position,
        shellZIndex: shellStyle?.zIndex,
      });
    });
  }

  destroy(): void {
    this.root?.unmount();
    this.root = null;
    this.host?.remove();
    this.host = null;
  }
}
