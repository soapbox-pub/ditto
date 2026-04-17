import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

/**
 * Curated music artists list coordinates.
 *
 * Kind 30000 follow set maintained on Listr by npub1nl8r463...
 * @see https://listr.lol/npub1nl8r463jkdtr0qu0k3dht03jt9t59cttk0j8gtxg9wea2russlnq2zf9d0/30000/...
 */
const MUSIC_LIST_PUBKEY = '9fce3aea32b35637838fb45b75be32595742e16bb3e4742cc82bb3d50f9087e6';
const MUSIC_LIST_D_TAG = 'listr-ed4846ac-45f7-4f7c-90f4-d55f8f1414fd';

/**
 * Hardcoded fallback artist pubkeys used when the curated list
 * cannot be fetched from relays.
 *
 * These are a subset of the artists from the Listr-maintained list.
 */
const FALLBACK_ARTIST_PUBKEYS: string[] = [
  '28ca019b78b494c25a9da2d645975a8501c7e99b11302e5cbe748ee593fcb2cc',
  '8806372af51515bf4aef807291b96487ea1826c966a5596bca86697b5d8b23bc',
  '5c7794d47115a1b133a19673d57346ca494d367379458d8e98bf24a498abc46b',
  '312d00fab4860c967c98bb4585971ab1bef9475d51b4becbc9f313f968403f2b',
  'fad80b7451b03f686fd9e487b05b69c04c808e26a1db655e59e0e296a5c9f4dd',
  'd60b5c894df0163c9b3b1ac4e89fc94bfb6df473dbcff8c035d739f3ea8bcb59',
  '6838a529bdf33d2569e3708df6373572f11b378114d225a4d467a9bd94abef2a',
  'e61093809c30403b74392ec1853c1bc40b3364fd311fa2e5a919ef6c7e8bfde1',
  '904b0d0fc90f04f03caef2ca07ca3fdb1a5f20020090181ce8e1fcf473f7554d',
];

/**
 * Fetches the curated music artist list.
 *
 * Queries for a kind 30000 (follow set) event published by the music list
 * curator with a specific d-tag. Returns the `p` tag pubkeys from that event.
 *
 * Falls back to a hardcoded subset of artists if the list cannot be fetched.
 */
export function useCuratedMusicArtists() {
  const { nostr } = useNostr();

  return useQuery<string[]>({
    queryKey: ['curated-music-artists', MUSIC_LIST_PUBKEY, MUSIC_LIST_D_TAG],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [30000], authors: [MUSIC_LIST_PUBKEY], '#d': [MUSIC_LIST_D_TAG], limit: 1 }],
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
