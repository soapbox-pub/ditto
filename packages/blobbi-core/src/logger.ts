/**
 * Package-safe logger for @blobbi/core.
 *
 * Constraints (Phase 1):
 * - No React.
 * - No Vite-only APIs (no `import.meta.env`, no `import.meta.hot`, etc.).
 * - Defaults to a no-op so importing the package never produces console noise.
 *
 * A host application (e.g. Ditto) can inject its own logger via
 * `setBlobbiLogger` to route @blobbi/core diagnostics wherever it wants.
 */

export interface BlobbiLogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/** Default no-op logger: swallows everything. */
const noopLogger: BlobbiLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

let currentLogger: BlobbiLogger = noopLogger;

/**
 * Install a custom logger implementation for @blobbi/core.
 * Pass `null` to reset back to the default no-op logger.
 */
export function setBlobbiLogger(logger: BlobbiLogger | null): void {
  currentLogger = logger ?? noopLogger;
}

/**
 * The active @blobbi/core logger. Always safe to call; defaults to a no-op.
 */
export const blobbiLogger: BlobbiLogger = {
  debug: (...args) => currentLogger.debug(...args),
  info: (...args) => currentLogger.info(...args),
  warn: (...args) => currentLogger.warn(...args),
  error: (...args) => currentLogger.error(...args),
};
