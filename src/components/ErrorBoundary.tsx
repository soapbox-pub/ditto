import { useContext, useState, type ErrorInfo, type ReactNode } from 'react';
import { FormattedMessage, IntlContext, IntlProvider, type IntlShape } from 'react-intl';
import {
  ErrorBoundary as ReactErrorBoundary,
  type FallbackProps,
} from 'react-error-boundary';
import { peekCatalog } from '@/i18n/language';

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Custom fallback UI to render when an error is caught. Either a static
   * ReactNode, or a render-prop receiving the error and a `reset` callback
   * that re-mounts the protected subtree.
   */
  fallback?: ReactNode | ((args: { error: Error; reset: () => void }) => ReactNode);
  /** Keys that, when changed, reset the boundary back to the happy path. */
  resetKeys?: unknown[];
}

/**
 * Error boundary that catches render-time exceptions in its subtree.
 *
 * Wraps `react-error-boundary` to preserve Ditto's existing public API
 * (`fallback?: ReactNode`) while gaining the
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
  resetKeys,
}: ErrorBoundaryProps) {
  const handleError = (error: unknown, info: ErrorInfo) => {
    console.error('Error caught by ErrorBoundary:', error, info);
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

/**
 * Full-page default fallback used by the top-level boundary in `main.tsx`.
 *
 * That boundary sits outside `I18nProvider`, so supply a provider from the
 * last rendered `<html lang>` and whatever catalog is already loaded.
 */
function DefaultErrorFallback(props: { error: Error; reset: () => void }) {
  const intl = useContext(IntlContext) as IntlShape | undefined;
  if (intl) return <DefaultErrorFallbackContent {...props} />;

  const locale = document.documentElement.lang || 'en';
  return (
    <IntlProvider locale={locale} defaultLocale="en" messages={peekCatalog(locale)} onError={() => {}}>
      <DefaultErrorFallbackContent {...props} />
    </IntlProvider>
  );
}

function DefaultErrorFallbackContent({ error, reset }: { error: Error; reset: () => void }) {
  // Keep details expandable for diagnostics, but mounted lazily.
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-2">
            <FormattedMessage id="errorBoundary.title" defaultMessage="Something went wrong" />
          </h2>
          <p className="text-muted-foreground">
            <FormattedMessage
              id="errorBoundary.description"
              defaultMessage="An unexpected error occurred."
            />
          </p>
        </div>

        <div className="bg-muted p-4 rounded-lg">
          <details
            className="text-sm"
            open={showDetails}
            onToggle={(e) => setShowDetails((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer font-medium text-foreground">
              <FormattedMessage id="errorBoundary.details" defaultMessage="Error details" />
            </summary>
            <div className="mt-2 space-y-2">
              <div>
                <strong className="text-foreground">
                  <FormattedMessage id="errorBoundary.message" defaultMessage="Message:" />
                </strong>
                <p className="text-muted-foreground mt-1">
                  {error.message}
                </p>
              </div>
              {error.stack && (
                <div>
                  <strong className="text-foreground">
                    <FormattedMessage id="errorBoundary.stackTrace" defaultMessage="Stack trace:" />
                  </strong>
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
            className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors"
          >
            <FormattedMessage id="errorBoundary.tryAgain" defaultMessage="Try again" />
          </button>
          <button
            onClick={() => window.location.reload()}
            className="flex-1 px-4 py-2 bg-secondary text-secondary-foreground rounded-full hover:bg-secondary/90 transition-colors"
          >
            <FormattedMessage id="errorBoundary.reloadPage" defaultMessage="Reload page" />
          </button>
        </div>
      </div>
    </div>
  );
}
