// src/blobbi/rooms/components/BlobbiKitchenRoom.tsx

/**
 * BlobbiKitchenRoom — The feeding room.
 *
 * Bottom bar: (empty left) | food carousel (center) | Fridge button (right)
 */

import { useMemo, useState } from 'react';
import { Refrigerator } from 'lucide-react';

import { getLiveShopItems } from '@/blobbi/shop/lib/blobbi-shop-items';
import { BlobbiActionInventoryModal } from '@/blobbi/actions/components/BlobbiActionInventoryModal';
import type { BlobbiRoomContext } from '../lib/room-types';
import { ROOM_BOTTOM_BAR_CLASS } from '../lib/room-layout';
import { BlobbiRoomHero } from './BlobbiRoomHero';
import { RoomActionButton } from './RoomActionButton';
import { ItemCarousel, type CarouselEntry } from './ItemCarousel';

interface BlobbiKitchenRoomProps {
  ctx: BlobbiRoomContext;
}

export function BlobbiKitchenRoom({ ctx }: BlobbiKitchenRoomProps) {
  const {
    companion,
    profile,
    isUsingItem,
    usingItemId,
    handleUseItemFromTab,
    isPublishing,
    actionInProgress,
    isActiveFloatingCompanion,
  } = ctx;

  const [showFridge, setShowFridge] = useState(false);

  const foodEntries = useMemo<CarouselEntry[]>(() =>
    getLiveShopItems()
      .filter(i => i.type === 'food')
      .map(i => ({ id: i.id, icon: <span>{i.icon}</span>, label: i.name })),
  []);

  const isDisabled = isPublishing || actionInProgress !== null || isUsingItem;

  const handleFridgeUseItem = (itemId: string) => {
    if (isUsingItem) return;
    ctx.onUseItem(itemId, 'feed').finally(() => {
      setShowFridge(false);
    });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <BlobbiRoomHero ctx={ctx} className="flex-1 min-h-0" />

      {!isActiveFloatingCompanion && (
        <div className={ROOM_BOTTOM_BAR_CLASS}>
          <div className="flex items-center justify-between gap-1 sm:gap-3">
            {/* Left — empty spacer matching button width */}
            <div className="w-14 sm:w-20 shrink-0" />

            {/* Center: food carousel */}
            <div className="flex-1 min-w-0 flex justify-center">
              <ItemCarousel
                items={foodEntries}
                onUse={handleUseItemFromTab}
                activeItemId={isUsingItem ? usingItemId : null}
                disabled={isDisabled}
              />
            </div>

            {/* Right — Fridge */}
            <RoomActionButton
              icon={<Refrigerator className="size-7 sm:size-9" />}
              label="Fridge"
              color="text-orange-500"
              glowHex="#f97316"
              onClick={() => setShowFridge(true)}
              disabled={isDisabled}
            />
          </div>
        </div>
      )}

      {showFridge && (
        <BlobbiActionInventoryModal
          open={showFridge}
          onOpenChange={setShowFridge}
          action="feed"
          companion={companion}
          profile={profile}
          onUseItem={handleFridgeUseItem}
          onOpenShop={() => setShowFridge(false)}
          isUsingItem={isUsingItem}
          usingItemId={usingItemId}
        />
      )}
    </div>
  );
}
