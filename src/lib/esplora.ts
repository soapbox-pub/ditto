// ---------------------------------------------------------------------------
// Esplora REST failover client
// ---------------------------------------------------------------------------
//
// The Esplora REST surface is supported by many backends besides mempool.space:
// Blockstream's reference implementation, mempool.space community mirrors
// (mempool.emzy.de, mempool.bitaroo.net, geographic mirrors), and self-hosted
// instances. They all speak the same `/address/...`, `/tx/...`,
// `/fee-estimates`, etc. paths — but availability varies, and rate limits
// (HTTP 429) on public instances are real.
//
// This module turns the configured `esploraApis` (an ordered array of URLs)
// into a single `esploraFetch(urls, path, init)` call that:
//
// 1. Tries each URL in order, with a per-attempt timeout (default 15s) so
//    a hung connection — common when mempool.space has rate-limited you and
//    is silently dropping the request — kills the request and fails over to
//    the next URL instead of leaking the inflight fetch forever.
// 2. On network error / timeout / HTTP 429 / 5xx, parks the URL in a
//    module-level cool-down map with exponential backoff (30s → 60s →
//    120s → 240s → 300s), then advances to the next URL.
// 3. On any 2xx (or non-retryable 4xx like 400/404), returns the response.
// 4. Successful responses reset the URL's failure count to zero.
// 5. If the caller's `signal` aborts, the active request is cancelled and
//    the `AbortError` is propagated — we do NOT continue to other endpoints.
//
// Cool-down state is in-memory only — it lives for the session and is
// transparent to callers. The list of URLs itself is never mutated; we just
// skip ones whose cool-down hasn't expired.
// ---------------------------------------------------------------------------

/** Initial cool-down on first failure, in milliseconds. */
const INITIAL_COOLDOWN_MS = 30_000;

/** Maximum cool-down after repeated failures, in milliseconds. */
const MAX_COOLDOWN_MS = 300_000;

/**
 * Default ordered list of Esplora-compatible REST roots. Used as the initial
 * value of `AppConfig.esploraApis` and surfaced by the Settings UI as the
 * "Restore defaults" target.
 *
 * Ordering is deliberate — `mempool.space` is the primary, `mempool.emzy.de`
 * is a well-maintained mempool.space mirror, and `blockstream.info` is the
 * reference Esplora implementation. The mempool mirrors are listed first so
 * the `/v1/prices` extension is available without the soft-failover hop.
 */
export const DEFAULT_ESPLORA_APIS: readonly string[] = [
  'https://mempool.space/api',
  'https://mempool.emzy.de/api',
  'https://blockstream.info/api',
];

/**
 * Default per-attempt timeout. Chosen to catch shadowban-style hangs
 * (mempool.space's "absorb the request and never reply" rate-limit pattern)
 * quickly, while still allowing genuinely slow responses on healthy endpoints
 * to complete. A full address-with-paginated-txs response on a cold mempool
 * is typically well under 10s.
 */
const DEFAULT_TIMEOUT_MS = 15_000;

