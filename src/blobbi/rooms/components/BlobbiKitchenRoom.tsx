// src/blobbi/rooms/components/BlobbiKitchenRoom.tsx

/**
 * BlobbiKitchenRoom — The feeding room.
 *
 * Bottom bar: Shovel (left, when poop exists) | food carousel (center) | Fridge (right)
 * Poop appears as floating emoji in the room when present.
 */

import { useMemo, useState } from 'react';
import { Refrigerator, Shovel } from 'lucide-react';

import { cn } from '@/lib/utils';
import { getLiveShopItems } from '@/blobbi/shop/lib/blobbi-shop-items';
import { BlobbiActionInventoryModal } from '@/blobbi/actions/components/BlobbiActionInventoryModal';
import type { BlobbiRoomContext, RoomPoopState } from '../lib/room-types';
import { ROOM_BOTTOM_BAR_CLASS } from '../lib/room-layout';
import { getPoopsInRoom, hasAnyPoop } from '../lib/poop-system';
import { BlobbiRoomHero } from './BlobbiRoomHero';
import { RoomActionButton } from './RoomActionButton';
import { ItemCarousel, type CarouselEntry } from './ItemCarousel';

interface BlobbiKitchenRoomProps {
  ctx: BlobbiRoomContext;
  poopState: RoomPoopState;
}

export function BlobbiKitchenRoom({ ctx, poopState }: BlobbiKitchenRoomProps) {
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

  // Poop in this room
  const kitchenPoops = getPoopsInRoom(poopState.poops, 'kitchen');
  const anyPoopAnywhere = hasAnyPoop(poopState.poops);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Hero + Poop ── */}
      <div className="relative flex-1 min-h-0 flex flex-col">
        <BlobbiRoomHero ctx={ctx} className="flex-1 min-h-0" />

        {/* Poop floating in the room */}
        {kitchenPoops.map((poop, i) => (
          <button
            key={poop.id}
            onClick={() => poopState.shovelMode && poopState.onRemovePoop(poop.id)}
            className={cn(
              'absolute z-10 text-2xl sm:text-3xl transition-all duration-200',
              poopState.shovelMode
                ? 'cursor-pointer hover:scale-125 active:scale-90 animate-bounce'
                : 'pointer-events-none',
            )}
            style={{
              bottom: `${20 + i * 8}%`,
              left: `${15 + (i * 30) % 70}%`,
            }}
          >
            {'💩'}
          </button>
        ))}
      </div>

      {!isActiveFloatingCompanion && (
        <div className={ROOM_BOTTOM_BAR_CLASS}>
          <div className="flex items-center justify-between gap-1 sm:gap-3">
            {/* Left — Shovel (when poop exists anywhere) or empty */}
            {anyPoopAnywhere ? (
              <RoomActionButton
                icon={<Shovel className="size-7 sm:size-9" />}
                label={poopState.shovelMode ? 'Shoveling' : 'Shovel'}
                color={poopState.shovelMode ? 'text-amber-600' : 'text-stone-500'}
                glowHex={poopState.shovelMode ? '#d97706' : '#78716c'}
                onClick={() => poopState.setShovelMode(prev => !prev)}
              />
            ) : (
              <div className="w-14 sm:w-20 shrink-0" />
            )}

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
