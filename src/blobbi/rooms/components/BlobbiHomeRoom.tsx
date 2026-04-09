// src/blobbi/rooms/components/BlobbiHomeRoom.tsx

/**
 * BlobbiHomeRoom — The main living / play room.
 *
 * Layout:
 * - Room scene background (wall + floor with perspective)
 * - BlobbiRoomHero (stats crown, Blobbi visual, name)
 * - Unified bottom bar: Photo (left) | Carousel (center) | Companion (right)
 * - Inline activity (music player, sing card) above the bottom bar
 *
 * Sleep/wake has been moved to BlobbiRestRoom.
 */

import { useCallback, useMemo, useState } from 'react';
import { Camera, Footprints, Music, Mic, Paintbrush, Move, X, Plus } from 'lucide-react';

import { getLiveShopItems } from '@/blobbi/shop/lib/blobbi-shop-items';
import { InlineMusicPlayer, InlineSingCard } from '@/blobbi/actions';
import type { BlobbiRoomContext, RoomPoopState } from '../lib/room-types';
import { ROOM_BOTTOM_BAR_CLASS } from '../lib/room-layout';
import { BlobbiRoomHero } from './BlobbiRoomHero';
import { RoomActionButton } from './RoomActionButton';
import { ItemCarousel, type CarouselEntry } from './ItemCarousel';
import {
  RoomSceneLayer,
  useRoomScene,
  useRoomSceneEditor,
  RoomCustomizeSheet,
} from '../scene';
import { RoomItemsLayer, AddItemSheet } from '@/blobbi/house/items';
import { useRoomItemEditor } from '@/blobbi/house/hooks/useRoomItemEditor';
import type { HouseItemPosition } from '@/blobbi/house/lib/house-types';

interface BlobbiHomeRoomProps {
  ctx: BlobbiRoomContext;
  poopState: RoomPoopState;
}

