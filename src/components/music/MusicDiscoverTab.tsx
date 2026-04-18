import { useState, useMemo } from 'react';
import { Music } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { parseMusicTrack } from '@/lib/musicHelpers';
import { getExtraKindDef } from '@/lib/extraKinds';
import { DITTO_RELAYS } from '@/lib/appRelays';
import { useCuratedMusicArtists } from '@/hooks/useCuratedMusicArtists';
import { useFeaturedMusicTracks } from '@/hooks/useFeaturedMusicTracks';
import { useMusicCuratorFollows } from '@/hooks/useMusicCuratorFollows';
import { useMusicData } from '@/hooks/useMusicData';
import { useMusicPlaylists } from '@/hooks/useMusicPlaylists';
import { useFollowList } from '@/hooks/useFollowActions';
import { SectionHeader } from '@/components/discovery/SectionHeader';
import { HorizontalScroll } from '@/components/discovery/HorizontalScroll';
import { TagChips } from '@/components/discovery/TagChips';
import { ProfileCard, ProfileCardSkeleton } from '@/components/discovery/ProfileCard';
import { ContentCTACard } from '@/components/discovery/ContentCTACard';
import { MusicSortFilterBar, type MusicSort, type MusicScope } from './MusicSortFilterBar';
import { MusicHeroCard, MusicHeroCardSkeleton } from './MusicHeroCard';
import { MusicTrackCard, MusicTrackCardSkeleton } from './MusicTrackCard';
import { MusicTrackRow, MusicTrackRowSkeleton } from './MusicTrackRow';
import { MusicPlaylistCard, MusicPlaylistCardSkeleton } from './MusicPlaylistCard';

const musicDef = getExtraKindDef('music')!;

interface MusicDiscoverTabProps {
  /** Switch to the Tracks tab. */
  onSwitchToTracks: () => void;
  /** Switch to the Playlists tab. */
  onSwitchToPlaylists: () => void;
  /** Switch to the Artists tab. */
  onSwitchToArtists: () => void;
}

/**
 * The "Discover" tab — the curator's storefront for music discovery.
 *
 * All content is gated through the curator's lists:
 * - Hero + Featured: Hot tracks from curated artists, one per artist (sort:hot distinct:author)
 * - New Tracks: Most recent tracks from curated artists, genre-filterable
 * - Playlists: Playlists from people the curator follows
 * - Artists: Curated artist profile cards
 *
 * Sections (top to bottom):
 * 1. Hero card — #1 hot track from curated artists
 * 2. Featured — Horizontal scroll of next-hottest tracks (one per artist)
 * 3. Artists — Horizontal scroll of curated artist profile cards
 * 4. Playlists — Horizontal scroll of playlists from curator's follows (sort:hot)
 * 5. New Tracks header + sort/scope bar + genre chips
 * 6. New Tracks — Compact track rows with Hot/Top/New sort and Global/Following scope
 * 7. CTA — "Share Your Music on Nostr" card
 */
