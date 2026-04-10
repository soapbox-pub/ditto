import { useMemo } from 'react';
import { Package, Loader2, X } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import type { BlobbiCompanion, BlobbonautProfile } from '@/blobbi/core/lib/blobbi';
import type { ShopItem } from '../types/shop.types';
import { getLiveShopItems } from '../lib/blobbi-shop-items';
import { canUseItemForStage } from '@/blobbi/actions/lib/blobbi-action-utils';
import { cn } from '@/lib/utils';
import { ItemEffectDisplay } from './ItemEffectDisplay';

interface BlobbiInventoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: BlobbonautProfile | null;
  /** The current companion (needed for stage-based restrictions) */
  companion: BlobbiCompanion | null;
  /** Called when user wants to use an item. Always uses once. */
  onUseItem?: (itemId: string) => void;
  /** Whether an item is currently being used */
  isUsingItem?: boolean;
}

/** Resolved catalog item with shop metadata and usability info */
interface ResolvedInventoryItem extends ShopItem {
  itemId: string;
  canUse: boolean;
  reason?: string;
}

// ── Shared items content (used by both standalone modal and unified shop modal) ──

interface BlobbiInventoryContentProps {
  profile: BlobbonautProfile | null;
  companion: BlobbiCompanion | null;
  onUseItem?: (itemId: string) => void;
  isUsingItem?: boolean;
}

export function BlobbiInventoryContent({
  profile: _profile,
  companion,
  onUseItem,
  isUsingItem = false,
}: BlobbiInventoryContentProps) {
  const inventoryItems = useMemo((): ResolvedInventoryItem[] => {
    const stage = companion?.stage ?? 'egg';
    const allItems = getLiveShopItems();

    const result: ResolvedInventoryItem[] = [];
    for (const item of allItems) {
      const usability = canUseItemForStage(item.id, stage);

      result.push({
        ...item,
        itemId: item.id,
        canUse: usability.canUse,
        reason: usability.reason,
      });
    }
    return result;
  }, [companion?.stage]);

  const isEmpty = inventoryItems.length === 0;

  const handleUseItem = (item: ResolvedInventoryItem) => {
    if (!item.canUse || isUsingItem || !onUseItem) return;
    onUseItem(item.itemId);
  };

  return (
    <div className="px-4 sm:px-6 py-3 sm:py-4">
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="size-20 rounded-3xl bg-muted/50 flex items-center justify-center mb-4">
            <Package className="size-10 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No Items Available</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            No items are available for your Blobbi's current stage.
          </p>
        </div>
      ) : (
        <div className="grid gap-2 sm:gap-3">
          {inventoryItems.map(item => (
            <div
              key={item.itemId}
              className={cn(
                "flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 sm:p-4 rounded-xl border bg-card/60 backdrop-blur-sm transition-colors",
                item.canUse ? "hover:border-primary/30" : "opacity-70"
              )}
            >
              {/* Top row on mobile: Icon + Name/Type + Button */}
              <div className="flex items-center gap-3 sm:contents">
                {/* Item Icon */}
                <div className="relative shrink-0">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5 rounded-full blur-xl" />
                  <div className={cn(
                    "relative size-10 sm:size-14 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-2xl sm:text-3xl",
                    !item.canUse && "grayscale"
                  )}>
                    {item.icon}
                  </div>
                </div>

                {/* Item Info - Name and Type */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 sm:mb-1">
                    <h3 className="font-semibold text-sm sm:text-base truncate">{item.name}</h3>
                    <Badge variant="secondary" className="text-xs capitalize shrink-0 hidden sm:inline-flex">
                      {item.type}
                    </Badge>
                  </div>
                  {/* Effect preview - desktop only inline */}
                  <div className="hidden sm:block">
                    <ItemEffectDisplay effect={item.effect} variant="inline" />
                  </div>
                  {/* Show blocked reason - desktop only inline */}
                  {!item.canUse && item.reason && (
                    <p className="hidden sm:block text-xs text-amber-600 dark:text-amber-400 mt-1">
                      {item.reason}
                    </p>
                  )}
                </div>

                {/* Use Button */}
                {onUseItem && (
                  item.canUse ? (
                    <Button
                      size="sm"
                      onClick={() => handleUseItem(item)}
                      disabled={isUsingItem}
                      className="shrink-0"
                    >
                      {isUsingItem ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        'Use'
                      )}
                    </Button>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button
                            size="sm"
                            disabled
                            className="shrink-0"
                          >
                            Use
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{item.reason || 'Cannot use this item'}</p>
                      </TooltipContent>
                    </Tooltip>
                  )
                )}
              </div>

              {/* Mobile only: Effect preview and blocked reason below */}
              <div className="sm:hidden pl-13 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs capitalize">
                    {item.type}
                  </Badge>
                  <ItemEffectDisplay effect={item.effect} variant="inline" />
                </div>
                {!item.canUse && item.reason && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {item.reason}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Standalone Inventory Modal (kept for backwards compatibility) ──

export function BlobbiInventoryModal({
  open,
  onOpenChange,
  profile,
  companion,
  onUseItem,
  isUsingItem = false,
}: BlobbiInventoryModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[calc(100%-2rem)] max-h-[85vh] flex flex-col p-0 gap-0 [&>button:last-child]:hidden">
        {/* Header - Sticky */}
        <DialogHeader className="sticky top-0 z-10 bg-background px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-9 sm:size-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center shrink-0">
                <Package className="size-4 sm:size-5 text-primary" />
              </div>
              <DialogTitle className="text-xl sm:text-2xl">Inventory</DialogTitle>
            </div>
            <DialogClose className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 shrink-0">
              <X className="size-5" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
        </DialogHeader>

        {/* Content - Scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <BlobbiInventoryContent
            profile={profile}
            companion={companion}
            onUseItem={onUseItem}
            isUsingItem={isUsingItem}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
