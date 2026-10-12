import { useMemo } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useCuratedMusicArtists } from '@/hooks/useCuratedMusicArtists';
import { useMusicData } from '@/hooks/useMusicData';
import { ProfileCard, ProfileCardSkeleton } from '@/components/discovery/ProfileCard';

/**
 * The "Artists" tab — grid of artist profile cards.
 *
 * Shows curated artists first (with track counts), then all other
 * artists discovered from track events, sorted by track count.
 *
 * **States**:
 * - Loading: Grid of skeleton cards
 * - Empty: Centered message
 * - Loaded: Grid of profile cards with track counts
 */
export function MusicArtistsTab() {
  const intl = useIntl();
  const { data: curatedPubkeys } = useCuratedMusicArtists();
  const { artists, isLoading, isError } = useMusicData();

  // Merge curated artists (first) with discovered artists
  const allArtists = useMemo(() => {
    const trackCountMap = new Map(artists.map((a) => [a.pubkey, a.trackCount]));
    const seen = new Set<string>();
    const result: { pubkey: string; trackCount: number }[] = [];

    // Curated artists first
    if (curatedPubkeys) {
      for (const pk of curatedPubkeys) {
        if (!seen.has(pk)) {
          seen.add(pk);
          result.push({ pubkey: pk, trackCount: trackCountMap.get(pk) ?? 0 });
        }
      }
    }

    // Then discovered artists sorted by track count
    for (const a of artists) {
      if (!seen.has(a.pubkey)) {
        seen.add(a.pubkey);
        result.push(a);
      }
    }

    return result;
  }, [curatedPubkeys, artists]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-4 px-4 pt-4 pb-8">
        {Array.from({ length: 9 }).map((_, i) => (
          <ProfileCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="px-4 py-12 text-sm text-muted-foreground text-center">
        <FormattedMessage id="musicArtists.error" defaultMessage="Failed to load artists. Check your relay connections and try again." />
      </p>
    );
  }

  if (allArtists.length === 0) {
    return (
      <p className="px-4 py-12 text-sm text-muted-foreground text-center">
        <FormattedMessage id="musicArtists.empty" defaultMessage="No music artists found yet. Check back soon!" />
      </p>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4 px-4 pt-4 pb-8">
      {allArtists.map((a) => (
        <ProfileCard
          key={a.pubkey}
          pubkey={a.pubkey}
          subtitle={a.trackCount > 0
            ? intl.formatMessage({ id: 'musicArtists.trackCount', defaultMessage: '{count, plural, one {# track} other {# tracks}}' }, { count: a.trackCount })
            : undefined}
        />
      ))}
    </div>
  );
}
