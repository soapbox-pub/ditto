// src/blobbi/rooms/components/BlobbiHomeRoom.tsx

/**
 * BlobbiHomeRoom — The main living / play room.
 *
 * Layout:
 * - BlobbiRoomHero (stats crown, Blobbi visual, name)
 * - Photo button (left) + Companion toggle (right) — same style as original
 * - Center: single-focus carousel with toys + music + sing
 * - Inline activity (music player, sing card) between hero and bottom bar
 *
 * Sleep/wake has been moved to BlobbiRestRoom.
 */

import { useMemo } from 'react';
import { Camera, Footprints, Music, Mic } from 'lucide-react';

import { getLiveShopItems } from '@/blobbi/shop/lib/blobbi-shop-items';
import { InlineMusicPlayer, InlineSingCard } from '@/blobbi/actions';
import type { BlobbiRoomContext } from '../lib/room-types';
import { BlobbiRoomHero } from './BlobbiRoomHero';
import { RoomActionButton } from './RoomActionButton';
import { ItemCarousel, type CarouselEntry } from './ItemCarousel';

interface BlobbiHomeRoomProps {
  ctx: BlobbiRoomContext;
}

export function BlobbiHomeRoom({ ctx }: BlobbiHomeRoomProps) {
  const {
    isActiveFloatingCompanion,
    // Photo
    setShowPhotoModal,
    // Companion
    isCurrentCompanion,
    canBeCompanion,
    isUpdatingCompanion,
    handleSetAsCompanion,
    // Items + actions
    isUsingItem,
    usingItemId,
    handleUseItemFromTab,
    handleDirectAction,
    isDirectActionPending,
    // Inline activity
    inlineActivity,
    handleConfirmSing,
    handleCloseInlineActivity,
    handleMusicPlaybackStart,
    handleMusicPlaybackStop,
    handleSingRecordingStart,
    handleSingRecordingStop,
    handleChangeTrack,
    // State
    isPublishing,
    actionInProgress,
  } = ctx;

  // Build carousel entries: toys + music + sing
  const carouselItems = useMemo<CarouselEntry[]>(() => {
    const toys = getLiveShopItems()
      .filter(i => i.type === 'toy')
      .map(i => ({ id: i.id, icon: <span>{i.icon}</span>, label: i.name }));

    const actions: CarouselEntry[] = [
      {
        id: '__action_music',
        icon: <div className="size-12 rounded-full flex items-center justify-center bg-pink-500/15 text-pink-500"><Music className="size-6" /></div>,
        label: 'Music',
      },
      {
        id: '__action_sing',
        icon: <div className="size-12 rounded-full flex items-center justify-center bg-purple-500/15 text-purple-500"><Mic className="size-6" /></div>,
        label: 'Sing',
      },
    ];

    return [...toys, ...actions];
  }, []);

  const isDisabled = isPublishing || actionInProgress !== null || isUsingItem;

  const handleCarouselUse = (id: string) => {
    if (id === '__action_music') {
      handleDirectAction('play_music');
    } else if (id === '__action_sing') {
      handleDirectAction('sing');
    } else {
      handleUseItemFromTab(id);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Hero (Blobbi + stats) ── */}
      <BlobbiRoomHero ctx={ctx} className="flex-1 min-h-0" />

      {/* ── Action circles — Photo (left) + Companion (right) ── */}
      {!isActiveFloatingCompanion && (
        <div className="relative z-10 w-full px-4 sm:px-8 -mt-10 flex items-start justify-between">
          {/* Photo */}
          <RoomActionButton
            icon={<Camera className="size-9 sm:size-10" />}
            label="Photo"
            color="text-pink-500"
            glowHex="#ec4899"
            onClick={() => setShowPhotoModal(true)}
          />

          {/* Companion toggle */}
          {canBeCompanion && (
            <RoomActionButton
              icon={<Footprints className="size-9 sm:size-10" />}
              label={isCurrentCompanion ? 'With you' : 'Take along'}
              color={isCurrentCompanion ? 'text-emerald-500' : 'text-violet-500'}
              glowHex={isCurrentCompanion ? '#10b981' : '#8b5cf6'}
              onClick={handleSetAsCompanion}
              disabled={isUpdatingCompanion}
              loading={isUpdatingCompanion}
            />
          )}
        </div>
      )}

      {/* ── Inline Activity Area (music/sing) ── */}
      {inlineActivity.type === 'music' && (
        <div className="px-4 sm:px-6 pb-2">
          <InlineMusicPlayer
            selection={inlineActivity.selection}
            onChangeTrack={handleChangeTrack}
            onClose={handleCloseInlineActivity}
            onPlaybackStart={handleMusicPlaybackStart}
            onPlaybackStop={handleMusicPlaybackStop}
            isPublished={inlineActivity.isPublished}
            isPublishing={isDirectActionPending}
          />
        </div>
      )}
      {inlineActivity.type === 'sing' && (
        <div className="px-4 sm:px-6 pb-2">
          <InlineSingCard
            onConfirm={handleConfirmSing}
            onClose={handleCloseInlineActivity}
            onRecordingStart={handleSingRecordingStart}
            onRecordingStop={handleSingRecordingStop}
            isPublishing={isDirectActionPending}
          />
        </div>
      )}

      {/* ── Bottom: Single-focus carousel ── */}
      {!isActiveFloatingCompanion && (
        <div className="relative z-10 px-2 pb-4 pt-2">
          <ItemCarousel
            items={carouselItems}
            onUse={handleCarouselUse}
            activeItemId={isUsingItem ? usingItemId : null}
            disabled={isDisabled}
          />
        </div>
      )}
    </div>
  );
}
