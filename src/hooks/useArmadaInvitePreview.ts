import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { bytesToHex } from '@noble/hashes/utils';
import {
  decodeInviteBundle,
  decodeInviteFragment,
  INVITE_BUNDLE_KIND,
  type ArmadaInvite,
  type ArmadaInvitePreview,
} from '@/lib/armadaInvite';

/**
 * Resolve the public preview (name, icon, channel count) of an Armada/Concord
 * encrypted community invite. Requires the invite's `#fragment` secret to
 * NIP-44-decrypt the bundle, so it no-ops for a fragment-less link (e.g. a
 * naddr opened directly on a detail page).
 *
 * The bundle lives at the coordinate `(kind 33301, link_signer, d="")`. We
 * query the fragment's bootstrap relays first (they always host it), falling
 * back to the app pool, take the newest event at the coordinate, and decrypt.
 */
export function useArmadaInvitePreview(invite: ArmadaInvite | undefined) {
  const { nostr } = useNostr();

  const decoded = useMemo(
    () => (invite && !invite.missingSecret ? decodeInviteFragment(invite.fragment) : undefined),
    [invite],
  );

  const tokenHex = decoded ? bytesToHex(decoded.token) : '';

  return useQuery<ArmadaInvitePreview | null>({
    queryKey: ['armada-invite-preview', invite?.linkSigner ?? '', tokenHex],
    enabled: !!invite && !!decoded,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    queryFn: async (c) => {
      if (!invite || !decoded) return null;

      const relays = decoded.relays.filter((r) => /^wss:\/\//i.test(r));
      const conn = relays.length ? nostr.group(relays) : nostr;

      const events = await conn.query(
        [{ kinds: [INVITE_BUNDLE_KIND], authors: [invite.linkSigner], '#d': [''], limit: 1 }],
        { signal: c.signal },
      );
      if (!events.length) return null;

      // Newest at the coordinate wins (a refresh replaces the bundle).
      const newest = events.sort((a, b) => b.created_at - a.created_at)[0];
      return decodeInviteBundle(newest, invite.linkSigner, decoded.token) ?? null;
    },
  });
}
