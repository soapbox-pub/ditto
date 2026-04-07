import { useMemo } from 'react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { type BtcSigner, hasBtcSigning } from '@/lib/bitcoin-signers';

/**
 * Hook that exposes Bitcoin PSBT signing capability from the current user's signer.
 *
 * Works with all login types:
 * - **nsec**: Signs locally using the Taproot-tweaked private key.
 * - **extension (NIP-07)**: Delegates to `window.nostr.signPsbt()`.
 * - **bunker (NIP-46)**: Sends `sign_psbt` RPC to the remote signer.
 *
 * Returns `canSignPsbt: false` if the user is not logged in or their signer
 * doesn't support `signPsbt` (shouldn't happen with the Btc-extended signers,
 * but is a safety guard for unexpected signer types).
 */
export function useBitcoinSigner() {
  const { user } = useCurrentUser();

  const btcSigner = useMemo((): BtcSigner | null => {
    if (!user) return null;
    if (hasBtcSigning(user.signer)) return user.signer;
    return null;
  }, [user]);

  return {
    /** Whether the current user's signer supports Bitcoin PSBT signing. */
    canSignPsbt: btcSigner !== null,
    /**
     * Sign a hex-encoded PSBT. Throws if the signer doesn't support it.
     * The returned hex is a signed (but not finalized) PSBT.
     */
    signPsbt: btcSigner
      ? (psbtHex: string) => btcSigner.signPsbt(psbtHex)
      : null,
  };
}
