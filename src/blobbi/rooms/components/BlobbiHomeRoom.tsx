// src/blobbi/rooms/components/BlobbiHomeRoom.tsx

/**
 * BlobbiHomeRoom — The main living / play room.
 *
 * Layout:
 * - BlobbiRoomHero (stats crown, Blobbi visual, name)
 * - Bottom center: horizontal carousel with toys + music + sing entries
 * - Bottom right: lamp (sleep/wake toggle)
 * - Bottom left: empty for now
 * - Below hero: photo (left) + companion toggle (right)
 *
 * Inline activity (music player, sing card) renders between hero and bottom bar.
 */

import { useMemo } from 'react';
import { Camera, Footprints, Loader2, Sun, Lamp, Music, Mic } from 'lucide-react';

import { cn } from '@/lib/utils';
import { getLiveShopItems } from '@/blobbi/shop/lib/blobbi-shop-items';
import { InlineMusicPlayer, InlineSingCard } from '@/blobbi/actions';
import type { BlobbiRoomContext } from '../lib/room-types';
import { BlobbiRoomHero } from './BlobbiRoomHero';

interface BlobbiHomeRoomProps {
  ctx: BlobbiRoomContext;
}

export function BlobbiHomeRoom({ ctx }: BlobbiHomeRoomProps) {
  const {
    isEgg,
    isSleeping,
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
    // Rest
    onRest,
    actionInProgress,
    isPublishing,
  } = ctx;

  // Toys from shop catalog
  const toyItems = useMemo(() =>
    getLiveShopItems().filter(i => i.type === 'toy'),
  []);

  const isDisabled = isPublishing || actionInProgress !== null || isUsingItem;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Hero (Blobbi + stats) ── */}
      <BlobbiRoomHero ctx={ctx} className="flex-1 min-h-0" />

      {/* ── Action circles — Photo (left) + Companion (right) ── */}
      {!isActiveFloatingCompanion && (
        <div className="relative z-10 w-full px-4 sm:px-8 -mt-10 flex items-start justify-between">
          {/* Photo */}
          <button
            onClick={() => setShowPhotoModal(true)}
            className={cn(
              'flex flex-col items-center gap-1.5 transition-all duration-300 ease-out',
              'hover:-translate-y-1 hover:scale-110 active:scale-95',
            )}
          >
            <div
              className="size-20 sm:size-24 rounded-full flex items-center justify-center text-pink-500"
              style={{
                background: 'radial-gradient(circle at 40% 35%, color-mix(in srgb, #ec4899 14%, transparent), color-mix(in srgb, #ec4899 4%, transparent) 70%)',
              }}
            >
              <Camera className="size-9 sm:size-10" />
            </div>
            <span className="text-xs font-medium text-muted-foreground">Photo</span>
          </button>

          {/* Companion toggle */}
          {canBeCompanion && (
            <button
              onClick={handleSetAsCompanion}
              disabled={isUpdatingCompanion}
              className={cn(
                'flex flex-col items-center gap-1.5 transition-all duration-300 ease-out',
                'hover:-translate-y-1 hover:scale-110 active:scale-95',
                isUpdatingCompanion && 'opacity-50',
              )}
            >
              <div
                className={cn('size-20 sm:size-24 rounded-full flex items-center justify-center', isCurrentCompanion ? 'text-emerald-500' : 'text-violet-500')}
                style={{
                  background: isCurrentCompanion
                    ? 'radial-gradient(circle at 40% 35%, color-mix(in srgb, #10b981 14%, transparent), color-mix(in srgb, #10b981 4%, transparent) 70%)'
                    : 'radial-gradient(circle at 40% 35%, color-mix(in srgb, #8b5cf6 14%, transparent), color-mix(in srgb, #8b5cf6 4%, transparent) 70%)',
                }}
              >
                {isUpdatingCompanion ? (
                  <Loader2 className="size-9 sm:size-10 animate-spin" />
                ) : (
                  <Footprints className="size-9 sm:size-10" />
                )}
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {isCurrentCompanion ? 'With you' : 'Take along'}
              </span>
            </button>
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

      {/* ── Bottom Action Bar ── */}
      {!isActiveFloatingCompanion && (
        <div className="relative z-10 px-3 sm:px-4 pb-4 pt-2">
          <div className="flex items-end">
            {/* Bottom left — empty for now */}
            <div className="w-16 shrink-0" />

            {/* Center: horizontal carousel — toys + music + sing */}
            <div className="flex-1 min-w-0 overflow-x-auto scrollbar-none">
              <div className="flex items-center justify-center gap-2 px-2">
                {/* Toy items */}
                {toyItems.map(item => {
                  const isThisUsing = isUsingItem && usingItemId === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleUseItemFromTab(item.id)}
                      disabled={isDisabled}
                      className={cn(
                        'relative flex flex-col items-center gap-0.5 py-2 px-2 rounded-2xl transition-all duration-200 shrink-0',
                        'hover:bg-accent/50 hover:-translate-y-0.5 active:scale-[0.93]',
                        isThisUsing && 'bg-accent/40',
                        isDisabled && !isThisUsing && 'opacity-40 pointer-events-none',
                      )}
                    >
                      <span className="text-3xl leading-none">{item.icon}</span>
                      <span className="text-[10px] text-muted-foreground font-medium truncate max-w-[3.5rem]">{item.name}</span>
                      {isThisUsing && <Loader2 className="size-3 animate-spin text-primary absolute bottom-0.5" />}
                    </button>
                  );
                })}

                {/* Music action */}
                <button
                  onClick={() => handleDirectAction('play_music')}
                  disabled={isDisabled}
                  className={cn(
                    'flex flex-col items-center gap-0.5 py-2 px-2 rounded-2xl transition-all duration-200 shrink-0',
                    'hover:bg-accent/50 hover:-translate-y-0.5 active:scale-[0.93]',
                    isDisabled && 'opacity-40 pointer-events-none',
                  )}
                >
                  <div className="size-10 rounded-full flex items-center justify-center bg-pink-500/10 text-pink-500">
                    <Music className="size-5" />
                  </div>
                  <span className="text-[10px] text-muted-foreground font-medium">Music</span>
                </button>

                {/* Sing action */}
                <button
                  onClick={() => handleDirectAction('sing')}
                  disabled={isDisabled}
                  className={cn(
                    'flex flex-col items-center gap-0.5 py-2 px-2 rounded-2xl transition-all duration-200 shrink-0',
                    'hover:bg-accent/50 hover:-translate-y-0.5 active:scale-[0.93]',
                    isDisabled && 'opacity-40 pointer-events-none',
                  )}
                >
                  <div className="size-10 rounded-full flex items-center justify-center bg-purple-500/10 text-purple-500">
                    <Mic className="size-5" />
                  </div>
                  <span className="text-[10px] text-muted-foreground font-medium">Sing</span>
                </button>
              </div>
            </div>

            {/* Bottom right — Lamp (sleep/wake) */}
            {!isEgg && (
              <div className="w-16 shrink-0 flex justify-end">
                <button
                  onClick={onRest}
                  disabled={isDisabled}
                  className={cn(
                    'flex flex-col items-center gap-1 transition-all duration-300 ease-out',
                    'hover:-translate-y-1 hover:scale-110 active:scale-95',
                    isDisabled && 'opacity-40 pointer-events-none',
                  )}
                >
                  <div className={cn(
                    'size-12 rounded-full flex items-center justify-center',
                    isSleeping ? 'bg-amber-500/10 text-amber-500' : 'bg-violet-500/10 text-violet-500',
                  )}>
                    {actionInProgress === 'rest' ? (
                      <Loader2 className="size-6 animate-spin" />
                    ) : isSleeping ? (
                      <Sun className="size-6" />
                    ) : (
                      <Lamp className="size-6" />
                    )}
                  </div>
                  <span className={cn(
                    'text-[10px] font-medium',
                    isSleeping ? 'text-amber-500' : 'text-muted-foreground',
                  )}>
                    {isSleeping ? 'Wake' : 'Light'}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