export function BlobbiHomeRoom({ ctx }: BlobbiHomeRoomProps) {
  const {
    house,
    houseEvent,
    updateHouseEvent,
    isActiveFloatingCompanion,
    setShowPhotoModal,
    isCurrentCompanion,
    canBeCompanion,
    isUpdatingCompanion,
    handleSetAsCompanion,
    isUsingItem,
    usingItemId,
    handleUseItemFromTab,
    handleDirectAction,
    isDirectActionPending,
    inlineActivity,
    handleConfirmSing,
    handleCloseInlineActivity,
    handleMusicPlaybackStart,
    handleMusicPlaybackStop,
    handleSingRecordingStart,
    handleSingRecordingStop,
    handleChangeTrack,
    isPublishing,
    actionInProgress,
  } = ctx;

  // ── Room Scene (wall + floor behind Blobbi) — reads from house (kind 11127) ──
  const roomScene = useRoomScene('home', houseEvent?.content ?? '');

  // ── Room Customization Editor — writes to house (kind 11127) ──
  const [showCustomize, setShowCustomize] = useState(false);
  const { scene: rawScene, patchScene, resetScene, isSaving: isSceneSaving } =
    useRoomSceneEditor('home', houseEvent, updateHouseEvent);

  // Build carousel entries: toys + music + sing
  const carouselItems = useMemo<CarouselEntry[]>(() => {
    const toys = getLiveShopItems()
      .filter(i => i.type === 'toy')
      .map(i => ({ id: i.id, icon: <span>{i.icon}</span>, label: i.name }));

    const actions: CarouselEntry[] = [
      {
        id: '__action_music',
        icon: <div className="size-10 sm:size-12 rounded-full flex items-center justify-center bg-pink-500/15 text-pink-500"><Music className="size-5 sm:size-6" /></div>,
        label: 'Music',
      },
      {
        id: '__action_sing',
        icon: <div className="size-10 sm:size-12 rounded-full flex items-center justify-center bg-purple-500/15 text-purple-500"><Mic className="size-5 sm:size-6" /></div>,
        label: 'Sing',
      },
    ];

    return [...toys, ...actions];
  }, []);

  // ── Room Items (furniture) — reads from house (kind 11127) ──
  const homeItems = useMemo(
    () => house?.layout.rooms.home?.items ?? [],
    [house],
  );

  // ── Furniture Edit Mode ──
  const itemEditor = useRoomItemEditor('home', houseEvent, updateHouseEvent);
  const [showAddItem, setShowAddItem] = useState(false);

  const handleItemDragEnd = useCallback((instanceId: string, position: HouseItemPosition) => {
    itemEditor.commitPosition(instanceId, position);
  }, [itemEditor]);

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
    <div className="flex flex-col flex-1 min-h-0 relative">
      {/* ── Room Scene Background (z-index 0) ── */}
      <RoomSceneLayer scene={roomScene} />

      {/* ── Room Items — layered around Blobbi (z 1-8, hero at 5) ── */}
      <RoomItemsLayer
        items={homeItems}
        editMode={itemEditor.editMode}
        edit={{
          selectedItemId: itemEditor.selectedItemId,
          onSelect: itemEditor.selectItem,
          onDragEnd: handleItemDragEnd,
          isSaving: itemEditor.isSaving,
        }}
      />

      {/* ── Top-right action buttons ── */}
      <div className="absolute top-2 right-2 z-30 flex items-center gap-1.5">
        {/* Furniture edit toggle */}
        <button
          onClick={() => itemEditor.setEditMode(!itemEditor.editMode)}
          className={`size-8 flex items-center justify-center rounded-full backdrop-blur-sm transition-all shadow-sm ${
            itemEditor.editMode
              ? 'bg-blue-500/80 text-white hover:bg-blue-500/90'
              : 'bg-background/50 text-foreground/60 hover:text-foreground/90 hover:bg-background/70'
          }`}
          aria-label={itemEditor.editMode ? 'Exit furniture edit mode' : 'Edit furniture'}
        >
          {itemEditor.editMode ? <X className="size-3.5" /> : <Move className="size-3.5" />}
        </button>

        {/* Decor (scene customize) button — hide during furniture edit */}
        {!itemEditor.editMode && (
          <button
            onClick={() => setShowCustomize(true)}
            className="size-8 flex items-center justify-center rounded-full bg-background/50 backdrop-blur-sm text-foreground/60 hover:text-foreground/90 hover:bg-background/70 transition-all shadow-sm"
            aria-label="Customize room"
          >
            <Paintbrush className="size-3.5" />
          </button>
        )}
      </div>

      {/* ── Edit mode banner ── */}
      {itemEditor.editMode && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
          <div className="px-3 py-1 rounded-full bg-blue-500/80 backdrop-blur-sm text-white text-xs font-medium shadow-lg flex items-center gap-1.5">
            <Move className="size-3" />
            {itemEditor.isSaving ? 'Saving...' : 'Hold item to move'}
          </div>
          <button
            onClick={() => setShowAddItem(true)}
            className="size-7 flex items-center justify-center rounded-full bg-blue-500/80 backdrop-blur-sm text-white hover:bg-blue-600/90 transition-all shadow-lg"
            aria-label="Add furniture"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      )}

      {/* ── Hero (Blobbi + stats) — z-index 5, between backFloor and frontFloor ── */}
      <BlobbiRoomHero ctx={ctx} className="flex-1 min-h-0 z-[5]" />

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

      {/* ── Unified Bottom Bar: Photo | Carousel | Companion ── */}
      {!isActiveFloatingCompanion && (
        <div className={ROOM_BOTTOM_BAR_CLASS}>
          <div className="flex items-center justify-between gap-1 sm:gap-3">
            {/* Photo */}
            <RoomActionButton
              icon={<Camera className="size-7 sm:size-9" />}
              label="Photo"
              color="text-pink-500"
              glowHex="#ec4899"
              onClick={() => setShowPhotoModal(true)}
            />

            {/* Center carousel */}
            <div className="flex-1 min-w-0 flex justify-center">
              <ItemCarousel
                items={carouselItems}
                onUse={handleCarouselUse}
                activeItemId={isUsingItem ? usingItemId : null}
                disabled={isDisabled}
              />
            </div>

            {/* Companion toggle */}
            {canBeCompanion ? (
              <RoomActionButton
                icon={<Footprints className="size-7 sm:size-9" />}
                label={isCurrentCompanion ? 'With you' : 'Take along'}
                color={isCurrentCompanion ? 'text-emerald-500' : 'text-violet-500'}
                glowHex={isCurrentCompanion ? '#10b981' : '#8b5cf6'}
                onClick={handleSetAsCompanion}
                disabled={isUpdatingCompanion}
                loading={isUpdatingCompanion}
              />
            ) : (
              <div className="w-14 sm:w-20 shrink-0" />
            )}
          </div>
        </div>
      )}

      {/* ── Room Customization Sheet ── */}
      <RoomCustomizeSheet
        open={showCustomize}
        onOpenChange={setShowCustomize}
        currentWallType={rawScene.wall.type}
        currentWallColor={rawScene.wall.color}
        currentFloorType={rawScene.floor.type}
        currentFloorColor={rawScene.floor.color}
        currentUseThemeColors={rawScene.useThemeColors}
        onPatch={patchScene}
        onReset={resetScene}
        isSaving={isSceneSaving}
      />

      {/* ── Add Furniture Sheet (edit mode only) ── */}
      <AddItemSheet
        open={showAddItem}
        onOpenChange={setShowAddItem}
        roomId="home"
        onAdd={itemEditor.addItem}
        isSaving={itemEditor.isSaving}
      />
    </div>
  );
}
