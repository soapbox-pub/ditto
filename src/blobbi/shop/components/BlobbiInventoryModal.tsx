import { useMemo, useState } from 'react';
import { Package, Loader2, Minus, Plus, X } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import type { BlobbiCompanion, BlobbonautProfile } from '@/blobbi/core/lib/blobbi';
import type { ShopItem } from '../types/shop.types';
import { getShopItemById } from '../lib/blobbi-shop-items';
import { canUseItemForStage } from '@/blobbi/actions/lib/blobbi-action-utils';
import { cn } from '@/lib/utils';
import { ItemEffectDisplay } from './ItemEffectDisplay';

interface BlobbiInventoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: BlobbonautProfile | null;
  /** The current companion (needed for stage-based restrictions) */
  companion: BlobbiCompanion | null;
  /** Called when user wants to use an item. Opens the use flow. */
  onUseItem?: (itemId: string, quantity: number) => void;
  /** Whether an item is currently being used */
  isUsingItem?: boolean;
}

/** Resolved inventory item with shop metadata and usability info */
interface ResolvedInventoryItem extends ShopItem {
  itemId: string;
  quantity: number;
  canUse: boolean;
  reason?: string;
}

export function BlobbiInventoryModal({
  open,
  onOpenChange,
  profile,
  companion,
  onUseItem,
  isUsingItem = false,
}: BlobbiInventoryModalProps) {
  // State for use confirmation dialog
  const [selectedItem, setSelectedItem] = useState<ResolvedInventoryItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [showUseDialog, setShowUseDialog] = useState(false);

  // Resolve storage items with their metadata and usability from the shop catalog
  const inventoryItems = useMemo((): ResolvedInventoryItem[] => {
    if (!profile) return [];
    const stage = companion?.stage ?? 'egg';

    const result: ResolvedInventoryItem[] = [];
    for (const storageItem of profile.storage) {
      const item = getShopItemById(storageItem.itemId);
      if (!item) continue;

      // Check if item can be used for current stage
      const usability = canUseItemForStage(storageItem.itemId, stage);

      result.push({
        ...item,
        itemId: storageItem.itemId,
        quantity: storageItem.quantity,
        canUse: usability.canUse,
        reason: usability.reason,
      });
    }
    return result;
  }, [profile, companion?.stage]);

  const isEmpty = inventoryItems.length === 0;

  // Handlers for use dialog
  const handleSelectItem = (item: ResolvedInventoryItem) => {
    if (!item.canUse || isUsingItem) return;
    setSelectedItem(item);
    setQuantity(1);
    setShowUseDialog(true);
  };

  const handleConfirmUse = () => {
    if (!selectedItem || !onUseItem || isUsingItem) return;
    onUseItem(selectedItem.itemId, quantity);
    // Reset state
    setShowUseDialog(false);
    setSelectedItem(null);
    setQuantity(1);
  };

  const handleCloseUseDialog = (isOpen: boolean) => {
    if (!isOpen) {
      setShowUseDialog(false);
      setSelectedItem(null);
      setQuantity(1);
    }
  };

  // Quantity controls
  const maxQuantity = selectedItem?.quantity ?? 1;
  const handleIncrease = () => setQuantity(q => Math.min(q + 1, maxQuantity));
  const handleDecrease = () => setQuantity(q => Math.max(q - 1, 1));
  const handleQuantityInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (isNaN(value) || value < 1) {
      setQuantity(1);
    } else {
      setQuantity(Math.min(value, maxQuantity));
    }
  };

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
              <div className="min-w-0">
                <DialogTitle className="text-xl sm:text-2xl">Inventory</DialogTitle>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {isEmpty ? 'No items yet' : `${inventoryItems.length} ${inventoryItems.length === 1 ? 'item' : 'items'}`}
                </p>
              </div>
            </div>
            <DialogClose className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 shrink-0">
              <X className="size-5" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
        </DialogHeader>

        {/* Content - Scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="size-20 rounded-3xl bg-muted/50 flex items-center justify-center mb-4">
                <Package className="size-10 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Items Yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Visit the shop to purchase items for your Blobbi. Items you buy will appear here.
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
                  {/* Top row on mobile: Icon + Name/Type + Quantity + Button */}
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

                    {/* Quantity Badge */}
                    <Badge className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white border-0 px-2 py-0.5 shrink-0 text-xs">
                      ×{item.quantity}
                    </Badge>

                    {/* Use Button */}
                    {onUseItem && (
                      item.canUse ? (
                        <Button
                          size="sm"
                          onClick={() => handleSelectItem(item)}
                          disabled={isUsingItem}
                          className="shrink-0"
                        >
                          Use
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
                    {/* Show blocked reason on mobile */}
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
      </DialogContent>

      {/* Use Item Confirmation Dialog */}
      {selectedItem && companion && (
        <InventoryUseConfirmDialog
          open={showUseDialog}
          onOpenChange={handleCloseUseDialog}
          item={selectedItem}
          companion={companion}
          quantity={quantity}
          maxQuantity={maxQuantity}
          onIncrease={handleIncrease}
          onDecrease={handleDecrease}
          onQuantityChange={handleQuantityInput}
          onConfirm={handleConfirmUse}
          isUsing={isUsingItem}
        />
      )}
    </Dialog>
  );
}

// ─── Use Confirmation Dialog ──────────────────────────────────────────────────

interface InventoryUseConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ResolvedInventoryItem;
  companion: BlobbiCompanion;
  quantity: number;
  maxQuantity: number;
  onIncrease: () => void;
  onDecrease: () => void;
  onQuantityChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onConfirm: () => void;
  isUsing: boolean;
}

