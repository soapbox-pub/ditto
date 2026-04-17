import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';

/**
 * Hardcoded fallback artist pubkeys used when the curator's kind 30000
 * `d:music-artists` follow set has not been published yet.
 *
 * These are verified Nostr musicians sourced from Wavlake's Top 40 chart.
 * Once the curator publishes the on-chain list, this fallback is ignored.
 */
const FALLBACK_ARTIST_PUBKEYS: string[] = [
  '5c7794d47115a1b133a19673d57346ca494d367379458d8e98bf24a498abc46b', // Annonymal
  'adc14fa3ad590856dd8b80815d367f7c1e6735ad00fd98a86d002fbe9fb535e1', // Contra
  'f2f8fabc20e2e1a4b91732c06cf9ac047478b01049c57c4a67b98ce927e5f3db', // Sovereign Diaries
  'e4c099819c82e7754d61d2e10d8487d46c7bbe2047f67f828ece2f19a75bf2bd', // EpochNative
  'e348c5e7a3f1042fe6855cae3fd50c46f3249b7c7ebfc9033895146245bbc8e0', // LoveFinger
  '7bac11d89f7ec175d427024085285f7983dc0be08540789837143b2787f81220', // Dead Reckoning Band
  'd66d8f8e9733448a219a73cebe2f0f47a23a0ec4b49014a6cb67cdf5bb361ed1', // Ardamus
  'a7692fcb12e810b26ab79d1912962233ca490948c85cb780f058d9fca1a4500e', // Basspistol
  'fad80b7451b03f686fd9e487b05b69c04c808e26a1db655e59e0e296a5c9f4dd', // Sam Means
];

/**
 * Fetches the curator's curated music artist list.
 *
 * Queries for a kind 30000 (follow set) event published by the curator pubkey
 * with `d` tag "music-artists". Returns the `p` tag pubkeys from that event.
 *
 * Falls back to a hardcoded list of known Nostr musicians if the curator
 * hasn't published the list yet.
 */
export function useCuratedMusicArtists() {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const curatorPubkey = config.curatorPubkey;

  return useQuery<string[]>({
    queryKey: ['curated-music-artists', curatorPubkey],
    queryFn: async ({ signal }) => {
      if (!curatorPubkey) return FALLBACK_ARTIST_PUBKEYS;

      const events = await nostr.query(
        [{ kinds: [30000], authors: [curatorPubkey], '#d': ['music-artists'], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );

      if (events.length === 0) return FALLBACK_ARTIST_PUBKEYS;

      const pubkeys = events[0].tags
        .filter(([name]) => name === 'p')
        .map(([, pk]) => pk);

      return pubkeys.length > 0 ? pubkeys : FALLBACK_ARTIST_PUBKEYS;
    },
    staleTime: 10 * 60 * 1000, // 10 min
    gcTime: 60 * 60 * 1000, // 1 hr
    placeholderData: FALLBACK_ARTIST_PUBKEYS,
  });
}
