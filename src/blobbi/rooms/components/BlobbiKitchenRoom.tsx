// src/blobbi/rooms/components/BlobbiKitchenRoom.tsx

/**
 * BlobbiKitchenRoom — The feeding room.
 *
 * Layout:
 * - BlobbiRoomHero (Blobbi visual + stats)
 * - Bottom center: horizontal food items carousel
 * - Bottom right: fridge button (opens full items view for food)
 * - Bottom left: empty for now
 */

import { useMemo, useState } from 'react';
import { Loader2, Refrigerator } from 'lucide-react';

import { cn } from '@/lib/utils';
import { getLiveShopItems } from '@/blobbi/shop/lib/blobbi-shop-items';
import { BlobbiActionInventoryModal } from '@/blobbi/actions/components/BlobbiActionInventoryModal';
import type { BlobbiRoomContext } from '../lib/room-types';
import { BlobbiRoomHero } from './BlobbiRoomHero';

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

  // Open the fridge modal (shows all food items in the full inventory modal)
  const [showFridge, setShowFridge] = useState(false);

  // Food items from shop catalog
  const foodItems = useMemo(() =>
    getLiveShopItems().filter(i => i.type === 'food'),
  []);

  const isDisabled = isPublishing || actionInProgress !== null || isUsingItem;

  // Handler for using an item from the fridge modal
  const handleFridgeUseItem = (itemId: string) => {
    if (isUsingItem) return;
    ctx.onUseItem(itemId, 'feed').finally(() => {
      setShowFridge(false);
    });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Hero ── */}
      <BlobbiRoomHero ctx={ctx} className="flex-1 min-h-0" />

      {/* ── Bottom Action Bar ── */}
      {!isActiveFloatingCompanion && (
        <div className="relative z-10 px-3 sm:px-4 pb-4 pt-2">
          <div className="flex items-end">
            {/* Bottom left — empty for now */}
            <div className="w-16 shrink-0" />

            {/* Center: horizontal food carousel */}
            <div className="flex-1 min-w-0 overflow-x-auto scrollbar-none">
              <div className="flex items-center justify-center gap-2 px-2">
                {foodItems.map(item => {
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
              </div>
            </div>

            {/* Bottom right — Fridge */}
            <div className="w-16 shrink-0 flex justify-end">
              <button
                onClick={() => setShowFridge(true)}
                disabled={isDisabled}
                className={cn(
                  'flex flex-col items-center gap-1 transition-all duration-300 ease-out',
                  'hover:-translate-y-1 hover:scale-110 active:scale-95',
                  isDisabled && 'opacity-40 pointer-events-none',
                )}
              >
                <div className="size-12 rounded-full flex items-center justify-center bg-orange-500/10 text-orange-500">
                  <Refrigerator className="size-6" />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium">Fridge</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Fridge Modal (reuses BlobbiActionInventoryModal for "feed" action) ── */}
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
