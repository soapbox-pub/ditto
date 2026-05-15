import { useState, type ErrorInfo, type ReactNode } from 'react';
import {
  ErrorBoundary as ReactErrorBoundary,
  type FallbackProps,
} from 'react-error-boundary';
import { getSentryInstance } from '@/lib/sentry';

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Custom fallback UI to render when an error is caught. Either a static
   * ReactNode, or a render-prop receiving the error and a `reset` callback
   * that re-mounts the protected subtree.
   */
  fallback?: ReactNode | ((args: { error: Error; reset: () => void }) => ReactNode);
  /** Whether to report errors to Sentry. Defaults to true. */
  reportToSentry?: boolean;
  /**
   * Extra Sentry tags merged into the captured event. Useful for distinguishing
   * different boundary placements (e.g. top-level vs. per-feed-item).
   */
  sentryTags?: Record<string, string | number | boolean>;
  /**
   * Sentry severity level. Defaults to `'fatal'` so the top-level boundary
   * behaviour is preserved; inline boundaries should pass `'error'`.
   */
  sentryLevel?: 'fatal' | 'error' | 'warning' | 'info' | 'debug' | 'log';
  /** Keys that, when changed, reset the boundary back to the happy path. */
  resetKeys?: unknown[];
}

/**
 * Error boundary that catches render-time exceptions in its subtree.
 *
 * Wraps `react-error-boundary` to preserve Ditto's existing public API
 * (`fallback?: ReactNode`, `reportToSentry?: boolean`) while gaining the
 * render-prop fallback, `resetKeys`, and `onError` features that pure
 * class-based boundaries don't provide.
 *
 * Catches errors that occur during rendering. Does not catch errors in:
 * - Event handlers
 * - Asynchronous code (e.g., `setTimeout`, promises)
 * - Server side rendering
 * - Errors thrown in the error boundary itself
 */
export function ErrorBoundary({
  children,
  fallback,
  reportToSentry = true,
  sentryTags,
  sentryLevel = 'fatal',
  resetKeys,
}: ErrorBoundaryProps) {
  const handleError = (error: unknown, info: ErrorInfo) => {
    console.error('Error caught by ErrorBoundary:', error, info);

    if (!reportToSentry) return;

    const Sentry = getSentryInstance();
    if (!Sentry) return;

    Sentry.captureException(error, {
      level: sentryLevel,
      contexts: {
        react: {
          componentStack: info.componentStack ?? undefined,
        },
      },
      tags: {
        errorBoundary: 'true',
        ...sentryTags,
      },
    });
  };

  const fallbackRender = (props: FallbackProps) => {
    const error = toError(props.error);
    if (typeof fallback === 'function') {
      return fallback({ error, reset: props.resetErrorBoundary });
    }
    if (fallback !== undefined) {
      return <>{fallback}</>;
    }
    return <DefaultErrorFallback error={error} reset={props.resetErrorBoundary} />;
  };

  return (
    <ReactErrorBoundary
      onError={handleError}
      fallbackRender={fallbackRender}
      resetKeys={resetKeys}
    >
      {children}
    </ReactErrorBoundary>
  );
}

/** Normalize the `unknown` thrown value into an `Error`. */
function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value);
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error('Unknown error');
  }
}

/** Full-page default fallback used by the top-level boundary in `main.tsx`. */
function DefaultErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  // Keep details expandable for diagnostics, but mounted lazily.
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Something went wrong
          </h2>
          <p className="text-muted-foreground">
            An unexpected error occurred. The error has been reported.
          </p>
        </div>

        <div className="bg-muted p-4 rounded-lg">
          <details
            className="text-sm"
            open={showDetails}
            onToggle={(e) => setShowDetails((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer font-medium text-foreground">
              Error details
            </summary>
            <div className="mt-2 space-y-2">
              <div>
                <strong className="text-foreground">Message:</strong>
                <p className="text-muted-foreground mt-1">
                  {error.message}
                </p>
              </div>
              {error.stack && (
                <div>
                  <strong className="text-foreground">Stack trace:</strong>
                  <pre className="text-xs text-muted-foreground mt-1 overflow-auto max-h-32">
                    {error.stack}
                  </pre>
                </div>
              )}
            </div>
          </details>
        </div>

        <div className="flex gap-2">
          <button
            onClick={reset}
            className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="flex-1 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90 transition-colors"
          >
            Reload page
          </button>
        </div>
      </div>
    </div>
  );
}