function InventoryUseConfirmDialog({
  open,
  onOpenChange,
  item,
  companion,
  quantity,
  maxQuantity,
  onIncrease,
  onDecrease,
  onQuantityChange,
  onConfirm,
  isUsing,
}: InventoryUseConfirmDialogProps) {
  // Calculate total effect for the selected quantity by simulating sequential application
  // This matches the actual behavior when items are used (clamping at each step)
  const totalEffect = useMemo(() => {
    if (!item.effect) return null;
    
    const statKeys = ['hunger', 'happiness', 'energy', 'hygiene', 'health'] as const;
    const currentStats = { ...companion.stats };
    
    // Apply effects N times in sequence with clamping at each step
    for (let i = 0; i < quantity; i++) {
      for (const stat of statKeys) {
        const delta = item.effect[stat];
        if (delta !== undefined) {
          currentStats[stat] = Math.max(0, Math.min(100, (currentStats[stat] ?? 0) + delta));
        }
      }
    }
    
    // Calculate actual deltas (may be less than effect * quantity due to clamping)
    const result: Record<string, number> = {};
    for (const stat of statKeys) {
      const delta = (currentStats[stat] ?? 0) - (companion.stats[stat] ?? 0);
      if (delta !== 0) {
        result[stat] = delta;
      }
    }
    
    return Object.keys(result).length > 0 ? result : null;
  }, [item.effect, companion.stats, quantity]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle>Use Item</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Item Preview */}
          <div className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg bg-muted/50">
            <div className="text-3xl sm:text-4xl shrink-0">{item.icon}</div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{item.name}</h3>
              <p className="text-sm text-muted-foreground">
                {item.quantity} in inventory
              </p>
            </div>
          </div>

          {/* Quantity Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Quantity</label>
              <span className="text-xs text-muted-foreground">
                Max: {maxQuantity}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={onDecrease}
                disabled={quantity <= 1 || isUsing}
              >
                <Minus className="size-4" />
              </Button>
              <Input
                type="number"
                min="1"
                max={maxQuantity}
                value={quantity}
                onChange={onQuantityChange}
                disabled={isUsing}
                className="text-center"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={onIncrease}
                disabled={quantity >= maxQuantity || isUsing}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>

          {/* Effects Summary */}
          {totalEffect && (
            <div className="p-4 rounded-lg bg-gradient-to-r from-emerald-500/10 to-green-500/10 border border-emerald-500/20">
              <h4 className="text-sm font-medium mb-2">
                Total effect{quantity > 1 ? ` (x${quantity})` : ''}
              </h4>
              <ItemEffectDisplay effect={totalEffect} variant="badges" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isUsing}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isUsing}
            className="min-w-24"
          >
            {isUsing ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Using...
              </>
            ) : (
              `Use${quantity > 1 ? ` (x${quantity})` : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
