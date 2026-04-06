import { useState, useMemo } from 'react';
import { ShoppingBag, Package, Loader2, X, Clock } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogClose,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import type { ShopItem } from '../types/shop.types';
import type { BlobbiCompanion, BlobbonautProfile } from '@/blobbi/core/lib/blobbi';
import { getLiveShopItems } from '../lib/blobbi-shop-items';
import { useBlobbiPurchaseItem } from '../hooks/useBlobbiPurchaseItem';
import { canUseItemForStage } from '@/blobbi/actions/lib/blobbi-action-utils';
import { useItemCooldown } from '@/blobbi/actions/hooks/useItemCooldown';
import { cn, formatCompactNumber } from '@/lib/utils';

type TopTab = 'items' | 'shop';

/** Resolved inventory item with shop metadata and usability info */
interface ResolvedInventoryItem extends ShopItem {
  itemId: string;
  quantity: number;
  canUse: boolean;
  reason?: string;
}

interface BlobbiShopModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: BlobbonautProfile | null;
  /** Initial tab to open on. Defaults to "items". */
  initialTab?: TopTab;
  // ── Inventory props (passed through) ──
  companion: BlobbiCompanion | null;
  onUseItem?: (itemId: string) => void;
  isUsingItem?: boolean;
}

export function BlobbiShopModal({
  open,
  onOpenChange,
  profile,
  initialTab = 'items',
  companion,
  onUseItem,
  isUsingItem,
}: BlobbiShopModalProps) {
  const [topTab, setTopTab] = useState<TopTab>(initialTab);

  const { mutate: purchaseItem, isPending: isPurchasing } = useBlobbiPurchaseItem(profile);
  const [purchasingItemId, setPurchasingItemId] = useState<string | null>(null);

  const availableCoins = profile?.coins ?? 0;
  const allItems = getLiveShopItems();

  // Reset to initialTab when modal re-opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setTopTab(initialTab);
    }
    onOpenChange(isOpen);
  };

  // Instant purchase — one tap = one item
  const handleBuyItem = (item: ShopItem) => {
    if (isPurchasing || availableCoins < item.price) return;
    setPurchasingItemId(item.id);
    purchaseItem(
      { itemId: item.id, price: item.price, quantity: 1 },
      { onSettled: () => setPurchasingItemId(null) },
    );
  };

  const effectivePurchasingId = isPurchasing ? purchasingItemId : null;

  // ── Items resolution — sourced from the full catalog (not inventory) ──
  const inventoryItems = useMemo((): ResolvedInventoryItem[] => {
    const stage = companion?.stage ?? 'egg';
    const allCatalogItems = getLiveShopItems();

    const result: ResolvedInventoryItem[] = [];
    for (const item of allCatalogItems) {
      const usability = canUseItemForStage(item.id, stage);

      result.push({
        ...item,
        itemId: item.id,
        quantity: Infinity,
        canUse: usability.canUse,
        reason: usability.reason,
      });
    }
    return result;
  }, [companion?.stage]);

  // ── Inventory use item handler ──
  const [usingItemId, setUsingItemId] = useState<string | null>(null);

  const handleUseItem = (item: ResolvedInventoryItem) => {
    if (!item.canUse || isUsingItem || !onUseItem) return;
    setUsingItemId(item.itemId);
    onUseItem(item.itemId);
  };

  // Clear usingItemId when isUsingItem goes false
  const effectiveUsingItemId = isUsingItem ? usingItemId : null;

  const inventoryEmpty = inventoryItems.length === 0;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md w-[calc(100%-2rem)] max-h-[80vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl [&>button:last-child]:hidden">

          {/* Tab Bar (replaces header) */}
          <div className="flex items-center border-b bg-muted/30">
            {/* Tabs */}
            <button
              onClick={() => setTopTab('items')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-medium transition-colors relative',
                topTab === 'items'
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground/70'
              )}
            >
              <Package className="size-4" />
              Items
              {!inventoryEmpty && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 min-w-4">
                  {inventoryItems.length}
                </Badge>
              )}
              {topTab === 'items' && (
                <span className="absolute bottom-0 inset-x-4 h-0.5 bg-primary rounded-full" />
              )}
            </button>
            <button
              onClick={() => setTopTab('shop')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-medium transition-colors relative',
                topTab === 'shop'
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground/70'
              )}
            >
              <ShoppingBag className="size-4" />
              Shop
              {topTab === 'shop' && (
                <span className="absolute bottom-0 inset-x-4 h-0.5 bg-primary rounded-full" />
              )}
            </button>

            {/* Coin badge + Close */}
            <div className="flex items-center gap-1.5 pr-3 pl-2">
              <Badge className="bg-gradient-to-r from-yellow-500 to-amber-500 text-white border-0 text-xs px-2 py-0.5">
                <span className="mr-1">🪙</span>{formatCompactNumber(availableCoins)}
              </Badge>
              <DialogClose className="rounded-full p-1 opacity-60 hover:opacity-100 transition-opacity">
                <X className="size-4" />
                <span className="sr-only">Close</span>
              </DialogClose>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {topTab === 'shop' ? (
              <ShopGrid
                items={allItems}
                availableCoins={availableCoins}
                onBuy={handleBuyItem}
                purchasingItemId={effectivePurchasingId}
              />
            ) : (
              <ItemsGrid
                items={inventoryItems}
                onUseItem={handleUseItem}
                isUsingItem={isUsingItem}
                usingItemId={effectiveUsingItemId}
                onGoToShop={() => setTopTab('shop')}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Shop Grid (tile layout, all items, cost in button) ───────────────────────

interface ShopGridProps {
  items: ShopItem[];
  availableCoins: number;
  onBuy: (item: ShopItem) => void;
  purchasingItemId: string | null;
}

function ShopGrid({ items, availableCoins, onBuy, purchasingItemId }: ShopGridProps) {
  return (
    <div className="p-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {items.map(item => {
          const isDisabled = item.status === 'disabled';
          const isAffordable = !isDisabled && availableCoins >= item.price;
          const isBuying = purchasingItemId === item.id;

          return (
            <div
              key={item.id}
              className={cn(
                'flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center',
                'bg-card/60 backdrop-blur-sm',
                isDisabled && 'opacity-50',
                !isDisabled && !isAffordable && 'opacity-70',
              )}
            >
              {/* Icon */}
              <div className="text-3xl leading-none mt-1">{item.icon}</div>

              {/* Name */}
              <span className="text-xs font-medium truncate w-full">{item.name}</span>

              {/* Buy button with integrated cost */}
              <button
                onClick={() => onBuy(item)}
                disabled={isDisabled || !isAffordable || !!purchasingItemId}
                className={cn(
                  'w-full rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
                  isDisabled
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : isAffordable
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 active:scale-95 transition-transform'
                      : 'bg-muted text-muted-foreground cursor-not-allowed'
                )}
              >
                {isDisabled ? (
                  'Soon'
                ) : isBuying ? (
                  <span className="flex items-center justify-center">
                    <Loader2 className="size-3 animate-spin" />
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1">
                    <span>🪙</span> {formatCompactNumber(item.price)}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Items Grid (inventory, tile layout) ──────────────────────────────────────

interface ItemsGridProps {
  items: ResolvedInventoryItem[];
  onUseItem: (item: ResolvedInventoryItem) => void;
  isUsingItem?: boolean;
  usingItemId: string | null;
  onGoToShop: () => void;
}

function ItemsGrid({ items, onUseItem, isUsingItem, usingItemId, onGoToShop: _onGoToShop }: ItemsGridProps) {
  const { isOnCooldown } = useItemCooldown();

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="size-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
          <Package className="size-8 text-muted-foreground/60" />
        </div>
        <p className="text-sm text-muted-foreground">
          No items are available for your Blobbi's current stage.
        </p>
      </div>
    );
  }

  return (
    <div className="p-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {items.map(item => {
          const isThisUsing = isUsingItem && usingItemId === item.itemId;
          const isCoolingDown = isOnCooldown(item.itemId);
          const isDisabled = isUsingItem || isCoolingDown;

          return (
            <div
              key={item.itemId}
              className={cn(
                'flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center relative',
                'bg-card/60 backdrop-blur-sm',
                item.canUse ? 'hover:border-primary/40 hover:bg-accent/40' : 'opacity-60',
              )}
            >
              {/* Icon */}
              <div className={cn('text-3xl leading-none mt-1', !item.canUse && 'grayscale')}>{item.icon}</div>

              {/* Name */}
              <span className="text-xs font-medium truncate w-full">{item.name}</span>

              {/* Use button */}
              {item.canUse ? (
                <Button
                  size="sm"
                  variant={isCoolingDown ? 'ghost' : 'outline'}
                  className="w-full h-7 text-xs"
                  onClick={() => onUseItem(item)}
                  disabled={isDisabled}
                >
                  {isThisUsing ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : isCoolingDown ? (
                    <Clock className="size-3 text-muted-foreground" />
                  ) : (
                    'Use'
                  )}
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="w-full">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-7 text-xs"
                        disabled
                      >
                        Use
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{item.reason || 'Cannot use this item'}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
