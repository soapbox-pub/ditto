import type { NostrEvent, NostrSigner } from '@nostrify/types';
import { createElement } from 'react';
import { toast } from '@/hooks/useToast';
import { androidResume } from '@/lib/androidResume';
import { NudgeToastContent, PhaseToastContent } from '@/components/SignerToastContent';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Show the nudge toast after this delay if a signer op is still pending. */
const NUDGE_DELAY_MS = 4_000;

/** Longer delay for decrypt operations — auto-approve is common and nudging
 *  too early sends the user to the signer with nothing to approve. */
const NUDGE_DELAY_DECRYPT_MS = 10_000;

/** Hard timeout — reject the op entirely after this long with no response. */
const HARD_TIMEOUT_MS = 45_000;

/**
 * Event kinds whose content is encrypted by the user's signer before signing.
 * A signEvent for one of these kinds immediately after a nip44 encrypt is
 * treated as the second phase of the same operation (encrypt-then-sign), and
 * a phase-transition toast is shown so the user knows a second approval is
 * coming.
 *
 * Only kinds where Ditto calls `user.signer.nip44.encrypt()` then immediately
 * `createEvent()` qualify — DM gift-wraps use ephemeral random signers and
 * are excluded.
 */
const ENCRYPTED_CONTENT_KINDS = new Set([
  10000, // Mute list (NIP-51, private items encrypted to self)
  30078, // App settings (NIP-78, content encrypted to self)
]);

/** Max number of automatic retries on Android foreground resume. */
const MAX_RETRIES = 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

type OpType = 'sign' | 'encrypt' | 'decrypt';

/** Human-readable labels for event kinds shown in nudge toasts. */
const KIND_LABELS: Record<number, string> = {
  0: 'profile update',
  1: 'post',
  3: 'contact list update',
  5: 'deletion',
  6: 'repost',
  7: 'reaction',
  11: 'post',
  16: 'repost',
  1111: 'comment',
  1984: 'report',
  4932: 'webxdc sync',
  10000: 'mute list update',
  10001: 'pinned notes update',
  10002: 'relay list update',
  10003: 'bookmarks update',
  10015: 'interests update',
  10030: 'emoji list update',
  20932: 'webxdc sync',
  24242: 'file upload auth',
  30000: 'user list update',
  30078: 'app settings',
  30315: 'status update',
  31925: 'event RSVP',
  39089: 'help content',
};

function labelForOp(kind: number | undefined, opType: OpType): string {
  if (kind !== undefined && KIND_LABELS[kind]) return KIND_LABELS[kind];
  if (opType === 'encrypt') return 'encryption';
  if (opType === 'decrypt') return 'decryption';
  return 'signing';
}

// ---------------------------------------------------------------------------
// Sentinel values used to signal control flow inside Promise.race
// ---------------------------------------------------------------------------

const CANCEL = Symbol('cancel');
const TIMEOUT = Symbol('timeout');
const RESUME = Symbol('resume');

type Signal = typeof CANCEL | typeof TIMEOUT | typeof RESUME;

// ---------------------------------------------------------------------------
// Toast helpers
// ---------------------------------------------------------------------------

/**
 * Shows the nudge toast with interactive buttons. Returns a dismiss handle.
 *
 * On Android the toast includes an "Approve in signer" link that opens the
 * signer via the `nostrsigner:` URI scheme (keeps the WebSocket alive), plus
 * a Skip/Cancel button. On desktop it shows a description with a Skip button.
 */
function showNudgeToast(opts: {
  kind: number | undefined;
  opType: OpType;
  isBunkerConnected: (() => boolean) | undefined;
  afterForegroundResume: boolean;
  onCancel: () => void;
}): { dismiss: () => void } {
  const { kind, opType, isBunkerConnected, afterForegroundResume, onCancel } = opts;
  const android = isAndroid();
  const relayOk = isBunkerConnected ? isBunkerConnected() : true;
  const subject = labelForOp(kind, opType);

  let title: string;
  let descriptionText: string;

  if (!relayOk) {
    title = 'Signer relay unreachable';
    descriptionText = 'Check your connection and try again.';
  } else if (android && afterForegroundResume) {
    title = `Approve ${subject} — try again`;
    descriptionText = 'Use the button below. Switching apps manually can interrupt the connection.';
  } else if (android) {
    title = `Approve ${subject}`;
    descriptionText = 'Set to auto-approve for a smoother experience.';
  } else {
    title = `Approve ${subject}`;
    descriptionText = 'Approve the request in your signer app.';
  }

  // We need to capture the dismiss function so the onCancel callback inside
  // the component can dismiss the toast. We use a mutable ref pattern (object
  // wrapper) so the closure captures the container rather than the value.
  const dismissRef: { fn: (() => void) | undefined } = { fn: undefined };

  const description = createElement(NudgeToastContent, {
    description: descriptionText,
    android,
    relayOk,
    onCancel: () => { dismissRef.fn?.(); onCancel(); },
  });

  const { dismiss } = toast({ title, description, duration: Infinity });
  dismissRef.fn = dismiss;

  return { dismiss };
}

