import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useInView } from 'react-intersection-observer';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, ImageIcon } from 'lucide-react';
import { Blurhash } from 'react-blurhash';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { PullToRefresh } from '@/components/PullToRefresh';
import { KindInfoButton } from '@/components/KindInfoButton';
import { useOnboarding } from '@/components/InitialSyncGate';
import LoginDialog from '@/components/auth/LoginDialog';
import { useFeed } from '@/hooks/useFeed';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useAppContext } from '@/hooks/useAppContext';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { getExtraKindDef } from '@/lib/extraKinds';
import { sidebarItemIcon } from '@/lib/sidebarItems';
import { cn } from '@/lib/utils';
import { useBlossomFallback } from '@/hooks/useBlossomFallback';

const PICTURE_KIND = 20;
const picturesDef = getExtraKindDef('pictures')!;

type PicturesTab = 'follows' | 'global';

// ── Imeta helpers ─────────────────────────────────────────────────────────────

interface PictureTileData {
  event: NostrEvent;
  imageUrl: string;
  blurhash?: string;
  dim?: string;
  title?: string;
}

/** Extract the first image URL + metadata from a kind 20 event's imeta tags. */
function extractFirstImage(event: NostrEvent): PictureTileData | null {
  for (const tag of event.tags) {
    if (tag[0] !== 'imeta') continue;
    const entry: Record<string, string> = {};
    for (let i = 1; i < tag.length; i++) {
      const part = tag[i];
      const spaceIdx = part.indexOf(' ');
      if (spaceIdx === -1) continue;
      entry[part.slice(0, spaceIdx)] = part.slice(spaceIdx + 1);
    }
    const mime = entry.m ?? '';
    const isImage = !mime || mime.startsWith('image/');
    if (entry.url && isImage) {
      return {
        event,
        imageUrl: entry.url,
        blurhash: entry.blurhash,
        dim: entry.dim,
        title: event.tags.find(([n]) => n === 'title')?.[1],
      };
    }
  }
  return null;
}

// ── Page component ────────────────────────────────────────────────────────────

export function PicturesFeedPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { muteItems } = useMuteList();
  const queryClient = useQueryClient();
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const { startSignup } = useOnboarding();

  useSeoMeta({ title: `Pictures | ${config.appName}`, description: 'Picture posts on Nostr' });
  useLayoutOptions({ showFAB: false });

  const [activeTab, setActiveTab] = useState<PicturesTab>(user ? 'follows' : 'global');

  useEffect(() => {
    if (user) setActiveTab('follows');
  }, [user]);

  const feedQuery = useFeed(activeTab, { kinds: [PICTURE_KIND] });

  const {
    data: rawData,
    isPending,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = feedQuery;

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['feed', activeTab] });
  }, [queryClient, activeTab]);

  // Infinite scroll
  const { ref: scrollRef, inView } = useInView({ threshold: 0, rootMargin: '400px' });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Auto-fetch page 2
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && rawData?.pages?.length === 1) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, rawData?.pages?.length, fetchNextPage]);

  // Flatten, deduplicate, filter muted, extract tile data
  const tiles = useMemo(() => {
    if (!rawData?.pages) return [];
    const seen = new Set<string>();
    const result: PictureTileData[] = [];
    for (const page of rawData.pages) {
      for (const item of page.items) {
        if (seen.has(item.event.id)) continue;
        seen.add(item.event.id);
        if (isEventMuted(item.event, muteItems)) continue;
        const tile = extractFirstImage(item.event);
        if (tile) result.push(tile);
      }
    }
    return result;
  }, [rawData?.pages, muteItems]);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 px-4 mt-4 mb-5">
          <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {sidebarItemIcon('pictures', 'size-5')}
            <h1 className="text-xl font-bold">Pictures</h1>
          </div>
          {picturesDef && <KindInfoButton kindDef={picturesDef} icon={sidebarItemIcon('pictures', 'size-5')} />}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border mb-4">
          {user && (
            <button
              onClick={() => setActiveTab('follows')}
              className={cn(
                'flex-1 py-3 text-sm font-medium text-center transition-colors relative',
                activeTab === 'follows' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Follows
              {activeTab === 'follows' && <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-primary rounded-full" />}
            </button>
          )}
          <button
            onClick={() => {
              if (!user) {
                setLoginDialogOpen(true);
                return;
              }
              setActiveTab('global');
            }}
            className={cn(
              'flex-1 py-3 text-sm font-medium text-center transition-colors relative',
              activeTab === 'global' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Global
            {activeTab === 'global' && <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-primary rounded-full" />}
          </button>
        </div>

        {/* Grid */}
        {isPending || isLoading ? (
          <div className="grid grid-cols-3 gap-0.5 px-0.5">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-none" />
            ))}
          </div>
        ) : tiles.length === 0 ? (
          <div className="text-center py-16 px-4">
            <ImageIcon className="size-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">
              No pictures yet. Check back soon!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-0.5 px-0.5">
            {tiles.map((tile) => (
              <PictureTile key={tile.event.id} tile={tile} />
            ))}
          </div>
        )}

        {/* Infinite scroll trigger */}
        <div ref={scrollRef} className="h-16 flex items-center justify-center">
          {isFetchingNextPage && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
        </div>

        <LoginDialog
          isOpen={loginDialogOpen}
          onClose={() => setLoginDialogOpen(false)}
          onLogin={() => setLoginDialogOpen(false)}
          onSignupClick={startSignup}
        />
      </div>
    </PullToRefresh>
  );
}

// ── Grid tile ─────────────────────────────────────────────────────────────────

function PictureTile({ tile }: { tile: PictureTileData }) {
  const navigate = useNavigate();
  const nevent = nip19.neventEncode({ id: tile.event.id, author: tile.event.pubkey });
  const [loaded, setLoaded] = useState(false);
  const { src: imgSrc, onError: imgOnError } = useBlossomFallback(tile.imageUrl);

  const author = useAuthor(tile.event.pubkey);
  const metadata = author.data?.metadata;
  const avatarUrl = metadata?.picture;
  const displayName = metadata?.name ?? metadata?.display_name;

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    navigate(`/${nevent}`);
  }, [navigate, nevent]);

  return (
    <a
      href={`/${nevent}`}
      onClick={handleClick}
      className="relative aspect-square overflow-hidden group cursor-pointer bg-muted"
    >
      {/* Blurhash placeholder */}
      {tile.blurhash && !loaded && (
        <div className="absolute inset-0">
          <Blurhash hash={tile.blurhash} width="100%" height="100%" />
        </div>
      )}

      {/* Image */}
      <img
        src={imgSrc}
        alt={tile.title ?? ''}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={imgOnError}
        className={cn(
          'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
      />

      {/* Multi-image indicator */}
      {tile.event.tags.filter(([n]) => n === 'imeta').length > 1 && (
        <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
          <ImageIcon className="size-3 inline-block mr-0.5" />
          {tile.event.tags.filter(([n]) => n === 'imeta').length}
        </div>
      )}

      {/* Hover overlay with author + title */}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Avatar className="size-5 shrink-0">
            <AvatarImage src={avatarUrl} />
            <AvatarFallback className="text-[8px]">
              {(displayName ?? '?')[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {displayName && (
            <span className="text-white text-xs font-medium truncate">{displayName}</span>
          )}
        </div>
        {tile.title && (
          <p className="text-white/80 text-[11px] mt-1 line-clamp-2 leading-tight">{tile.title}</p>
        )}
      </div>
    </a>
  );
}
