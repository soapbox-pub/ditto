import { useEffect, useMemo, useState } from 'react';
import { useNostrLogin } from '@nostrify/react/login';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { type BtcSigner, hasBtcSigning } from '@/lib/bitcoin-signers';

/**
 * Three possible states for Bitcoin PSBT signing capability:
 *
 * - `supported`   — Known to work (nsec login, or extension that exposes `signPsbt`).
 * - `unsupported` — Known not to work (extension without `signPsbt`, or a remote
 *                   signer that has already rejected a `sign_psbt` request).
 * - `unknown`     — Cannot be determined in advance. Applies to NIP-46 bunker
 *                   logins, since NIP-46 has no standard capability-discovery
 *                   RPC. Treat as "attempt, then propagate the error if it
 *                   fails" — the UI should allow the attempt but fall back to
 *                   the unsupported state when a `sign_psbt` call rejects with
 *                   a capability error (see `reportSignerUnsupported`).
 */
export type BitcoinSignerCapability = 'supported' | 'unsupported' | 'unknown';

/**
 * Module-level registry of bunker pubkeys that have been observed to reject
 * `sign_psbt`. Persists for the lifetime of the page so that the user doesn't
 * see the "attempt then fail" path twice for the same bunker.
 */
const knownUnsupportedBunkers = new Set<string>();

/**
 * Mark a bunker (keyed by user pubkey) as known-unsupported for PSBT signing.
 * Subsequent renders of `useBitcoinSigner` will return `'unsupported'` for
 * that user.
 */
export function reportSignerUnsupported(pubkey: string): void {
  knownUnsupportedBunkers.add(pubkey);
  // Dispatch a DOM event so hook consumers can re-render without plumbing a
  // shared store through the app. Listened to by `useBitcoinSigner`.
  window.dispatchEvent(new CustomEvent('bitcoin-signer-unsupported', { detail: pubkey }));
}

/**
 * Hook that exposes Bitcoin PSBT signing capability for the current login.
 *
 * Capability is probed eagerly for known login types so that the UI can
 * replace itself with an "unsupported" state before the user attempts to
 * sign anything (rather than surfacing a toast after the fact).
 *
 * - **nsec**       → always `'supported'` (local signing).
 * - **extension**  → probes `window.nostr.signPsbt`. Returns `'supported'` if
 *                    present, `'unsupported'` if absent, or `'unknown'` while
 *                    still waiting for the extension to inject `window.nostr`.
 * - **bunker**     → `'unknown'` by default (NIP-46 has no capability RPC).
 *                    Flips to `'unsupported'` for the session once a
 *                    `sign_psbt` attempt has rejected with a capability error
 *                    (see `reportSignerUnsupported`).
 */
export function useBitcoinSigner() {
  const { user } = useCurrentUser();
  const { logins } = useNostrLogin();
  const loginType = logins[0]?.type;

  // ── Extension: probe window.nostr.signPsbt ───────────────────

  const [extensionProbe, setExtensionProbe] = useState<BitcoinSignerCapability>(() => {
    if (loginType !== 'extension') return 'unknown';
    const n = (globalThis as { nostr?: Record<string, unknown> }).nostr;
    if (n && typeof n.signPsbt === 'function') return 'supported';
    if (n) return 'unsupported';
    return 'unknown';
  });

  useEffect(() => {
    if (loginType !== 'extension') return;
    // Re-probe periodically in case the extension injects `window.nostr` late.
    let cancelled = false;
    const probe = () => {
      const n = (globalThis as { nostr?: Record<string, unknown> }).nostr;
      if (!n) return false;
      setExtensionProbe(typeof n.signPsbt === 'function' ? 'supported' : 'unsupported');
      return true;
    };
    if (probe()) return;
    const interval = setInterval(() => {
      if (cancelled) return;
      if (probe()) clearInterval(interval);
    }, 250);
    // Stop polling after 3 s — if the extension hasn't shown up by then it
    // likely isn't going to.
    const stop = setTimeout(() => clearInterval(interval), 3000);
    return () => { cancelled = true; clearInterval(interval); clearTimeout(stop); };
  }, [loginType]);

  // ── Bunker: listen for capability-failure events ─────────────

  const [bunkerUnsupported, setBunkerUnsupported] = useState(() =>
    user ? knownUnsupportedBunkers.has(user.pubkey) : false,
  );

  useEffect(() => {
    if (loginType !== 'bunker' || !user) return;
    if (knownUnsupportedBunkers.has(user.pubkey)) setBunkerUnsupported(true);
    const onUnsupported = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail === user.pubkey) setBunkerUnsupported(true);
    };
    window.addEventListener('bitcoin-signer-unsupported', onUnsupported);
    return () => window.removeEventListener('bitcoin-signer-unsupported', onUnsupported);
  }, [loginType, user]);

  // ── Aggregate capability ─────────────────────────────────────

  const capability: BitcoinSignerCapability = useMemo(() => {
    if (!user) return 'unsupported';
    switch (loginType) {
      case 'nsec':
        // Local signing is always available for nsec logins.
        return 'supported';
      case 'extension':
        return extensionProbe;
      case 'bunker':
        return bunkerUnsupported ? 'unsupported' : 'unknown';
      default:
        // Unknown login type: fall back to the structural check.
        return hasBtcSigning(user.signer) ? 'unknown' : 'unsupported';
    }
  }, [user, loginType, extensionProbe, bunkerUnsupported]);

  const btcSigner = useMemo((): BtcSigner | null => {
    if (!user || capability === 'unsupported') return null;
    if (hasBtcSigning(user.signer)) return user.signer;
    return null;
  }, [user, capability]);

  return {
    /** Detailed capability state. See {@link BitcoinSignerCapability}. */
    capability,
    /** True when capability is `'supported'` or `'unknown'` (attempt allowed). */
    canSignPsbt: capability !== 'unsupported' && btcSigner !== null,
    /**
     * Sign a hex-encoded PSBT. Throws if the signer doesn't support it.
     * The returned hex is a signed (but not finalized) PSBT.
     */
    signPsbt: btcSigner
      ? (psbtHex: string) => btcSigner.signPsbt(psbtHex)
      : null,
  };
}

/**
 * Classify a signer error as a "capability error" (the signer fundamentally
 * cannot sign PSBTs) versus a transient/operational error (network blip,
 * user cancellation, malformed PSBT, etc.).
 *
 * Used by `useOnchainZap` to decide whether a failed send should flip the
 * UI into the `'unsupported'` state or just surface a normal error toast.
 */
export function isSignerCapabilityError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('does not support') ||
    msg.includes("doesn't support") ||
    msg.includes('signpsbt') ||
    msg.includes('sign_psbt')
  );
}
