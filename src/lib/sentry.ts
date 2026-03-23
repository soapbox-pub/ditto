import type * as SentryTypes from '@sentry/react';

let sentryInstance: typeof SentryTypes | null = null;
let isInitialized = false;
let isEnabled = false;

/**
 * Dynamically imports and initializes Sentry.
 * Uses code splitting so the SDK is only downloaded when needed.
 * @param dsn - Sentry DSN
 */
export async function initializeSentry(dsn: string): Promise<void> {
  // Don't initialize if DSN is empty
  if (!dsn) {
    console.log('Sentry DSN is empty, skipping initialization');
    return;
  }

  // If Sentry was already initialized once, just re-enable it
  if (isInitialized && sentryInstance) {
    console.log('Sentry already initialized, re-enabling');
    const client = sentryInstance.getClient();
    if (client) {
      client.getOptions().enabled = true;
    }
    isEnabled = true;
    return;
  }

  try {
    // Dynamic import to avoid loading Sentry unless needed
    const Sentry = await import('@sentry/react');
    sentryInstance = Sentry;

    // Initialize Sentry
    Sentry.init({
      dsn,
      integrations: [
        Sentry.browserTracingIntegration(),
      ],
      // Performance Monitoring
      tracesSampleRate: 0.1, // Capture 10% of transactions for performance monitoring
      // Environment
      environment: import.meta.env.MODE,
      // Release
      release: import.meta.env.VERSION,
      // Censor sensitive data before sending to Sentry
      beforeSend(event) {
        // Regex to match Nostr nsec private keys
        const NSEC_REGEX = /nsec1[023456789acdefghjklmnpqrstuvwxyz]{58}/g;

        /** Recursively censors sensitive values in any value (string, object, array, etc.) */
        function censorSensitiveData(value: unknown): unknown {
          if (typeof value === 'string') {
            return value
              .replace(NSEC_REGEX, 'nsec1**********************************************************');
          }
          if (Array.isArray(value)) {
            return value.map(censorSensitiveData);
          }
          if (value && typeof value === 'object') {
            const result: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(value)) {
              result[key] = censorSensitiveData(val);
            }
            return result;
          }
          return value;
        }

        /** Censors sensitive values from Sentry events before sending */
        function censorSensitiveValues<T extends SentryTypes.Event>(event: T): T | null {
          return censorSensitiveData(event) as T;
        }

        return censorSensitiveValues(event);
      },
    });

    isInitialized = true;
    isEnabled = true;
    console.log('Sentry initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Sentry:', error);
    throw error;
  }
}

/**
 * Disables Sentry by setting enabled to false.
 * The SDK stays loaded but stops sending events,
 * allowing re-enabling without re-initialization.
 */
export async function disableSentry(): Promise<void> {
  if (!isInitialized || !sentryInstance || !isEnabled) {
    return;
  }

  try {
    const client = sentryInstance.getClient();
    if (client) {
      client.getOptions().enabled = false;
    }
    isEnabled = false;
    console.log('Sentry disabled successfully');
  } catch (error) {
    console.error('Failed to disable Sentry:', error);
  }
}

/**
 * Checks if Sentry is currently initialized and enabled.
 */
export function isSentryInitialized(): boolean {
  return isInitialized && isEnabled;
}

/**
 * Gets the Sentry instance (if initialized and enabled).
 * Returns null if Sentry was never loaded or is disabled.
 */
export function getSentryInstance(): typeof SentryTypes | null {
  if (!isEnabled) return null;
  return sentryInstance;
}
