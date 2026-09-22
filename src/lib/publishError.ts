import { defineMessage, type MessageDescriptor } from 'react-intl';

/**
 * Human-readable explanation of a failed publish, ready to hand to a toast.
 *
 * `values` fills the ICU placeholders in `description` (currently only
 * `{reason}`, used when a relay's rejection text is passed through verbatim).
 */
export interface PublishErrorInfo {
  title: MessageDescriptor;
  description: MessageDescriptor;
  values?: Record<string, string>;
}

/** Thrown by `useNostrPublish` when the user has no relay configured for writing. */
export const NO_WRITE_RELAYS = 'No write relays configured';

const messages = {
  relayRejected: {
    title: defineMessage({ id: 'publishError.relayRejected.title', defaultMessage: 'Relays rejected your post' }),
    description: defineMessage({
      id: 'publishError.relayRejected.description',
      defaultMessage: 'Your relays refused the post: {reason}',
    }),
  },
  authRequired: {
    title: defineMessage({ id: 'publishError.authRequired.title', defaultMessage: 'Relay requires login' }),
    description: defineMessage({
      id: 'publishError.authRequired.description',
      defaultMessage: 'Your relays want you to authenticate before posting. Try again, or switch relays in Settings.',
    }),
  },
  rateLimited: {
    title: defineMessage({ id: 'publishError.rateLimited.title', defaultMessage: 'Slow down' }),
    description: defineMessage({
      id: 'publishError.rateLimited.description',
      defaultMessage: "You're posting faster than your relays allow. Wait a moment and try again.",
    }),
  },
  blocked: {
    title: defineMessage({ id: 'publishError.blocked.title', defaultMessage: 'Relays rejected your post' }),
    description: defineMessage({
      id: 'publishError.blocked.description',
      defaultMessage: "Your relays won't accept posts from this account. Try adding a different relay in Settings.",
    }),
  },
  pow: {
    title: defineMessage({ id: 'publishError.pow.title', defaultMessage: 'Relays require proof of work' }),
    description: defineMessage({
      id: 'publishError.pow.description',
      defaultMessage: "Your relays only accept posts with proof of work, which Ditto doesn't do yet. Try another relay.",
    }),
  },
  invalid: {
    title: defineMessage({ id: 'publishError.invalid.title', defaultMessage: 'Relays rejected your post' }),
    description: defineMessage({
      id: 'publishError.invalid.description',
      defaultMessage: 'Your relays considered the post malformed: {reason}',
    }),
  },
  noResponse: {
    title: defineMessage({ id: 'publishError.noResponse.title', defaultMessage: 'No response from relays' }),
    description: defineMessage({
      id: 'publishError.noResponse.description',
      defaultMessage: 'Your relays never answered. It may still have been published — check your profile before posting again.',
    }),
  },
  noRelays: {
    title: defineMessage({ id: 'publishError.noRelays.title', defaultMessage: 'No relays to post to' }),
    description: defineMessage({
      id: 'publishError.noRelays.description',
      defaultMessage: 'None of your relays are set to write. Add one in Settings, under Relays.',
    }),
  },
  signerCancelled: {
    title: defineMessage({ id: 'publishError.signerCancelled.title', defaultMessage: 'Signing cancelled' }),
    description: defineMessage({
      id: 'publishError.signerCancelled.description',
      defaultMessage: 'The signing request was cancelled, so nothing was published.',
    }),
  },
  signerTimeout: {
    title: defineMessage({ id: 'publishError.signerTimeout.title', defaultMessage: "Signer didn't respond" }),
    description: defineMessage({
      id: 'publishError.signerTimeout.description',
      defaultMessage: 'Open your signer app to approve the request, then try again.',
    }),
  },
  loggedOut: {
    title: defineMessage({ id: 'publishError.loggedOut.title', defaultMessage: "You're logged out" }),
    description: defineMessage({
      id: 'publishError.loggedOut.description',
      defaultMessage: 'Log in again to publish.',
    }),
  },
  unknown: {
    title: defineMessage({ id: 'publishError.unknown.title', defaultMessage: "Couldn't publish" }),
    description: defineMessage({
      id: 'publishError.unknown.description',
      defaultMessage: 'Something went wrong: {reason}',
    }),
  },
  unknownNoReason: {
    title: defineMessage({ id: 'publishError.unknownNoReason.title', defaultMessage: "Couldn't publish" }),
    description: defineMessage({
      id: 'publishError.unknownNoReason.description',
      defaultMessage: 'Something went wrong. Please try again.',
    }),
  },
};

/** True for the `AbortError`/`TimeoutError` a relay timeout or cancellation produces. */
function isAbort(error: unknown): boolean {
  return (
    (error instanceof DOMException || error instanceof Error) &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

/**
 * Collect the relay rejection reasons out of the `AggregateError` that
 * `NPool.event()` throws when every write relay fails. Its own `.message` is
 * the engine-generic "All promises were rejected", so the detail only lives
 * in `.errors`. Aborts are dropped: they carry no relay-supplied text.
 */
function relayReasons(error: AggregateError): string[] {
  const reasons: string[] = [];

  for (const inner of error.errors) {
    if (isAbort(inner)) continue;
    const reason = inner instanceof Error ? inner.message.trim() : String(inner).trim();
    if (reason && !reasons.includes(reason)) {
      reasons.push(reason);
    }
  }

  return reasons;
}

/**
 * Map a relay's NIP-01 `OK` rejection reason to user-facing copy. Reasons are
 * conventionally prefixed with a machine-readable word (`blocked:`,
 * `rate-limited:`, `auth-required:`, `pow:`, `invalid:`, `error:`), but relays
 * are inconsistent about it, so anything unrecognized is passed through.
 */
function describeRelayReason(reason: string): PublishErrorInfo {
  const lower = reason.toLowerCase();

  if (lower.startsWith('auth-required:')) return messages.authRequired;
  if (lower.startsWith('rate-limited:')) return messages.rateLimited;
  if (lower.startsWith('blocked:') || lower.startsWith('restricted:')) return messages.blocked;
  if (lower.startsWith('pow:')) return messages.pow;
  if (lower.startsWith('invalid:')) return { ...messages.invalid, values: { reason } };

  return { ...messages.relayRejected, values: { reason } };
}

/**
 * Turn whatever `useNostrPublish` (or `usePostComment`) threw into a title and
 * description a user can act on. Publishing fails in half a dozen distinct
 * ways — the signer was cancelled, a remote signer went silent, every relay
 * rejected the event, no relay answered — and they all arrive here as an
 * opaque `unknown`.
 */
export function describePublishError(error: unknown): PublishErrorInfo {
  if (error instanceof AggregateError) {
    const reasons = relayReasons(error);
    // Every relay aborted or timed out, with nothing to report.
    if (!reasons.length) return messages.noResponse;
    return describeRelayReason(reasons[0]);
  }

  if (isAbort(error)) {
    return messages.noResponse;
  }

  if (error instanceof Error) {
    // Synthetic errors from `signerWithNudge`, matched on the exact strings it throws.
    if (error.message === 'Signing cancelled by user') return messages.signerCancelled;
    if (error.message === 'Signer timed out') return messages.signerTimeout;
    if (error.message === 'User is not logged in') return messages.loggedOut;
    if (error.message === NO_WRITE_RELAYS) return messages.noRelays;

    const reason = error.message.trim();
    if (reason) return { ...messages.unknown, values: { reason } };
  }

  return messages.unknownNoReason;
}
