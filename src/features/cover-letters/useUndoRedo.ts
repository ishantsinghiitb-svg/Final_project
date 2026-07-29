import { useCallback, useRef, useState } from "react";

// ── Undo / redo for the cover letter editor (Module 6E) ──
//
// Purely in-memory and purely local: undo costs nothing, touches no network and
// consumes no credits. It is deliberately NOT the browser's native textarea undo
// — that stack is wiped every time an AI action replaces the text, which is
// exactly when the user most wants to step back.
//
// Typing is COALESCED: consecutive keystrokes inside a short window collapse
// into one undo entry, so undo steps back a phrase, not a character. Any
// programmatic replacement (an AI action, switching version, restoring) commits
// its own discrete entry via `set(next, { coalesce: false })`.

const COALESCE_MS = 600;
const MAX_HISTORY = 100;

type HistoryState = { stack: string[]; index: number };

export type UndoRedoApi = {
  value: string;
  set: (next: string, options?: { coalesce?: boolean }) => void;
  /** Replace the value and CLEAR history — used when a different document loads. */
  reset: (next: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

export function useUndoRedo(initial: string): UndoRedoApi {
  const [state, setState] = useState<HistoryState>({ stack: [initial], index: 0 });
  const lastPushAt = useRef(0);

  const set = useCallback((next: string, options?: { coalesce?: boolean }) => {
    const coalesce = options?.coalesce ?? true;
    const now = Date.now();
    const shouldMerge = coalesce && now - lastPushAt.current < COALESCE_MS;
    lastPushAt.current = now;

    setState((prev) => {
      if (prev.stack[prev.index] === next) return prev;

      // Any new edit discards the redo tail — standard editor semantics.
      const base = prev.stack.slice(0, prev.index + 1);
      // Merging replaces the top entry so a burst of typing is one undo step.
      // Never merge into the initial entry: that would make the original text
      // unreachable by undo.
      const merged =
        shouldMerge && base.length > 1 ? [...base.slice(0, -1), next] : [...base, next];
      const trimmed =
        merged.length > MAX_HISTORY ? merged.slice(merged.length - MAX_HISTORY) : merged;

      return { stack: trimmed, index: trimmed.length - 1 };
    });
  }, []);

  const reset = useCallback((next: string) => {
    lastPushAt.current = 0;
    setState({ stack: [next], index: 0 });
  }, []);

  const undo = useCallback(() => {
    lastPushAt.current = 0;
    setState((prev) => (prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev));
  }, []);

  const redo = useCallback(() => {
    lastPushAt.current = 0;
    setState((prev) =>
      prev.index < prev.stack.length - 1 ? { ...prev, index: prev.index + 1 } : prev,
    );
  }, []);

  return {
    value: state.stack[state.index] ?? "",
    set,
    reset,
    undo,
    redo,
    canUndo: state.index > 0,
    canRedo: state.index < state.stack.length - 1,
  };
}
