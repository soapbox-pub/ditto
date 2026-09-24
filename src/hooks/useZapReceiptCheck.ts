import type { NostrEvent } from '@nostrify/nostrify';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { resolveLnurlPay, type LnurlSource } from '@/lib/lnurlPay';
import { isNostrId } from '@/lib/nostrId';
import { getStorageKey } from '@/lib/storageKey';

/** Resolve the zapper pubkey a single payment pointer advertises, if any. */
async function resolveZapper(source: LnurlSource, signal: AbortSignal): Promise<string | null> {
  const params = await resolveLnurlPay(source, AbortSignal.any([signal, AbortSignal.timeout(8000)]));
  return params.allowsNostr && isNostrId(params.nostrPubkey) ? params.nostrPubkey : null;
}

function knownZappersKey(appId: string, pubkey: string): string {
  return getStorageKey(appId, `known-zappers:${pubkey}`);
}

function readKnownZappers(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string' && isNostrId(v)) : [];
  } catch {
    return [];
  }
}

/**
 * A check for whether a kind 9735 zap receipt to `pubkey` was signed by one
 * of their lightning providers. Anyone can sign a kind 9735, so a genuine
 * receipt is one signed by the `nostrPubkey` a provider advertises (NIP-57).
 *
 * - Both `lud16` and `lud06` are resolved, since clients zap through either.
 * - Providers seen before are remembered on this device, so switching
 *   provider doesn't hide the zaps received through the old one.
 * - Receipts from an unknown signer that predate the current profile are
 *   `unverified`: they may come from a provider in use before it that this
 *   device never saw, but `created_at` is chosen by whoever signs the
 *   receipt, so they must be shown as such and never count as unread.
 *   Newer ones are `forged`.
 *
 * Every receipt is `genuine` until a provider is known (no lightning
 * address, endpoint unreachable, or zaps not supported), since there is
 * nothing to check it against. Non-zap events are always `genuine`. `key`
 * changes whenever the check does, for query keys.
 */
export type ZapReceiptVerdict = 'genuine' | 'unverified' | 'forged';

export function useZapReceiptCheck(pubkey: string | undefined): {
  checkZap: (event: NostrEvent) => ZapReceiptVerdict;
  key: string;
} {
  const { config } = useAppContext();
  const author = useAuthor(pubkey);
  const lud16 = author.data?.metadata?.lud16;
  const lud06 = author.data?.metadata?.lud06;
  const profileCreatedAt = author.data?.event?.created_at;

  const { data: zappers } = useQuery({
    queryKey: ['lnurl-zappers', pubkey ?? '', lud16 ?? '', lud06 ?? ''],
    enabled: !!pubkey && !!(lud16 || lud06),
    staleTime: 60 * 60 * 1000,
    retry: false,
    queryFn: async ({ signal }) => {
      const sources: LnurlSource[] = [];
      if (lud16) sources.push({ lud16 });
      if (lud06) sources.push({ lud06 });
      const results = await Promise.allSettled(sources.map((source) => resolveZapper(source, signal)));
      const current = results.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []));
      if (!current.length || !pubkey) return null;

      // Remember every provider seen for this account, so their receipts
      // stay valid after a switch.
      const key = knownZappersKey(config.appId, pubkey);
      const known = [...new Set([...readKnownZappers(key), ...current])];
      try {
        localStorage.setItem(key, JSON.stringify(known));
      } catch {
        // Non-critical — the current providers still apply.
      }
      return known;
    },
  });

  const zapperSet = useMemo(() => (zappers ? new Set(zappers) : undefined), [zappers]);

  const checkZap = useCallback((event: NostrEvent): ZapReceiptVerdict => {
    if (event.kind !== 9735 || !zapperSet || zapperSet.has(event.pubkey)) return 'genuine';
    return profileCreatedAt !== undefined && event.created_at < profileCreatedAt ? 'unverified' : 'forged';
  }, [zapperSet, profileCreatedAt]);

  const key = zappers ? `${zappers.slice().sort().join(',')}@${profileCreatedAt ?? 0}` : 'any';

  return { checkZap, key };
}
