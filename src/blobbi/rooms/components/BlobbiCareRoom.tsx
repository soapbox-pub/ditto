// src/blobbi/rooms/components/BlobbiCareRoom.tsx

/**
 * BlobbiCareRoom — The bathroom / hygiene room.
 *
 * Layout:
 * - BlobbiRoomHero (Blobbi visual + stats)
 * - Center: single-focus carousel with hygiene + medicine items
 * - Bottom left: towel (RoomActionButton style)
 * - Bottom right: shower (RoomActionButton style)
 *
 * Future: interactions could become drag-based.
 */

import { useMemo } from 'react';
import { ShowerHead } from 'lucide-react';

import { getLiveShopItems } from '@/blobbi/shop/lib/blobbi-shop-items';
import type { BlobbiRoomContext } from '../lib/room-types';
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

  // Towel is shown as a dedicated button, not in the carousel
  const towelItem = hygieneItems.find(i => i.id === 'hyg_towel');

  // Carousel: hygiene (except towel) + medicine
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
      {/* ── Hero ── */}
      <BlobbiRoomHero ctx={ctx} className="flex-1 min-h-0" />

      {/* ── Bottom Action Bar ── */}
      {!isActiveFloatingCompanion && (
        <div className="relative z-10 px-4 sm:px-8 pb-6 pt-2">
          <div className="flex items-start justify-between">
            {/* Bottom left — Towel */}
            <div className="w-24 shrink-0">
              {towelItem && (
                <RoomActionButton
                  icon={<span className="text-3xl sm:text-4xl">{towelItem.icon}</span>}
                  label="Towel"
                  color="text-cyan-500"
                  glowHex="#06b6d4"
                  onClick={() => handleUseItemFromTab(towelItem.id)}
                  disabled={isDisabled}
                  loading={isUsingItem && usingItemId === towelItem.id}
                />
              )}
            </div>

            {/* Center: single-focus carousel */}
            <div className="flex-1 min-w-0 flex justify-center">
              <ItemCarousel
                items={carouselEntries}
                onUse={handleUseItemFromTab}
                activeItemId={isUsingItem ? usingItemId : null}
                disabled={isDisabled}
              />
            </div>

            {/* Bottom right — Shower */}
            <RoomActionButton
              icon={<ShowerHead className="size-9 sm:size-10" />}
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
