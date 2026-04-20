import { useState, useCallback } from 'react';
import { Music } from 'lucide-react';
import { useSeoMeta } from '@unhead/react';
import { KindInfoButton } from '@/components/KindInfoButton';
import { PageHeader } from '@/components/PageHeader';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { TabButton } from '@/components/TabButton';
import { ARC_OVERHANG_PX } from '@/components/ArcBackground';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getExtraKindDef } from '@/lib/extraKinds';
import { sidebarItemIcon } from '@/lib/sidebarItems';
import { MusicDiscoverTab } from '@/components/music/MusicDiscoverTab';
import { MusicTracksTab } from '@/components/music/MusicTracksTab';
import { MusicPlaylistsTab } from '@/components/music/MusicPlaylistsTab';
import { MusicArtistsTab } from '@/components/music/MusicArtistsTab';

const musicDef = getExtraKindDef('music')!;

type MusicTab = 'discover' | 'tracks' | 'playlists' | 'artists';

/**
 * Dedicated music discovery page.
 *
 * Replaces the generic KindFeedPage with a tabbed layout:
 * - **Discover** (default): Curated showcase with hero, featured, genres, etc.
 * - **Tracks**: Infinite-scroll list of all music tracks with genre filter
 * - **Playlists**: Grid of music playlists
 * - **Artists**: Grid of artist profile cards
 *
 * All content is global by default. The Discover tab surfaces curated
 * content from the curator's kind 30000 `d:music-artists` follow set.
 */
export function MusicPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const [activeTab, setActiveTab] = useState<MusicTab>('discover');

  useSeoMeta({
    title: `Music | ${config.appName}`,
    description: 'Discover music on Nostr',
  });

  useLayoutOptions({ showFAB: false, hasSubHeader: !!user });

  const switchToTracks = useCallback(() => setActiveTab('tracks'), []);
  const switchToPlaylists = useCallback(() => setActiveTab('playlists'), []);
  const switchToArtists = useCallback(() => setActiveTab('artists'), []);

  return (
    <main className="flex-1 min-w-0">
      <PageHeader title="Music" icon={sidebarItemIcon('music', 'size-5')}>
        <KindInfoButton kindDef={musicDef} icon={<Music className="size-5" />} />
      </PageHeader>

      {/* Tabs */}
      <SubHeaderBar>
        <TabButton label="Discover" active={activeTab === 'discover'} onClick={() => setActiveTab('discover')} />
        <TabButton label="Tracks" active={activeTab === 'tracks'} onClick={() => setActiveTab('tracks')} />
        <TabButton label="Playlists" active={activeTab === 'playlists'} onClick={() => setActiveTab('playlists')} />
        <TabButton label="Artists" active={activeTab === 'artists'} onClick={() => setActiveTab('artists')} />
      </SubHeaderBar>
      <div style={{ height: ARC_OVERHANG_PX }} />

      {/* Tab content */}
      {activeTab === 'discover' && (
        <MusicDiscoverTab
          onSwitchToTracks={switchToTracks}
          onSwitchToPlaylists={switchToPlaylists}
          onSwitchToArtists={switchToArtists}
        />
      )}
      {activeTab === 'tracks' && <MusicTracksTab />}
      {activeTab === 'playlists' && <MusicPlaylistsTab />}
      {activeTab === 'artists' && <MusicArtistsTab />}
    </main>
  );
}
