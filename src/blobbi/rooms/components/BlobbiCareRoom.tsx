// src/blobbi/rooms/components/BlobbiCareRoom.tsx

/**
 * BlobbiCareRoom — Hygiene, care, and medicine room.
 *
 * Side actions are conditional on the currently focused carousel item:
 * - Hygiene item focused: Towel (left) + Shower (right)
 * - Medicine item focused: Lollipop (left) + empty (right)
 */

import { useMemo, useState, useCallback } from 'react';
import { ShowerHead, Candy } from 'lucide-react';

import { getLiveShopItems } from '@/blobbi/shop/lib/blobbi-shop-items';
import type { BlobbiRoomContext, RoomPoopState } from '../lib/room-types';
import { ROOM_BOTTOM_BAR_CLASS } from '../lib/room-layout';
import { BlobbiRoomHero } from './BlobbiRoomHero';
import { RoomActionButton } from './RoomActionButton';
import { ItemCarousel, type CarouselEntry } from './ItemCarousel';

interface BlobbiCareRoomProps {
  ctx: BlobbiRoomContext;
  poopState: RoomPoopState;
}

export function BlobbiCareRoom({ ctx }: BlobbiCareRoomProps) {
  const {
    isUsingItem,
    usingItemId,
    handleUseItemFromTab,
    isPublishing,
    actionInProgress,
    isActiveFloatingCompanion,
  } = ctx;

  const hygieneItems = useMemo(() =>
    getLiveShopItems().filter(i => i.type === 'hygiene'),
  []);

  const isDisabled = isPublishing || actionInProgress !== null || isUsingItem;
  const towelItem = hygieneItems.find(i => i.id === 'hyg_towel');

  // Carousel: hygiene (except towel) + medicine, each tagged with meta
  const carouselEntries = useMemo<CarouselEntry[]>(() => {
    const hygiene = getLiveShopItems()
      .filter(i => i.type === 'hygiene' && i.id !== 'hyg_towel')
      .map(i => ({ id: i.id, icon: <span>{i.icon}</span>, label: i.name, meta: 'hygiene' }));
    const medicine = getLiveShopItems()
      .filter(i => i.type === 'medicine')
      .map(i => ({ id: i.id, icon: <span>{i.icon}</span>, label: i.name, meta: 'medicine' }));
    return [...hygiene, ...medicine];
  }, []);

  // Track the type of the currently focused carousel item
  const [focusedMeta, setFocusedMeta] = useState<string>(
    carouselEntries[0]?.meta ?? 'hygiene',
  );

  const handleFocusChange = useCallback((entry: CarouselEntry) => {
    setFocusedMeta(entry.meta ?? 'hygiene');
  }, []);

  const isHygieneFocused = focusedMeta === 'hygiene';

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <BlobbiRoomHero ctx={ctx} className="flex-1 min-h-0" />

      {!isActiveFloatingCompanion && (
        <div className={ROOM_BOTTOM_BAR_CLASS}>
          <div className="flex items-center justify-between gap-1 sm:gap-3">
            {/* Left — conditional: Towel (hygiene) or Lollipop (medicine) */}
            {isHygieneFocused ? (
              towelItem ? (
                <RoomActionButton
                  icon={<span className="text-2xl sm:text-3xl">{towelItem.icon}</span>}
                  label="Towel"
                  color="text-cyan-500"
                  glowHex="#06b6d4"
                  onClick={() => handleUseItemFromTab(towelItem.id)}
                  disabled={isDisabled}
                  loading={isUsingItem && usingItemId === towelItem.id}
                />
              ) : (
                <div className="w-14 sm:w-20 shrink-0" />
              )
            ) : (
              <RoomActionButton
                icon={<Candy className="size-7 sm:size-9" />}
                label="Treat"
                color="text-pink-400"
                glowHex="#f472b6"
                onClick={() => {
                  // Use lollipop as a comfort treat after medicine
                  // For now this triggers a small happiness boost via the direct action
                  handleUseItemFromTab(carouselEntries.find(e => e.meta === 'medicine')?.id ?? '');
                }}
                disabled={isDisabled}
              />
            )}

            {/* Center carousel */}
            <div className="flex-1 min-w-0 flex justify-center">
              <ItemCarousel
                items={carouselEntries}
                onUse={handleUseItemFromTab}
                activeItemId={isUsingItem ? usingItemId : null}
                disabled={isDisabled}
                onFocusChange={handleFocusChange}
              />
            </div>

            {/* Right — conditional: Shower (hygiene) or empty (medicine) */}
            {isHygieneFocused ? (
              <RoomActionButton
                icon={<ShowerHead className="size-7 sm:size-9" />}
                label="Shower"
                color="text-blue-500"
                glowHex="#3b82f6"
                onClick={() => {
                  const shampoo = hygieneItems.find(i => i.id === 'hyg_shampoo');
                  if (shampoo) handleUseItemFromTab(shampoo.id);
                }}
                disabled={isDisabled}
              />
            ) : (
              <div className="w-14 sm:w-20 shrink-0" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
