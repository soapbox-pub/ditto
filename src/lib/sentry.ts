/** Subset of the Sentry API surface we actually use. */
interface SentryLike {
  init: typeof import('@sentry/react').init;
  getClient: typeof import('@sentry/react').getClient;
  browserTracingIntegration: typeof import('@sentry/react').browserTracingIntegration;
  captureException: typeof import('@sentry/react').captureException;
  captureMessage: typeof import('@sentry/react').captureMessage;
  setUser: typeof import('@sentry/react').setUser;
}

/**
 * Secrets that must never reach Sentry, with their replacements: nsec and
 * ncryptsec keys, NWC and bunker URIs (both carry a secret), and any
 * `secret=` parameter. URIs and parameters are also matched percent-encoded,
 * as they appear inside other URLs' query strings.
 */
const SECRET_PATTERNS: [RegExp, string][] = [
  [/nsec1[023456789acdefghjklmnpqrstuvwxyz]{58}/gi, 'nsec1[redacted]'],
  [/ncryptsec1[023456789acdefghjklmnpqrstuvwxyz]+/gi, 'ncryptsec1[redacted]'],
  [/nostr(?:\+|%2B)?walletconnect(?::\/\/|%3A%2F%2F)[^\s"'`<>]*/gi, 'nostr+walletconnect://[redacted]'],
  [/bunker(?::\/\/|%3A%2F%2F)[^\s"'`<>]*/gi, 'bunker://[redacted]'],
  [/((?:[?&]|%3F|%26)secret(?:=|%3D))[^&\s"'`<>%]*/gi, '$1[redacted]'],
];

/**
 * Object keys whose string values are secrets whatever they look like, such
 * as the hex secret of a parsed NWC connection. Hex keys can't be matched by
 * pattern without also wiping every event id and pubkey.
 */
const SECRET_KEY = /secret|priv(?:ate)?_?key|^(?:sk|nsec|password|passphrase|mnemonic|seed)$/i;

/** How deep to walk nested values; anything deeper is dropped. */
const MAX_DEPTH = 12;

function censorString(value: string): string {
  let censored = value;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    censored = censored.replace(pattern, replacement);
  }
  return censored;
}

/**
 * Recursively censor secrets in any value (string, object, array, etc.).
 *
 * Plain objects and arrays are copied with their values censored. Errors
 * become `{ name, message, stack }`, since their fields aren't enumerable.
 * Other objects (class instances, DOM nodes, events), which breadcrumbs pick
 * up from console arguments, are reduced to their string form rather than
 * walked, and cycles are cut.
 */
function censorSecrets<T>(value: T): T {
  return censorValue(value, new Set(), 0) as T;
}

/** `ancestors` holds the objects on the current path, to cut cycles. */
function censorValue(value: unknown, ancestors: Set<object>, depth: number): unknown {
  if (typeof value === 'string') return censorString(value);
  if (!value || typeof value !== 'object') return value;
  if (ancestors.has(value) || depth > MAX_DEPTH) return '[omitted]';

  // Raw bytes (e.g. a `Uint8Array` secret key) would otherwise be stringified
  // into their numeric values below.
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return '[binary]';

  if (value instanceof Error) {
    return {
      name: value.name,
      message: censorString(value.message),
      stack: value.stack ? censorString(value.stack) : undefined,
    };
  }
  const proto: unknown = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) {
    return censorString(String(value));
  }

  ancestors.add(value);
  let result: unknown;
  if (Array.isArray(value)) {
    result = value.map((item) => censorValue(item, ancestors, depth + 1));
  } else {
    const copy: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (depth === 0 && key === 'sdkProcessingMetadata') {
        // SDK-internal state (scopes, request data) that the SDK reads after
        // beforeSend and never sends as-is.
        copy[key] = val;
      } else {
        // Redact by key whatever the value's type: a key can be a string,
        // bytes, or an array of numbers.
        copy[key] = val !== null && val !== undefined && typeof val !== 'boolean' && SECRET_KEY.test(key)
          ? '[redacted]'
          : censorValue(val, ancestors, depth + 1);
      }
    }
    result = copy;
  }
  ancestors.delete(value);
  return result;
}

let sentryInstance: SentryLike | null = null;
let isInitialized = false;
let isEnabled = false;

/**
 * Dynamically imports and initializes Sentry.
 * Uses code splitting so the SDK is only downloaded when needed.
 * Only imports the functions we use so tree-shaking can drop
 * unused modules (replay, feedback, replay-canvas ~300 KB).
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
    // Named imports let the bundler tree-shake unused Sentry modules
    // (replay, feedback, replay-canvas) that are re-exported from @sentry/browser.
    const {
      init,
      getClient,
      browserTracingIntegration,
      captureException,
      captureMessage,
      setUser,
    } = await import('@sentry/react');

    sentryInstance = { init, getClient, browserTracingIntegration, captureException, captureMessage, setUser };

    // Initialize Sentry
    init({
      dsn,
      // `BrowserApiErrors` monkey-patches setTimeout, setInterval,
      // requestAnimationFrame and addEventListener so it can attach better
      // stack traces to errors thrown inside them. That wrapper is expensive
      // at Ditto's callback volume: a production trace of one navigation
      // showed 5113 wrapped invocations costing 1043ms, most of it relay
      // WebSocket messages. Uncaught errors from those callbacks still reach
      // Sentry through `globalHandlers`, so we give up some stack context
      // rather than a second of main thread per navigation.
      integrations: (defaults) => [
        ...defaults.filter((integration) => integration.name !== 'BrowserApiErrors'),
        browserTracingIntegration(),
      ],
      // Performance Monitoring
      tracesSampleRate: 0.1, // Capture 10% of transactions for performance monitoring
      // Environment
      environment: import.meta.env.MODE,
      // Release
      release: import.meta.env.VERSION,
      // Censor secrets before anything leaves the device. Transactions don't
      // pass through beforeSend. Breadcrumbs do once attached to an event,
      // but are scrubbed as they're recorded too, so raw secrets never sit in
      // the in-memory buffer.
      beforeSend: (event) => censorSecrets(event),
      beforeSendTransaction: (event) => censorSecrets(event),
      beforeBreadcrumb: (breadcrumb) => censorSecrets(breadcrumb),
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
export function getSentryInstance(): SentryLike | null {
  if (!isEnabled) return null;
  return sentryInstance;
}