function showSuccessToast(opType: OpType): void {
  const verb = opType === 'encrypt' ? 'Encryption' : opType === 'decrypt' ? 'Decryption' : 'Signing';
  toast({ title: `${verb} approved`, duration: 3000, variant: 'success' });
}

function showPhaseTransitionToast(signKind: number | undefined): void {
  const android = isAndroid();
  const label = signKind !== undefined ? KIND_LABELS[signKind] : undefined;
  const signDesc = label ? `approve ${label} signing` : 'approve signing';
  const message = `Encryption approved — now ${signDesc} in your signer app.`;

  const description = createElement(PhaseToastContent, { message, android });

  toast({ title: 'Step 1 complete', description, duration: 8000 });
}

// ---------------------------------------------------------------------------
// Core: run a signer operation with nudge + retry logic
// ---------------------------------------------------------------------------

interface RunOpts {
  kind: number | undefined;
  opType: OpType;
  isBunkerConnected: (() => boolean) | undefined;
}

/** Creates a deferred promise. Used to race against the actual signer op. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

/** Result of `runWithNudge` — value + whether the nudge toast was shown. */
interface RunResult<T> {
  value: T;
  nudgeFired: boolean;
}

/**
 * Runs `op` with:
 * - A nudge toast after NUDGE_DELAY_MS if still pending.
 * - A hard timeout at HARD_TIMEOUT_MS.
 * - On Android, automatic retry when the app returns to the foreground
 *   (WebSocket connections are frozen while backgrounded, so NIP-46 responses
 *   are missed).
 *
 * Uses an iterative retry loop instead of recursion.
 */
async function runWithNudge<T>(op: () => Promise<T>, opts: RunOpts): Promise<RunResult<T>> {
  const { kind, opType, isBunkerConnected } = opts;

  // Tagged outcome type used to distinguish op results from control signals.
  type Outcome =
    | { tag: 'value'; value: T }
    | { tag: 'error'; error: unknown }
    | { tag: 'signal'; signal: Signal };

  let nudgeFired = false;
  let afterForegroundResume = false;

  // Previous op promises that are still in-flight. On Android foreground
  // resume we issue a fresh `op()` but keep racing previous ones so a late
  // response from an earlier attempt is still accepted (avoids duplicate
  // signer prompts).
  const pendingOps: Promise<Outcome>[] = [];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Signal channels — each resolves with a sentinel when its condition fires.
    const cancelSignal = deferred<typeof CANCEL>();
    const timeoutSignal = deferred<typeof TIMEOUT>();
    const resumeSignal = deferred<typeof RESUME>();

    // --- Nudge timer ---
    let dismissNudge: (() => void) | undefined;
    const delay = opType === 'decrypt' ? NUDGE_DELAY_DECRYPT_MS : NUDGE_DELAY_MS;
    const nudgeTimer = setTimeout(() => {
      nudgeFired = true;
      const handle = showNudgeToast({
        kind, opType, isBunkerConnected, afterForegroundResume,
        onCancel: () => cancelSignal.resolve(CANCEL),
      });
      dismissNudge = handle.dismiss;
    }, delay);

    // --- Hard timeout ---
    const hardTimer = setTimeout(() => timeoutSignal.resolve(TIMEOUT), HARD_TIMEOUT_MS);

    // --- Android foreground resume watcher ---
    const { destroy: stopWatching } = androidResume({
      threshold: 0,
      onResume: () => {
        toast({ title: 'Checking for signer response\u2026', duration: 4000 });
        resumeSignal.resolve(RESUME);
      },
    });

    function cleanup() {
      clearTimeout(nudgeTimer);
      clearTimeout(hardTimer);
      stopWatching();
      dismissNudge?.();
    }

    // Start a new op and add it to the pending set.
    const newOp: Promise<Outcome> = op().then(
      (value): Outcome => ({ tag: 'value', value }),
      (error): Outcome => ({ tag: 'error', error }),
    );
    pendingOps.push(newOp);

    const signalOutcome: Promise<Outcome> = Promise.race([
      cancelSignal.promise,
      timeoutSignal.promise,
      resumeSignal.promise,
    ]).then((signal): Outcome => ({ tag: 'signal', signal }));

    // Race all pending ops (current + any still in-flight from prior
    // attempts) against the signal channels.
    const outcome = await Promise.race([...pendingOps, signalOutcome]);
    cleanup();

    // --- Handle outcome ---

    if (outcome.tag === 'value') {
      if (nudgeFired) showSuccessToast(opType);
      return { value: outcome.value, nudgeFired };
    }

    if (outcome.tag === 'error') {
      throw outcome.error;
    }

    // outcome.tag === 'signal'
    switch (outcome.signal) {
      case CANCEL:
        throw new Error('Signing cancelled by user');

      case TIMEOUT:
        throw new Error('Signer timed out');

      case RESUME:
        afterForegroundResume = true;
        console.log('[signerWithNudge] retrying after foreground resume');
        continue;
    }
  }

  throw new Error('Signer timed out after retries');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Wraps a `NostrSigner` to add UX improvements for remote/external signers:
 *
 * - Shows a nudge toast after 4s if a signing or encryption op is still
 *   pending, so the user knows to check their signer app.
 * - On Android, automatically retries when the app returns to the foreground,
 *   recovering from missed NIP-46 responses dropped while the WebSocket was
 *   frozen in the background.
 * - When a nip44 encrypt is immediately followed by a signEvent (e.g. saving
 *   encrypted settings), shows a phase-transition toast so the user knows to
 *   approve the second request.
 *
 * @param signer - The underlying NostrSigner to wrap.
 * @param isBunkerConnected - Optional callback checked at nudge time; when it
 *   returns false the toast warns about a relay connectivity problem instead.
 */
