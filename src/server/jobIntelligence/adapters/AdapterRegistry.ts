import type { PlatformAdapter } from "./types";

/**
 * The single place platform adapters are registered. Empty by default — this
 * module (10A) ships the architecture only; a future module adds a real
 * adapter with exactly one call to `register()`, nothing else in the
 * pipeline changes. Keyed by lowercase platform tag so lookups are
 * case-insensitive the way `global_jobs.source` values already are.
 */
export class AdapterRegistry {
  private adapters = new Map<string, PlatformAdapter>();

  register(adapter: PlatformAdapter): void {
    const key = adapter.platform.toLowerCase();
    if (this.adapters.has(key)) {
      throw new Error(`An adapter for platform "${adapter.platform}" is already registered.`);
    }
    this.adapters.set(key, adapter);
  }

  get(platform: string): PlatformAdapter | undefined {
    return this.adapters.get(platform.toLowerCase());
  }

  list(): string[] {
    return [...this.adapters.keys()];
  }
}

/** Process-wide registry for production use. Tests should construct their own `new AdapterRegistry()` instead. */
export const adapterRegistry = new AdapterRegistry();
