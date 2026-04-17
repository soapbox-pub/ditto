import { useState, useMemo } from 'react';
import { Music } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { parseMusicTrack } from '@/lib/musicHelpers';
import { getExtraKindDef } from '@/lib/extraKinds';
import { useCuratedMusicArtists } from '@/hooks/useCuratedMusicArtists';
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
 * The "Discover" tab — the default music discovery experience.
 *
 * Sections (top to bottom):
 * 1. Hero card — Featured track from curated artists
 * 2. Featured — Horizontal scroll of tracks from curated artists
 * 3. Genre chips — Filter for the "Recently Added" section
 * 4. Recently Added — Compact track rows (genre-filterable)
 * 5. Playlists — Horizontal scroll of playlist cards
 * 6. Artists — Horizontal scroll of artist profile cards
 * 7. CTA — "Share Your Music on Nostr" card
 */
export function MusicDiscoverTab({ onSwitchToTracks, onSwitchToPlaylists, onSwitchToArtists }: MusicDiscoverTabProps) {
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);

  // Curated artist list (from curator's kind 30000 or fallback)
  const { data: curatedPubkeys } = useCuratedMusicArtists();

  // Base music data: all tracks, derived genres and artists
  const { tracks: allTracks, genres, artists, isLoading: isTracksLoading } = useMusicData();

  // Featured tracks: tracks from curated artists only
  const featuredTracks = useMemo(() => {
    if (!curatedPubkeys || !allTracks.length) return [];
    const curatedSet = new Set(curatedPubkeys);
    return allTracks
      .filter((ev) => curatedSet.has(ev.pubkey))
      .slice(0, 12);
  }, [allTracks, curatedPubkeys]);

  // Hero track: first featured track, or most recent track overall
  const heroTrack = featuredTracks[0] ?? allTracks[0] ?? null;

  // Genre-filtered tracks for "Recently Added" section
  const { data: genreFilteredTracks } = useMusicTracksByGenre(selectedGenre);

  const recentTracks = useMemo((): NostrEvent[] => {
    if (selectedGenre && genreFilteredTracks) {
      return genreFilteredTracks
        .filter((ev) => parseMusicTrack(ev) !== null)
        .slice(0, 8);
    }
    return allTracks.slice(0, 8);
  }, [selectedGenre, genreFilteredTracks, allTracks]);

  // Playlists
  const { data: playlists, isLoading: isPlaylistsLoading } = useMusicPlaylists({ limit: 10 });

  // Top genre names for chips (max 12)
  const genreNames = useMemo(() => genres.slice(0, 12).map((g) => g.genre), [genres]);

  // Featured artists: curated pubkeys or top artists by track count
  const featuredArtists = useMemo(() => {
    if (curatedPubkeys && curatedPubkeys.length > 0) {
      // Show curated artists with their track counts
      const trackCounts = new Map<string, number>();
      for (const ev of allTracks) {
        trackCounts.set(ev.pubkey, (trackCounts.get(ev.pubkey) ?? 0) + 1);
      }
      return curatedPubkeys.slice(0, 10).map((pk) => ({
        pubkey: pk,
        trackCount: trackCounts.get(pk) ?? 0,
      }));
    }
    return artists.slice(0, 10);
  }, [curatedPubkeys, artists, allTracks]);

  return (
    <div className="pb-8 space-y-1">
      {/* Hero */}
      {isTracksLoading ? (
        <div className="pt-3">
          <MusicHeroCardSkeleton />
        </div>
      ) : heroTrack ? (
        <div className="pt-3">
          <MusicHeroCard event={heroTrack} />
        </div>
      ) : null}

      {/* Featured tracks horizontal scroll */}
      {featuredTracks.length > 1 && (
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
      {isTracksLoading && (
        <>
          <SectionHeader title="Featured" />
          <HorizontalScroll>
            {Array.from({ length: 4 }).map((_, i) => (
              <MusicTrackCardSkeleton key={i} />
            ))}
          </HorizontalScroll>
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

      {/* Recently Added */}
      <SectionHeader title="Recently Added" onSeeAll={onSwitchToTracks} />
      {isTracksLoading ? (
        <div>
          {Array.from({ length: 5 }).map((_, i) => (
            <MusicTrackRowSkeleton key={i} />
          ))}
        </div>
      ) : recentTracks.length > 0 ? (
        <div>
          {recentTracks.map((ev, i) => (
            <MusicTrackRow key={ev.id} event={ev} index={i} />
          ))}
        </div>
      ) : (
        <p className="px-4 py-6 text-sm text-muted-foreground text-center">
          {selectedGenre ? `No ${selectedGenre} tracks found.` : 'No music yet. Check back soon!'}
        </p>
      )}

      {/* Playlists horizontal scroll */}
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
