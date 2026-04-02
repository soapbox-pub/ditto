import { useState, useMemo } from 'react';
import { Loader2, Minus, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import type { ShopItem } from '../types/shop.types';
import { formatCompactNumber } from '@/lib/utils';

interface BlobbiPurchaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ShopItem;
  availableCoins: number;
  onPurchase: (quantity: number) => void;
  isPurchasing: boolean;
}

export function BlobbiPurchaseDialog({
  open,
  onOpenChange,
  item,
  availableCoins,
  onPurchase,
  isPurchasing,
}: BlobbiPurchaseDialogProps) {
  const [quantity, setQuantity] = useState(1);

  // Calculate max affordable quantity
  const maxAffordable = useMemo(() => {
    return Math.min(Math.floor(availableCoins / item.price), 999);
  }, [availableCoins, item.price]);

  // Calculate total cost
  const totalCost = useMemo(() => {
    return item.price * quantity;
  }, [item.price, quantity]);

  // Check if current selection is affordable
  const isAffordable = totalCost <= availableCoins;

  // Handle quantity changes
  const handleIncrease = () => {
    setQuantity(prev => Math.min(prev + 1, maxAffordable));
  };

  const handleDecrease = () => {
    setQuantity(prev => Math.max(prev - 1, 1));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (isNaN(value) || value < 1) {
      setQuantity(1);
    } else {
      setQuantity(Math.min(value, maxAffordable));
    }
  };

  const handlePurchase = () => {
    onPurchase(quantity);
    // Reset quantity after purchase
    setQuantity(1);
  };

  // Reset quantity when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setQuantity(1);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle>Purchase Item</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Item Preview */}
          <div className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg bg-muted/50">
            <div className="text-4xl sm:text-5xl shrink-0">{item.icon}</div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base sm:text-lg truncate">{item.name}</h3>
              <p className="text-sm text-muted-foreground">
                {formatCompactNumber(item.price)} coins each
              </p>
            </div>
          </div>

          {/* Quantity Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Quantity</label>
              <span className="text-xs text-muted-foreground">
                Max: {maxAffordable}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={handleDecrease}
                disabled={quantity <= 1 || isPurchasing}
              >
                <Minus className="size-4" />
              </Button>
              <Input
                type="number"
                min="1"
                max={maxAffordable}
                value={quantity}
                onChange={handleInputChange}
                disabled={isPurchasing}
                className="text-center"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleIncrease}
                disabled={quantity >= maxAffordable || isPurchasing}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>

          {/* Total Cost */}
          <div className="p-3 sm:p-4 rounded-lg bg-gradient-to-r from-yellow-500/10 to-amber-500/10 border border-yellow-500/20">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">Total Cost</span>
              <span className="text-base sm:text-lg font-bold whitespace-nowrap">
                {formatCompactNumber(totalCost)} coins
              </span>
            </div>
            {!isAffordable && (
              <p className="text-xs text-destructive mt-2">
                Insufficient coins! You need {formatCompactNumber(totalCost - availableCoins)} more.
              </p>
            )}
          </div>

        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPurchasing}
          >
            Cancel
          </Button>
          <Button
            onClick={handlePurchase}
            disabled={!isAffordable || isPurchasing}
            className="min-w-32"
          >
            {isPurchasing ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Purchasing...
              </>
            ) : !isAffordable ? (
              'Insufficient Coins'
            ) : (
              `Purchase (×${quantity})`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