/** HTTP status codes that trigger failover + cool-down. */
const RETRYABLE_STATUS = new Set<number>([
  408, // Request Timeout
  425, // Too Early
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

/** Per-URL cool-down state. */
interface EndpointState {
  /** Earliest time (ms epoch) the endpoint may be retried. */
  retryAt: number;
  /** Consecutive failure count. Drives backoff length. */
  failures: number;
}

/** Module-level map of URL → cool-down state. */
const state = new Map<string, EndpointState>();

/** Has this endpoint's cool-down elapsed? */
function isAvailable(url: string, now: number): boolean {
  const s = state.get(url);
  return !s || s.retryAt <= now;
}

/** Mark an endpoint as failed, extending its cool-down with exponential backoff. */
function markFailure(url: string, now: number): void {
  const prev = state.get(url);
  const failures = (prev?.failures ?? 0) + 1;
  const backoff = Math.min(
    INITIAL_COOLDOWN_MS * 2 ** (failures - 1),
    MAX_COOLDOWN_MS,
  );
  state.set(url, { retryAt: now + backoff, failures });
}

/** Mark an endpoint as healthy. Clears any prior cool-down / failure count. */
function markSuccess(url: string): void {
  if (state.has(url)) state.delete(url);
}

/** Strip a trailing slash so callers don't have to think about it. */
function normalize(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Options that control failover behaviour for a single `esploraFetch` call.
 */
export interface EsploraFetchOptions extends Omit<RequestInit, 'signal'> {
  /**
   * Caller-supplied abort signal. When this signal aborts (e.g. a TanStack
   * Query unmount), the inflight request is cancelled and an `AbortError`
   * propagates to the caller — we do not continue to other endpoints.
   */
  signal?: AbortSignal;
  /**
   * Per-attempt timeout in milliseconds. After this elapses, the current
   * request is aborted and the endpoint is marked as failed; the next URL
   * in the list is tried. Defaults to {@link DEFAULT_TIMEOUT_MS}.
   *
   * Set to `0` to disable the timeout entirely (not recommended — this is
   * the safety net against shadowbans).
   */
  timeoutMs?: number;
  /**
   * Treat HTTP status `404` (and optionally others) as "this endpoint doesn't
   * support this path" rather than "everything is broken". The endpoint stays
   * healthy, but we still try the next one in the list. Used for the
   * mempool.space-specific `/v1/prices` endpoint which is absent on backends
   * like Blockstream Esplora.
   *
   * Defaults to `[]` — every non-retryable error response is returned to the
   * caller as-is.
   */
  skipStatuses?: number[];
  /**
   * Additional HTTP statuses to treat as a retryable endpoint failure for
   * *this* call — failover to the next URL AND cool the endpoint down — on top
   * of the global {@link RETRYABLE_STATUS} set.
   *
   * Use this for paths that are *always present* on a healthy Esplora backend
   * (e.g. `/fee-estimates`, `/address/…`, `/tx` broadcast), where a `404` is
   * never a legitimate "not found" but a sign the endpoint is misbehaving —
   * notably mempool.space returning `404` instead of `429` to rate-limited
   * clients (common on carrier-NAT'd mobile connections). Without this, the
   * `404` is mistaken for a real answer, returned to the caller, and no
   * failover happens.
   *
   * Do NOT use for paths where `404` is a meaningful answer — e.g.
   * `/tx/{txid}` lookups, where "not found" means the tx genuinely isn't
   * known yet.
   *
   * Defaults to `[]`.
   */
  retryStatuses?: number[];
}

/** Error thrown when every endpoint in the list is unreachable or cooled down. */
export class EsploraAllEndpointsFailedError extends Error {
  constructor(
    /** Original URLs that were attempted. */
    public readonly urls: string[],
    /** Per-URL failure reasons in attempt order. */
    public readonly causes: Array<{ url: string; reason: string }>,
  ) {
    const summary = causes.map((c) => `${c.url} → ${c.reason}`).join('; ');
    super(`All Esplora endpoints failed: ${summary || '(none available)'}`);
    this.name = 'EsploraAllEndpointsFailedError';
  }
}

/**
 * Build a single AbortSignal that fires when either the caller's signal
 * aborts OR the per-attempt timeout elapses. Returns the merged signal plus
 * a cleanup function to clear the timer once the attempt finishes. Uses
 * `AbortSignal.any` when available (modern Chrome/Firefox/Safari and
 * recent WKWebView/Android WebView via Capacitor); falls back to manual
 * listener wiring on older runtimes.
 */
function buildAttemptSignal(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void; timedOut: () => boolean } {
  const timeoutController = new AbortController();
  let didTimeout = false;
  const timer = timeoutMs > 0
    ? setTimeout(() => {
        didTimeout = true;
        timeoutController.abort();
      }, timeoutMs)
    : undefined;

  // Compose timeout + caller signal. AbortSignal.any is the clean path.
  const signals: AbortSignal[] = [timeoutController.signal];
  if (callerSignal) signals.push(callerSignal);

  let signal: AbortSignal;
  let removeListener: (() => void) | undefined;
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
    signal = AbortSignal.any(signals);
  } else if (callerSignal) {
    // Manual composition: forward caller's abort onto the timeout controller
    // so the timeout's signal is the single source of truth.
    if (callerSignal.aborted) {
      timeoutController.abort();
    } else {
      const onAbort = () => timeoutController.abort();
      callerSignal.addEventListener('abort', onAbort, { once: true });
      removeListener = () => callerSignal.removeEventListener('abort', onAbort);
    }
    signal = timeoutController.signal;
  } else {
    signal = timeoutController.signal;
  }

  return {
    signal,
    cleanup: () => {
      if (timer !== undefined) clearTimeout(timer);
      removeListener?.();
    },
    timedOut: () => didTimeout,
  };
}

/**
 * Fetch an Esplora REST path with ordered failover across `baseUrls`.
 *
 * Iterates the URL list in order, skipping any endpoint currently in
 * cool-down. The first URL that returns a non-retryable response wins —
 * callers handle 2xx and "expected" 4xx (400, 404 for genuine not-found,
 * etc.) themselves.
 *
 * Each attempt is bounded by a timeout (default 15s) and the caller's
 * abort signal. Timeouts count as endpoint failures (cool-down + try next);
 * caller aborts propagate immediately.
 *
 * @param baseUrls    Ordered list of Esplora REST roots, e.g.
 *                    `['https://mempool.space/api', 'https://blockstream.info/api']`.
 *                    Each should be a full URL with no trailing slash, but a
 *                    trailing slash is tolerated.
 * @param path        Path beginning with `/`, e.g. `/address/bc1.../utxo`.
 * @param options     Standard `fetch` options plus `signal`, `timeoutMs`, and
 *                    `skipStatuses` for soft failover on endpoint-capability
 *                    mismatches.
 */
export async function esploraFetch(
  baseUrls: string[],
  path: string,
  options: EsploraFetchOptions = {},
): Promise<Response> {
  if (baseUrls.length === 0) {
    throw new EsploraAllEndpointsFailedError([], []);
  }

  const {
    skipStatuses = [],
    retryStatuses = [],
    signal: callerSignal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    ...fetchInit
  } = options;

  // Caller already gave up before we even started. Honour that immediately.
  if (callerSignal?.aborted) {
    throw callerSignal.reason instanceof Error
      ? callerSignal.reason
      : new DOMException('Aborted', 'AbortError');
  }

  const skip = new Set(skipStatuses);
  const retry = new Set(retryStatuses);
  const causes: Array<{ url: string; reason: string }> = [];
  const now = Date.now();

  // Build the attempt order: available endpoints first, then cooled-down ones
  // as a last-resort fallback. This way, when *every* endpoint is cooling
  // down we still try them rather than dying instantly.
  const normalized = baseUrls.map(normalize);
  const available = normalized.filter((u) => isAvailable(u, now));
  const cooling = normalized.filter((u) => !isAvailable(u, now));
  const attemptOrder = available.length > 0 ? [...available, ...cooling] : cooling;

  for (const baseUrl of attemptOrder) {
    const fullUrl = `${baseUrl}${path}`;
    const attempt = buildAttemptSignal(callerSignal, timeoutMs);

    let response: Response;
    try {
      response = await fetch(fullUrl, { ...fetchInit, signal: attempt.signal });
    } catch (err) {
      attempt.cleanup();

      // Caller aborted: propagate. Don't continue to other endpoints, don't
      // penalize this one.
      if (callerSignal?.aborted) {
        throw err;
      }

      // Per-attempt timeout: treat as a soft failure for *this* endpoint
      // and advance to the next URL. This is the shadowban defence — when
      // mempool.space rate-limits, it sometimes just absorbs the connection
      // and never responds; the timeout converts that hang into a regular
      // failover signal.
      if (attempt.timedOut()) {
        markFailure(baseUrl, Date.now());
        causes.push({ url: baseUrl, reason: `timeout after ${timeoutMs}ms` });
        continue;
      }

      // Generic network error / DNS failure / CORS error.
      markFailure(baseUrl, Date.now());
      causes.push({ url: baseUrl, reason: err instanceof Error ? err.message : String(err) });
      continue;
    }
    attempt.cleanup();

    if (response.ok) {
      markSuccess(baseUrl);
      return response;
    }

    // "Endpoint capability mismatch" (e.g. /v1/prices on Blockstream).
    // The endpoint is fine — it just doesn't speak that path. Try the
    // next URL but don't penalize this one.
    if (skip.has(response.status)) {
      causes.push({ url: baseUrl, reason: `HTTP ${response.status} (skipped)` });
      continue;
    }

    // 5xx / 429 / 408 → cool down and try the next URL. Callers can extend
    // this set per-call via `retryStatuses` for always-present paths where a
    // 404 means "misbehaving endpoint" rather than "genuinely not found"
    // (e.g. mempool.space returning 404 to rate-limited mobile clients).
    if (RETRYABLE_STATUS.has(response.status) || retry.has(response.status)) {
      markFailure(baseUrl, Date.now());
      causes.push({ url: baseUrl, reason: `HTTP ${response.status}` });
      continue;
    }

    // Non-retryable 4xx (400, 404 for genuine "not found", etc.).
    // Return as-is — this is a real answer that won't change by retrying.
    markSuccess(baseUrl);
    return response;
  }

  throw new EsploraAllEndpointsFailedError(baseUrls, causes);
}

/**
 * Test-only: reset the in-memory cool-down map. Not exported from the public
 * surface for production code — consumers should never need this.
 */
export function _resetEsploraStateForTests(): void {
  state.clear();
}