export function MusicDiscoverTab({ onSwitchToTracks, onSwitchToPlaylists, onSwitchToArtists }: MusicDiscoverTabProps) {
  const { nostr } = useNostr();
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [newTracksSort, setNewTracksSort] = useState<MusicSort>('hot');
  const [newTracksScope, setNewTracksScope] = useState<MusicScope>('global');

  // Curated artist list (from curator's kind 30000 Listr list)
  const { data: curatedPubkeys } = useCuratedMusicArtists();

  // Featured tracks: hot tracks from curated artists, one per artist
  // Index 0 = hero (#1 hot track), rest = Featured horizontal scroll
  const { data: featuredTracks, isLoading: isFeaturedLoading } = useFeaturedMusicTracks(curatedPubkeys);

  // Hero track: the #1 hot track from curated artists
  const heroTrack = featuredTracks?.[0] ?? null;

  // User's follow list (for Following scope)
  const { data: followData } = useFollowList();
  const followPubkeys = followData?.pubkeys;

  // Determine which authors to query for the New Tracks section
  const newTracksAuthors = newTracksScope === 'following' ? followPubkeys : curatedPubkeys;

  // Base music data from curated artists only: genres, artist stats (always curated)
  const {
    tracks: curatedTracks,
    genres,
    artists,
    isLoading: isTracksLoading,
  } = useMusicData({ authors: curatedPubkeys });

  // New Tracks: sorted query for hot/top via Ditto relay, or chronological for new
  const { data: sortedNewTracks, isLoading: isSortedLoading, isError: isSortedError } = useQuery<NostrEvent[]>({
    queryKey: ['discover-new-tracks', newTracksSort, newTracksScope, newTracksAuthors?.slice().sort().join(',') ?? '', selectedGenre ?? ''],
    queryFn: async ({ signal }) => {
      if (!newTracksAuthors || newTracksAuthors.length === 0) return [];

      const filter: Record<string, unknown> = {
        kinds: [36787],
        authors: newTracksAuthors,
        limit: 20,
      };
      if (selectedGenre) {
        filter['#t'] = [selectedGenre];
      }

      const timeout = AbortSignal.any([signal, AbortSignal.timeout(10000)]);

      let events: NostrEvent[];
      if (newTracksSort === 'new') {
        events = await nostr.query(
          [filter as { kinds: number[]; authors: string[]; limit: number; '#t'?: string[] }],
          { signal: timeout },
        );
      } else {
        filter.search = `sort:${newTracksSort}`;
        const ditto = nostr.group(DITTO_RELAYS);
        events = await ditto.query(
          [filter as { kinds: number[]; authors: string[]; search: string; limit: number; '#t'?: string[] }],
          { signal: timeout },
        );

        // Fallback: if hot/top returned nothing, retry chronologically
        if (events.length === 0) {
          delete filter.search;
          events = await nostr.query(
            [filter as { kinds: number[]; authors: string[]; limit: number; '#t'?: string[] }],
            { signal: timeout },
          );
        }
      }

      return events.filter((ev) => parseMusicTrack(ev) !== null).slice(0, 8);
    },
    enabled: !!newTracksAuthors && newTracksAuthors.length > 0,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  const newTracks = sortedNewTracks ?? [];
  const isNewTracksLoading = isSortedLoading && !sortedNewTracks;

  // Curator's follow list (Heather's kind 3) — used to filter playlists
  const { data: curatorFollows } = useMusicCuratorFollows();

  // Playlists from people the curator follows, sorted by hot
  const { data: playlists, isLoading: isPlaylistsLoading } = useMusicPlaylists({
    authors: curatorFollows,
    search: 'sort:hot',
    limit: 10,
    enabled: !!curatorFollows && curatorFollows.length > 0,
  });

  // Top genre names for chips (max 12)
  const genreNames = useMemo(() => genres.slice(0, 12).map((g) => g.genre), [genres]);

  // Featured artists: curated pubkeys with their track counts
  const featuredArtists = useMemo(() => {
    if (curatedPubkeys && curatedPubkeys.length > 0) {
      const trackCounts = new Map<string, number>();
      for (const ev of curatedTracks) {
        trackCounts.set(ev.pubkey, (trackCounts.get(ev.pubkey) ?? 0) + 1);
      }
      return curatedPubkeys.slice(0, 10).map((pk) => ({
        pubkey: pk,
        trackCount: trackCounts.get(pk) ?? 0,
      }));
    }
    return artists.slice(0, 10);
  }, [curatedPubkeys, artists, curatedTracks]);

  return (
    <div className="pb-8 space-y-1">
      {/* Hero — #1 hot track from curated artists */}
      {isFeaturedLoading ? (
        <div className="pt-3">
          <MusicHeroCardSkeleton />
        </div>
      ) : heroTrack ? (
        <div className="pt-3">
          <MusicHeroCard event={heroTrack} />
        </div>
      ) : null}

      {/* Featured tracks horizontal scroll (hot, one per artist) */}
      {isFeaturedLoading ? (
        <>
          <SectionHeader title="Featured" />
          <HorizontalScroll>
            {Array.from({ length: 4 }).map((_, i) => (
              <MusicTrackCardSkeleton key={i} />
            ))}
          </HorizontalScroll>
        </>
      ) : featuredTracks && featuredTracks.length > 1 ? (
        <>
          <SectionHeader title="Featured" onSeeAll={onSwitchToTracks} />
          <HorizontalScroll>
            {featuredTracks.slice(1, 8).map((ev) => (
              <MusicTrackCard key={ev.id} event={ev} />
            ))}
          </HorizontalScroll>
        </>
      ) : null}

      {/* Artists horizontal scroll */}
      {(isTracksLoading || featuredArtists.length > 0) && (
        <>
          <SectionHeader title="Artists" onSeeAll={onSwitchToArtists} />
          {isTracksLoading ? (
            <HorizontalScroll>
              {Array.from({ length: 5 }).map((_, i) => (
                <ProfileCardSkeleton key={i} />
              ))}
            </HorizontalScroll>
          ) : (
            <HorizontalScroll>
              {featuredArtists.map((a) => (
                <ProfileCard
                  key={a.pubkey}
                  pubkey={a.pubkey}
                  subtitle={a.trackCount > 0 ? `${a.trackCount} track${a.trackCount !== 1 ? 's' : ''}` : undefined}
                />
              ))}
            </HorizontalScroll>
          )}
        </>
      )}

      {/* Playlists — from people the curator follows, sorted by hot */}
      {(isPlaylistsLoading || (playlists && playlists.length > 0)) && (
        <>
          <SectionHeader title="Playlists" onSeeAll={onSwitchToPlaylists} />
          {isPlaylistsLoading ? (
            <HorizontalScroll>
              {Array.from({ length: 3 }).map((_, i) => (
                <MusicPlaylistCardSkeleton key={i} />
              ))}
            </HorizontalScroll>
          ) : (
            <HorizontalScroll>
              {playlists!.slice(0, 6).map((ev) => (
                <MusicPlaylistCard key={ev.id} event={ev} />
              ))}
            </HorizontalScroll>
          )}
        </>
      )}

      {/* New Tracks — sort/scope filterable */}
      <SectionHeader title="New Tracks" onSeeAll={onSwitchToTracks} />

      <MusicSortFilterBar
        sort={newTracksSort}
        scope={newTracksScope}
        onSortChange={setNewTracksSort}
        onScopeChange={setNewTracksScope}
      />

      {/* Genre chips */}
      {genreNames.length > 0 && (
        <TagChips
          tags={genreNames}
          selected={selectedGenre}
          onSelect={setSelectedGenre}
        />
      )}
      {isSortedError ? (
        <p className="px-4 py-6 text-sm text-muted-foreground text-center">
          Failed to load tracks. Check your relay connections and try again.
        </p>
      ) : isNewTracksLoading ? (
        <div>
          {Array.from({ length: 5 }).map((_, i) => (
            <MusicTrackRowSkeleton key={i} />
          ))}
        </div>
      ) : newTracks.length > 0 ? (
        <div>
          {newTracks.map((ev, i) => (
            <MusicTrackRow key={ev.id} event={ev} index={i} />
          ))}
        </div>
      ) : (
        <p className="px-4 py-6 text-sm text-muted-foreground text-center">
          {newTracksScope === 'following'
            ? 'No tracks from people you follow yet.'
            : selectedGenre ? `No ${selectedGenre} tracks found.` : 'No music yet. Check back soon!'}
        </p>
      )}

      {/* CTA */}
      <div className="pt-4">
        <ContentCTACard
          kindDef={musicDef}
          title="Share Your Music on Nostr"
          subtitle="Upload tracks and reach a global audience. Earn sats directly from fans."
          icon={<Music className="size-10" />}
        />
      </div>
    </div>
  );
}
