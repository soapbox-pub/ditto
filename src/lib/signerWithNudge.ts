import { Capacitor } from '@capacitor/core';
import type { NostrEvent, NostrSigner } from '@nostrify/types';
import { createElement, type ReactNode } from 'react';
import { defineMessages, FormattedMessage, useIntl, type IntlShape, type MessageDescriptor } from 'react-intl';
import { toast } from '@/hooks/useToast';
import { NudgeToastContent, type SignerAppLink } from '@/components/SignerToastContent';
import { type BtcSigner, hasBtcSigning } from '@/lib/bitcoin-signers';
import { getKindLabel } from '@/lib/kindLabels';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Show the nudge once the signer has answered nothing for this long with work pending. */
const NUDGE_DELAY_MS = 4_000;

/**
 * Reject the op after this long: the only fence for NIP-07 extensions. A
 * remote signer passes its own (`hardTimeoutMs`) above Nip46Signer's budget,
 * so a user still on their way to approve isn't cut off.
 */
const HARD_TIMEOUT_MS = 45_000;

/** Minimum gap between nudge toasts. */
const NUDGE_THROTTLE_MS = 8_000;

/** How long a nudge shows its confirmation before it goes. */
const CONFIRM_MS = 1_500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isIos(): boolean {
  if (Capacitor.getPlatform() === 'ios') return true;
  if (typeof navigator === 'undefined') return false;
  // iPadOS Safari reports itself as a Mac; only the touch points give it away.
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

function isAndroid(): boolean {
  if (Capacitor.getPlatform() === 'android') return true;
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

type OpType = 'sign' | 'encrypt' | 'decrypt';

/**
 * Context-specific overrides for nudge toast descriptions.
 * Falls back to the central kind label registry for kinds not listed here.
 */
const NUDGE_OVERRIDES: Record<number, MessageDescriptor> = defineMessages({
  0: { id: 'signerNudge.subject.profileUpdate', defaultMessage: 'profile update' },
  1: { id: 'signerNudge.subject.post', defaultMessage: 'post' },
  3: { id: 'signerNudge.subject.contactListUpdate', defaultMessage: 'contact list update' },
  11: { id: 'signerNudge.subject.post', defaultMessage: 'post' },
  8333: { id: 'signerNudge.subject.bitcoinZap', defaultMessage: 'Bitcoin zap' },
  4932: { id: 'signerNudge.subject.webxdcSync', defaultMessage: 'webxdc sync' },
  10000: { id: 'signerNudge.subject.muteListUpdate', defaultMessage: 'mute list update' },
  10001: { id: 'signerNudge.subject.pinnedNotesUpdate', defaultMessage: 'pinned notes update' },
  10002: { id: 'signerNudge.subject.relayListUpdate', defaultMessage: 'relay list update' },
  10003: { id: 'signerNudge.subject.bookmarksUpdate', defaultMessage: 'bookmarks update' },
  10015: { id: 'signerNudge.subject.interestsUpdate', defaultMessage: 'interests update' },
  10030: { id: 'signerNudge.subject.emojiListUpdate', defaultMessage: 'emoji list update' },
  20932: { id: 'signerNudge.subject.webxdcSync', defaultMessage: 'webxdc sync' },
  24242: { id: 'signerNudge.subject.fileUploadAuth', defaultMessage: 'file upload auth' },
  30000: { id: 'signerNudge.subject.userListUpdate', defaultMessage: 'user list update' },
  30078: { id: 'signerNudge.subject.appSettings', defaultMessage: 'app settings' },
  30315: { id: 'signerNudge.subject.statusUpdate', defaultMessage: 'status update' },
  31925: { id: 'signerNudge.subject.eventRsvp', defaultMessage: 'event RSVP' },
  39089: { id: 'signerNudge.subject.followPackUpdate', defaultMessage: 'follow pack update' },
});

const opMessages = defineMessages({
  encrypt: { id: 'signerNudge.subject.encryption', defaultMessage: 'encryption' },
  decrypt: { id: 'signerNudge.subject.decryption', defaultMessage: 'decryption' },
  sign: { id: 'signerNudge.subject.signing', defaultMessage: 'signing' },
});

const toastMessages = defineMessages({
  approve: { id: 'signerNudge.approveTitle', defaultMessage: 'Approve {subject}' },
  relayUnreachable: { id: 'signerNudge.relayUnreachable', defaultMessage: 'Signer relay unreachable' },
  relayUnreachableDescription: { id: 'signerNudge.relayUnreachableDescription', defaultMessage: 'Check your connection and try again.' },
  remoteWaiting: { id: 'signerNudge.remoteWaiting', defaultMessage: "Your signer hasn't answered yet. Open it to approve the request, or to wake it if it signs automatically." },
  approveInApp: { id: 'signerNudge.approveInApp', defaultMessage: 'Approve the request in your signer app.' },
});

const successMessages = defineMessages({
  encrypt: { id: 'signerNudge.approved.encryption', defaultMessage: 'Encryption approved' },
  decrypt: { id: 'signerNudge.approved.decryption', defaultMessage: 'Decryption approved' },
  sign: { id: 'signerNudge.approved.signing', defaultMessage: 'Signing approved' },
});

const linkMessages = defineMessages({
  openSigner: { id: 'signerToast.openSigner', defaultMessage: 'Open signer' },
  openClave: { id: 'signerToast.openClave', defaultMessage: 'Open Clave' },
  openAegis: { id: 'signerToast.openAegis', defaultMessage: 'Open Aegis' },
});

function labelForOp(intl: IntlShape, kind: number | undefined, opType: OpType): string {
  if (kind !== undefined) {
    if (NUDGE_OVERRIDES[kind]) return intl.formatMessage(NUDGE_OVERRIDES[kind]);
    const central = getKindLabel(intl, kind, '');
    // Kind labels are title case; English reads better lowercased mid-sentence,
    // but other languages (German nouns) must keep their casing.
    if (central) return intl.locale.startsWith('en') ? central.toLowerCase() : central;
  }
  return intl.formatMessage(opMessages[opType]);
}

/**
 * Nudge toast title. A component (rather than a string) because the toast is
 * raised outside React and needs the active locale to name the operation.
 */
function NudgeToastTitle({ kind, opType }: { kind: number | undefined; opType: OpType }) {
  const intl = useIntl();
  return intl.formatMessage(toastMessages.approve, { subject: labelForOp(intl, kind, opType) });
}

const CLAVE: SignerAppLink = {
  href: 'clave://',
  label: createElement(FormattedMessage, linkMessages.openClave),
};
const AEGIS: SignerAppLink = {
  href: 'aegis://',
  label: createElement(FormattedMessage, linkMessages.openAegis),
};

/** The iOS signer app, read off the session's relays: Aegis runs a local relay, Clave uses relay.powr.build. */
function iosSignerApp(relays: string[]): SignerAppLink | undefined {
  const hosts = relays.flatMap((url) => {
    try {
      return [new URL(url).hostname];
    } catch {
      return [];
    }
  });
  if (hosts.some((h) => h === 'localrelay.link' || h === '127.0.0.1' || h === 'localhost')) return AEGIS;
  if (hosts.includes('relay.powr.build')) return CLAVE;
  return undefined;
}

/**
 * Links that bring a NIP-46 signer app to the front. On iOS each app has its own
 * scheme, so both are offered when the relays don't say which. None on desktop.
 */
function signerAppLinks(signerRelays: string[] = []): SignerAppLink[] {
  if (isAndroid()) return [{ href: 'nostrsigner:', label: createElement(FormattedMessage, linkMessages.openSigner) }];
  if (isIos()) {
    const app = iosSignerApp(signerRelays);
    return app ? [app] : [CLAVE, AEGIS];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Sentinel values used to signal control flow inside Promise.race
// ---------------------------------------------------------------------------

const CANCEL = Symbol('cancel');
const TIMEOUT = Symbol('timeout');

type Signal = typeof CANCEL | typeof TIMEOUT;

// ---------------------------------------------------------------------------
// Toast helpers
// ---------------------------------------------------------------------------

interface ShownNudge {
  dismiss: () => void;
  confirm: (opType: OpType) => void;
}

/** Shows the nudge toast with interactive buttons. */
function showNudgeToast(opts: {
  kind: number | undefined;
  opType: OpType;
  isBunkerConnected: (() => boolean) | undefined;
  remote: boolean;
  signerRelays: string[] | undefined;
  durationMs: number;
  onCancel: () => void;
}): ShownNudge {
  const { kind, opType, isBunkerConnected, remote, signerRelays, durationMs, onCancel } = opts;
  const relayOk = isBunkerConnected ? isBunkerConnected() : true;

  let title: ReactNode;
  let descriptionText: ReactNode;

  if (!relayOk) {
    title = createElement(FormattedMessage, toastMessages.relayUnreachable);
    descriptionText = createElement(FormattedMessage, toastMessages.relayUnreachableDescription);
  } else if (remote) {
    title = createElement(NudgeToastTitle, { kind, opType });
    // An auto-approving push signer (Clave) still needs waking when it falls behind.
    descriptionText = createElement(FormattedMessage, toastMessages.remoteWaiting);
  } else {
    title = createElement(NudgeToastTitle, { kind, opType });
    descriptionText = createElement(FormattedMessage, toastMessages.approveInApp);
  }

  // Mutable ref so the component's onCancel can dismiss its own toast.
  const dismissRef: { fn: (() => void) | undefined } = { fn: undefined };

  const description = createElement(NudgeToastContent, {
    description: descriptionText,
    openSigner: remote && relayOk ? signerAppLinks(signerRelays) : [],
    onCancel: () => { dismissRef.fn?.(); onCancel(); },
  });

  // Finite so Radix swipe-to-dismiss works on mobile; as long as the op may wait.
  const { id, dismiss, update } = toast({ title, description, duration: durationMs });
  dismissRef.fn = dismiss;

  return {
    dismiss,
    // The same toast turns into the confirmation, so it never stacks a second one.
    confirm: (opType) => {
      update({
        id,
        title: createElement(FormattedMessage, successMessages[opType]),
        description: undefined,
        variant: 'success',
        duration: CONFIRM_MS,
      });
      setTimeout(dismiss, CONFIRM_MS);
    },
  };
}

// ---------------------------------------------------------------------------
// Core: run a signer operation with nudge + hard timeout
// ---------------------------------------------------------------------------

interface PendingOp {
  kind: number | undefined;
  opType: OpType;
  cancel: () => void;
}

/**
 * One nudge per STALL of a signer, shared by all its ops. Remote signers serve
 * requests one at a time, so a per-op timer fires on queue wait alone; this
 * clock restarts whenever any op settles, and only a signer that has stopped
 * answering is nudged.
 */
class Nudger {
  readonly #isBunkerConnected: (() => boolean) | undefined;
  readonly #remote: boolean;
  readonly #signerRelays: string[] | undefined;
  readonly hardTimeoutMs: number;
  readonly #pending = new Set<PendingOp>();
  #timer: ReturnType<typeof setTimeout> | undefined;
  #shown: ShownNudge | undefined;
  #lastShownAt = -Infinity;

  constructor(
    isBunkerConnected: (() => boolean) | undefined,
    remote: boolean,
    signerRelays: string[] | undefined,
    hardTimeoutMs: number,
  ) {
    this.#isBunkerConnected = isBunkerConnected;
    this.#remote = remote;
    this.#signerRelays = signerRelays;
    this.hardTimeoutMs = hardTimeoutMs;
  }

  begin(op: PendingOp): void {
    this.#pending.add(op);
    if (this.#timer === undefined && !this.#shown) this.#arm(NUDGE_DELAY_MS);
  }

  /** `approved`: it resolved with a value, which confirms a nudge actually shown. */
  end(op: PendingOp, approved: boolean): void {
    this.#pending.delete(op);
    this.#disarm();
    if (this.#shown) {
      if (approved) this.#shown.confirm(op.opType);
      else this.#shown.dismiss();
      this.#shown = undefined;
    }
    if (this.#pending.size > 0) this.#arm(NUDGE_DELAY_MS);
  }

  #arm(ms: number): void {
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.#show();
    }, ms);
  }

  #disarm(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  #show(): void {
    // The oldest pending op is the one the signer is stuck on.
    const head = this.#pending.values().next().value;
    if (!head) return;
    // Throttled, not dropped: a stall inside the window is nudged when it ends.
    const wait = this.#lastShownAt + NUDGE_THROTTLE_MS - Date.now();
    if (wait > 0) return this.#arm(wait);
    this.#lastShownAt = Date.now();
    this.#shown = showNudgeToast({
      kind: head.kind,
      opType: head.opType,
      isBunkerConnected: this.#isBunkerConnected,
      remote: this.#remote,
      signerRelays: this.#signerRelays,
      durationMs: this.hardTimeoutMs,
      // The rest are queued behind the stalled one, so skip them all.
      onCancel: () => {
        for (const op of [...this.#pending]) op.cancel();
      },
    });
  }
}

/** Creates a deferred promise. Used to race against the actual signer op. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

/** Run `op` under `nudger`, with a cancel button and a hard timeout. */
async function runWithNudge<T>(
  op: () => Promise<T>,
  nudger: Nudger,
  kind: number | undefined,
  opType: OpType,
): Promise<T> {
  // Tagged outcome type used to distinguish op results from control signals.
  type Outcome =
    | { tag: 'value'; value: T }
    | { tag: 'error'; error: unknown }
    | { tag: 'signal'; signal: Signal };

  // Signal channels — each resolves with a sentinel when its condition fires.
  const cancelSignal = deferred<typeof CANCEL>();
  const timeoutSignal = deferred<typeof TIMEOUT>();
  const pending: PendingOp = { kind, opType, cancel: () => cancelSignal.resolve(CANCEL) };
  const hardTimer = setTimeout(() => timeoutSignal.resolve(TIMEOUT), nudger.hardTimeoutMs);
  nudger.begin(pending);

  const opOutcome: Promise<Outcome> = op().then(
    (value): Outcome => ({ tag: 'value', value }),
    (error): Outcome => ({ tag: 'error', error }),
  );

  const signalOutcome: Promise<Outcome> = Promise.race([
    cancelSignal.promise,
    timeoutSignal.promise,
  ]).then((signal): Outcome => ({ tag: 'signal', signal }));

  const outcome = await Promise.race([opOutcome, signalOutcome]);
  clearTimeout(hardTimer);
  nudger.end(pending, outcome.tag === 'value');

  if (outcome.tag === 'value') return outcome.value;

  if (outcome.tag === 'error') {
    throw outcome.error;
  }

  // outcome.tag === 'signal'
  switch (outcome.signal) {
    case CANCEL:
      throw new Error('Signing cancelled by user');

    case TIMEOUT:
      throw new Error('Signer timed out');
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Wraps a `NostrSigner` to add UX improvements for remote/external signers:
 * a nudge toast once it has answered nothing for 4s, a hard timeout, and one
 * confirmation when a shown nudge's stall ends in a signature. nip04/nip44
 * pass through un-nudged. `signPsbt` is forwarded.
 *
 * @param signer - The underlying NostrSigner to wrap.
 * @param isBunkerConnected - Checked at nudge time; false shows a relay-unreachable warning.
 * @param opts.remote - A NIP-46 signer: the nudge explains where to approve.
 * @param opts.signerRelays - The bunker session's relays, which name its iOS signer app.
 * @param opts.hardTimeoutMs - Overrides the 45s fence (a NIP-46 signer waits longer).
 */
export function signerWithNudge(
  signer: NostrSigner,
  isBunkerConnected?: () => boolean,
  opts?: { remote?: boolean; signerRelays?: string[]; hardTimeoutMs?: number },
): NostrSigner {
  const nudger = new Nudger(
    isBunkerConnected,
    opts?.remote ?? false,
    opts?.signerRelays,
    opts?.hardTimeoutMs ?? HARD_TIMEOUT_MS,
  );
  function run<T>(op: () => Promise<T>, kind: number | undefined, opType: OpType): Promise<T> {
    return runWithNudge(op, nudger, kind, opType);
  }

  const wrapped: NostrSigner = {
    getPublicKey: () => run(() => signer.getPublicKey(), undefined, 'sign'),
    signEvent: (event: NostrEvent) => run(() => signer.signEvent(event), event.kind, 'sign'),
  };

  if (signer.getRelays) {
    const getRelays = signer.getRelays.bind(signer);
    wrapped.getRelays = () => run(() => getRelays(), undefined, 'sign');
  }

  // Crypto passes through: per-ciphertext nudges would spam during bulk decrypts. Read
  // through, not copied: a NIP-07 signer only learns what it lacks once the extension injects.
  Object.defineProperties(wrapped, {
    nip04: { get: () => signer.nip04, enumerable: true },
    nip44: { get: () => signer.nip44, enumerable: true },
  });

  // Forward signPsbt if the underlying signer supports Bitcoin signing.
  if (hasBtcSigning(signer)) {
    const btcSigner = signer;
    (wrapped as BtcSigner).signPsbt = (psbtHex: string) =>
      run(() => btcSigner.signPsbt(psbtHex), undefined, 'sign');
  }

  return wrapped;
}
