import { useState, useMemo } from 'react';
import { Music } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { parseMusicTrack } from '@/lib/musicHelpers';
import { getExtraKindDef } from '@/lib/extraKinds';
import { useCuratedMusicArtists } from '@/hooks/useCuratedMusicArtists';
import { useFeaturedMusicTracks } from '@/hooks/useFeaturedMusicTracks';
import { useMusicCuratorFollows } from '@/hooks/useMusicCuratorFollows';
import { useMusicData, useMusicTracksByGenre } from '@/hooks/useMusicData';
import { useMusicPlaylists } from '@/hooks/useMusicPlaylists';
import { SectionHeader } from '@/components/discovery/SectionHeader';
import { HorizontalScroll } from '@/components/discovery/HorizontalScroll';
import { TagChips } from '@/components/discovery/TagChips';
import { ProfileCard, ProfileCardSkeleton } from '@/components/discovery/ProfileCard';
import { ContentCTACard } from '@/components/discovery/ContentCTACard';
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
 * 5. Genre chips — Filter for the "New Tracks" section
 * 6. New Tracks — Compact track rows from curated artists (genre-filterable)
 * 7. CTA — "Share Your Music on Nostr" card
 */
export function MusicDiscoverTab({ onSwitchToTracks, onSwitchToPlaylists, onSwitchToArtists }: MusicDiscoverTabProps) {
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);

  // Curated artist list (from curator's kind 30000 Listr list)
  const { data: curatedPubkeys } = useCuratedMusicArtists();

  // Featured tracks: hot tracks from curated artists, one per artist
  // Index 0 = hero (#1 hot track), rest = Featured horizontal scroll
  const { data: featuredTracks, isLoading: isFeaturedLoading } = useFeaturedMusicTracks(curatedPubkeys);

  // Hero track: the #1 hot track from curated artists
  const heroTrack = featuredTracks?.[0] ?? null;

  // Base music data from curated artists only: tracks, genres, artist stats
  const {
    tracks: curatedTracks,
    genres,
    artists,
    isLoading: isTracksLoading,
  } = useMusicData({ authors: curatedPubkeys });

  // Genre-filtered tracks (also curated-only)
  const { data: genreFilteredTracks } = useMusicTracksByGenre(selectedGenre, {
    authors: curatedPubkeys,
  });

  const newTracks = useMemo((): NostrEvent[] => {
    if (selectedGenre && genreFilteredTracks) {
      return genreFilteredTracks
        .filter((ev) => parseMusicTrack(ev) !== null)
        .slice(0, 8);
    }
    return curatedTracks.slice(0, 8);
  }, [selectedGenre, genreFilteredTracks, curatedTracks]);

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
      {featuredTracks && featuredTracks.length > 1 && (
        <>
          <SectionHeader title="Featured" onSeeAll={onSwitchToTracks} />
          <HorizontalScroll>
            {featuredTracks.slice(1, 8).map((ev) => (
              <MusicTrackCard key={ev.id} event={ev} />
            ))}
          </HorizontalScroll>
        </>
      )}

      {/* Loading state for featured */}
      {isFeaturedLoading && (
        <>
          <SectionHeader title="Featured" />
          <HorizontalScroll>
            {Array.from({ length: 4 }).map((_, i) => (
              <MusicTrackCardSkeleton key={i} />
            ))}
          </HorizontalScroll>
        </>
      )}

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

      {/* Genre chips */}
      {genreNames.length > 0 && (
        <TagChips
          tags={genreNames}
          selected={selectedGenre}
          onSelect={setSelectedGenre}
        />
      )}

      {/* New Tracks — curated artists only, genre-filterable */}
      <SectionHeader title="New Tracks" onSeeAll={onSwitchToTracks} />
      {isTracksLoading ? (
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
          {selectedGenre ? `No ${selectedGenre} tracks found.` : 'No music yet. Check back soon!'}
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
