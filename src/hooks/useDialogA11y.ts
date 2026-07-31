import { useEffect, useRef } from "react";

// ── useDialogA11y (Module 7E) ──
//
// The interview modules' six custom dialogs (Schedule, Delete, Start Mock
// Interview, End Interview, Generate Prep, Interview Picker) each hand-roll
// their own `role="dialog" aria-modal="true"` overlay rather than using the
// Radix Dialog primitive already in the codebase (src/components/ui/dialog),
// because each has bespoke, per-feature visual styling that doesn't match
// Radix's generic default appearance. That's a real, deliberate reason to
// keep them custom — but it also means none of them get Radix's built-in
// focus trap, Escape-to-close, or focus-return-on-close for free, and a 7E
// accessibility audit found all six missing all three.
//
// This hook adds exactly that behaviour to an existing custom dialog without
// touching its markup or styling: attach the returned ref to the dialog's
// outer panel (the element carrying `role="dialog"`), pass `open` and the
// same `onClose` callback the dialog already uses for its Cancel/backdrop
// click.

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogA11y<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const containerRef = useRef<T>(null);
  const triggerRef = useRef<Element | null>(null);
  // Several callers pass a fresh closure every render (e.g. `() => { if
  // (!isPending) onCancel(); }`), and `open` is often a literal `true` for a
  // dialog whose mount/unmount IS its open/closed state — meaning the effect
  // below only runs once and would otherwise capture just that first render's
  // closure. Reading through a ref updated on every render is what keeps
  // Escape checking the CURRENT `isPending`/`onClose`, not the one from
  // whenever the dialog happened to open, without re-running (and re-stealing
  // focus from) the setup effect on every parent re-render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    // Whatever had focus when the dialog opened — almost always the button
    // that triggered it — gets focus back once it closes, so closing a
    // dialog never strands a keyboard user back at the top of the page.
    triggerRef.current = document.activeElement;

    const container = containerRef.current;
    const focusable = container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    // Don't steal focus from a field the dialog itself already autoFocus'd
    // (e.g. InterviewPickerDialog's search input) — only move focus if
    // nothing inside the dialog already has it.
    if (focusable && focusable.length > 0 && !container?.contains(document.activeElement)) {
      focusable[0].focus();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      // Wrap Tab/Shift+Tab at the dialog's edges instead of letting focus
      // escape into the page behind the overlay.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
    };
  }, [open]);

  return containerRef;
}
