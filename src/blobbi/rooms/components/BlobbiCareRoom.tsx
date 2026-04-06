// src/blobbi/rooms/components/BlobbiCareRoom.tsx

/**
 * BlobbiCareRoom — The bathroom / hygiene room.
 *
 * Layout:
 * - BlobbiRoomHero (Blobbi visual + stats)
 * - Bottom center: bath interaction tools (soap, etc.)
 * - Bottom right: shower (water action)
 * - Bottom left: towel (only usable when wet — placeholder for now)
 *
 * Also shows medicine items in the center tools.
 *
 * Future: interactions could become drag-based.
 */

import { useMemo } from 'react';
import { Loader2, ShowerHead } from 'lucide-react';

import { cn } from '@/lib/utils';
import { getLiveShopItems } from '@/blobbi/shop/lib/blobbi-shop-items';
import type { BlobbiRoomContext } from '../lib/room-types';
import { BlobbiRoomHero } from './BlobbiRoomHero';

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

  // Hygiene + medicine items from shop catalog
  const hygieneItems = useMemo(() =>
    getLiveShopItems().filter(i => i.type === 'hygiene'),
  []);

  const medicineItems = useMemo(() =>
    getLiveShopItems().filter(i => i.type === 'medicine'),
  []);

  const isDisabled = isPublishing || actionInProgress !== null || isUsingItem;

  // Find the towel item
  const towelItem = hygieneItems.find(i => i.id === 'hyg_towel');
  // Other hygiene items (excluding towel — it's placed at bottom-left)
  const centerHygieneItems = hygieneItems.filter(i => i.id !== 'hyg_towel');

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Hero ── */}
      <BlobbiRoomHero ctx={ctx} className="flex-1 min-h-0" />

      {/* ── Bottom Action Bar ── */}
      {!isActiveFloatingCompanion && (
        <div className="relative z-10 px-3 sm:px-4 pb-4 pt-2">
          <div className="flex items-end">
            {/* Bottom left — Towel */}
            <div className="w-16 shrink-0 flex justify-start">
              {towelItem && (
                <button
                  onClick={() => handleUseItemFromTab(towelItem.id)}
                  disabled={isDisabled}
                  className={cn(
                    'flex flex-col items-center gap-1 transition-all duration-300 ease-out',
                    'hover:-translate-y-1 hover:scale-110 active:scale-95',
                    isDisabled && 'opacity-40 pointer-events-none',
                  )}
                >
                  <div className="size-12 rounded-full flex items-center justify-center bg-cyan-500/10">
                    <span className="text-2xl">{towelItem.icon}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-medium">Towel</span>
                  {isUsingItem && usingItemId === towelItem.id && (
                    <Loader2 className="size-3 animate-spin text-primary" />
                  )}
                </button>
              )}
            </div>

            {/* Center: hygiene tools + medicine */}
            <div className="flex-1 min-w-0 overflow-x-auto scrollbar-none">
              <div className="flex items-center justify-center gap-2 px-2">
                {/* Hygiene items (soap, shampoo, bubble bath, etc.) */}
                {centerHygieneItems.map(item => {
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

                {/* Divider */}
                {medicineItems.length > 0 && centerHygieneItems.length > 0 && (
                  <div className="w-px h-8 bg-border/50 mx-1 shrink-0" />
                )}

                {/* Medicine items */}
                {medicineItems.map(item => {
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

            {/* Bottom right — Shower */}
            <div className="w-16 shrink-0 flex justify-end">
              <button
                onClick={() => {
                  // Use the shampoo item as the "shower" action (highest hygiene effect)
                  const shampoo = hygieneItems.find(i => i.id === 'hyg_shampoo');
                  if (shampoo) handleUseItemFromTab(shampoo.id);
                }}
                disabled={isDisabled}
                className={cn(
                  'flex flex-col items-center gap-1 transition-all duration-300 ease-out',
                  'hover:-translate-y-1 hover:scale-110 active:scale-95',
                  isDisabled && 'opacity-40 pointer-events-none',
                )}
              >
                <div className="size-12 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-500">
                  <ShowerHead className="size-6" />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium">Shower</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