export function signerWithNudge(
  signer: NostrSigner,
  isBunkerConnected?: () => boolean,
): NostrSigner {
  // Multi-phase state: set to true when a nip44 encrypt completes with the
  // nudge shown. Cleared on the next signEvent. Used to detect encrypt-then-sign
  // flows for kinds whose content is encrypted by the user's signer.
  let pendingEncryptNudge = false;

  /** Run an op and return just the value (discarding nudge metadata). */
  function run<T>(op: () => Promise<T>, kind: number | undefined, opType: OpType): Promise<T> {
    return runWithNudge(op, { kind, opType, isBunkerConnected }).then((r) => r.value);
  }

  const wrapped: NostrSigner = {
    getPublicKey: () => run(() => signer.getPublicKey(), undefined, 'sign'),

    signEvent: (event: NostrEvent) => {
      // Show a phase-transition toast when signing an event whose content was
      // just encrypted by the user's signer and the nudge was shown for that
      // encrypt. Only fires for kinds we know use encrypt-then-sign.
      if (pendingEncryptNudge && ENCRYPTED_CONTENT_KINDS.has(event.kind)) {
        showPhaseTransitionToast(event.kind);
      }
      pendingEncryptNudge = false;
      return run(() => signer.signEvent(event), event.kind, 'sign');
    },
  };

  if (signer.getRelays) {
    const getRelays = signer.getRelays.bind(signer);
    wrapped.getRelays = () => run(() => getRelays(), undefined, 'sign');
  }

  // Shared wrapper for nip04/nip44 encrypt and decrypt methods.
  function wrapCrypto(crypto: {
    encrypt: (pubkey: string, plaintext: string) => Promise<string>;
    decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
  }) {
    return {
      encrypt: (pubkey: string, plaintext: string) =>
        runWithNudge(() => crypto.encrypt(pubkey, plaintext), { kind: undefined, opType: 'encrypt', isBunkerConnected })
          .then(({ value, nudgeFired }) => {
            pendingEncryptNudge = nudgeFired;
            return value;
          }),
      decrypt: (pubkey: string, ciphertext: string) =>
        run(() => crypto.decrypt(pubkey, ciphertext), undefined, 'decrypt'),
    };
  }

  if (signer.nip04) {
    wrapped.nip04 = wrapCrypto(signer.nip04);
  }

  if (signer.nip44) {
    wrapped.nip44 = wrapCrypto(signer.nip44);
  }

  return wrapped;
}
