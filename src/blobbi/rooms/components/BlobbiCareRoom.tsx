// src/blobbi/rooms/components/BlobbiCareRoom.tsx

/**
 * BlobbiCareRoom — The bathroom / hygiene room.
 *
 * Bottom bar: Towel (left) | hygiene+medicine carousel (center) | Shower (right)
 */

import { useMemo } from 'react';
import { ShowerHead } from 'lucide-react';

import { getLiveShopItems } from '@/blobbi/shop/lib/blobbi-shop-items';
import type { BlobbiRoomContext } from '../lib/room-types';
import { ROOM_BOTTOM_BAR_CLASS } from '../lib/room-layout';
import { BlobbiRoomHero } from './BlobbiRoomHero';
import { RoomActionButton } from './RoomActionButton';
import { ItemCarousel, type CarouselEntry } from './ItemCarousel';

interface BlobbiCareRoomProps {
  ctx: BlobbiRoomContext;
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

  const carouselEntries = useMemo<CarouselEntry[]>(() => {
    const hygiene = getLiveShopItems()
      .filter(i => i.type === 'hygiene' && i.id !== 'hyg_towel')
      .map(i => ({ id: i.id, icon: <span>{i.icon}</span>, label: i.name }));
    const medicine = getLiveShopItems()
      .filter(i => i.type === 'medicine')
      .map(i => ({ id: i.id, icon: <span>{i.icon}</span>, label: i.name }));
    return [...hygiene, ...medicine];
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <BlobbiRoomHero ctx={ctx} className="flex-1 min-h-0" />

      {!isActiveFloatingCompanion && (
        <div className={ROOM_BOTTOM_BAR_CLASS}>
          <div className="flex items-center justify-between gap-1 sm:gap-3">
            {/* Left — Towel */}
            {towelItem ? (
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
            )}

            {/* Center carousel */}
            <div className="flex-1 min-w-0 flex justify-center">
              <ItemCarousel
                items={carouselEntries}
                onUse={handleUseItemFromTab}
                activeItemId={isUsingItem ? usingItemId : null}
                disabled={isDisabled}
              />
            </div>

            {/* Right — Shower */}
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
          </div>
        </div>
      )}
    </div>
  );
}
