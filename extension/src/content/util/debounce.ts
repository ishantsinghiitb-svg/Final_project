/**
 * Debounce with a max-wait fallback. A plain debounce would never fire if
 * the watched DOM (LinkedIn's SPA shell) keeps mutating continuously — the
 * quiet-period timer would keep getting reset. `maxWaitMs` guarantees a run
 * happens at least that often regardless.
 */
export function debounceWithMaxWait<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number,
  maxWaitMs: number,
): (...args: Args) => void {
  let delayTimer: ReturnType<typeof setTimeout> | undefined;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;

  const clearTimers = () => {
    if (delayTimer) clearTimeout(delayTimer);
    if (maxTimer) clearTimeout(maxTimer);
    delayTimer = undefined;
    maxTimer = undefined;
  };

  return (...args: Args) => {
    if (delayTimer) clearTimeout(delayTimer);

    delayTimer = setTimeout(() => {
      clearTimers();
      fn(...args);
    }, delayMs);

    if (!maxTimer) {
      maxTimer = setTimeout(() => {
        clearTimers();
        fn(...args);
      }, maxWaitMs);
    }
  };
}
