import { useState } from 'react';
import { ShoppingBag, Utensils, Gamepad2, Heart, Droplets, Palette } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

import { BlobbiShopItemRow } from './BlobbiShopItemRow';
import { BlobbiPurchaseDialog } from './BlobbiPurchaseDialog';

import type { ShopItem, ShopItemCategory } from '../types/shop.types';
import type { BlobbonautProfile } from '@/lib/blobbi';
import { getShopItemsByType } from '../lib/blobbi-shop-items';
import { useBlobbiPurchaseItem } from '../hooks/useBlobbiPurchaseItem';
import { cn } from '@/lib/utils';

interface BlobbiShopModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: BlobbonautProfile | null;
}

const CATEGORIES: Array<{
  type: ShopItemCategory;
  label: string;
  icon: React.ReactNode;
}> = [
  { type: 'food', label: 'Food', icon: <Utensils className="size-4" /> },
  { type: 'toy', label: 'Toys', icon: <Gamepad2 className="size-4" /> },
  { type: 'medicine', label: 'Medicine', icon: <Heart className="size-4" /> },
  { type: 'hygiene', label: 'Hygiene', icon: <Droplets className="size-4" /> },
  { type: 'accessory', label: 'Accessories', icon: <Palette className="size-4" /> },
];

export function BlobbiShopModal({ open, onOpenChange, profile }: BlobbiShopModalProps) {
  const [activeCategory, setActiveCategory] = useState<ShopItemCategory>('food');
  const [selectedItem, setSelectedItem] = useState<ShopItem | null>(null);
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);

  const { mutate: purchaseItem, isPending: isPurchasing } = useBlobbiPurchaseItem(profile);

  const availableCoins = profile?.coins ?? 0;
  const items = getShopItemsByType(activeCategory);

  const handlePurchaseClick = (item: ShopItem) => {
    setSelectedItem(item);
    setShowPurchaseDialog(true);
  };

  const handlePurchase = (quantity: number) => {
    if (!selectedItem) return;

    purchaseItem(
      {
        itemId: selectedItem.id,
        price: selectedItem.price,
        quantity,
      },
      {
        onSuccess: () => {
          setShowPurchaseDialog(false);
          setSelectedItem(null);
        },
      }
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                  <ShoppingBag className="size-5 text-primary" />
                </div>
                <DialogTitle className="text-2xl">Blobbi Shop</DialogTitle>
              </div>
              <Badge className="bg-gradient-to-r from-yellow-500 to-amber-500 text-white border-0 text-base px-4 py-1">
                {availableCoins} coins
              </Badge>
            </div>
          </DialogHeader>

          {/* Category Tabs */}
          <div className="px-6 pt-4">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {CATEGORIES.map(category => {
                const isActive = activeCategory === category.type;
                const itemCount = getShopItemsByType(category.type).length;

                return (
                  <button
                    key={category.type}
                    onClick={() => setActiveCategory(category.type)}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-lg transition-all whitespace-nowrap',
                      'border',
                      isActive
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
                    )}
                  >
                    {category.icon}
                    <span className="font-medium">{category.label}</span>
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {itemCount}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Accessories Coming Soon Banner */}
          {activeCategory === 'accessory' && (
            <div className="mx-6 mt-4 p-6 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
              <div className="flex items-start gap-4">
                <div className="size-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-3xl relative">
                  🎨
                  <div className="absolute -top-1 -right-1 text-xl">✨</div>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-1">Accessories Coming Soon!</h3>
                  <p className="text-sm text-muted-foreground">
                    Get ready to customize your Blobbi's appearance with amazing accessories and cosmetic items.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Items List */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-2">
              {items.map(item => (
                <BlobbiShopItemRow
                  key={item.id}
                  item={item}
                  availableCoins={availableCoins}
                  onPurchaseClick={handlePurchaseClick}
                />
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Purchase Dialog */}
      {selectedItem && (
        <BlobbiPurchaseDialog
          open={showPurchaseDialog}
          onOpenChange={setShowPurchaseDialog}
          item={selectedItem}
          availableCoins={availableCoins}
          onPurchase={handlePurchase}
          isPurchasing={isPurchasing}
        />
      )}
    </>
  );
}
