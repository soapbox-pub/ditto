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
import { cn, formatCompactNumber } from '@/lib/utils';

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
        <DialogContent className="max-w-2xl w-[calc(100%-2rem)] max-h-[85vh] flex flex-col p-0 gap-0">
          {/* Header - Sticky */}
          <DialogHeader className="sticky top-0 z-10 bg-background px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 border-b pr-12">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="size-9 sm:size-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center shrink-0">
                  <ShoppingBag className="size-4 sm:size-5 text-primary" />
                </div>
                <DialogTitle className="text-xl sm:text-2xl truncate">Blobbi Shop</DialogTitle>
              </div>
              <Badge className="bg-gradient-to-r from-yellow-500 to-amber-500 text-white border-0 text-sm sm:text-base px-3 sm:px-4 py-1 shrink-0 mr-1">
                {formatCompactNumber(availableCoins)} coins
              </Badge>
            </div>
          </DialogHeader>

          {/* Category Tabs - Part of sticky header area */}
          <div className="sticky top-[60px] sm:top-[72px] z-10 bg-background px-4 sm:px-6 pt-3 sm:pt-4 pb-2 border-b">
            <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {CATEGORIES.map(category => {
                const isActive = activeCategory === category.type;
                const itemCount = getShopItemsByType(category.type).length;

                  return (
                    <button
                      key={category.type}
                      onClick={() => setActiveCategory(category.type)}
                      className={cn(
                        'flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-all whitespace-nowrap',
                        'border text-sm sm:text-base',
                        isActive
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
                      )}
                    >
                      {category.icon}
                      <span className="font-medium hidden xs:inline">{category.label}</span>
                      <Badge variant="secondary" className="ml-0.5 sm:ml-1 text-xs">
                        {itemCount}
                      </Badge>
                    </button>
                  );
              })}
            </div>
          </div>

          {/* Scrollable Content Area */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* Accessories Coming Soon Banner */}
            {activeCategory === 'accessory' && (
              <div className="mx-4 sm:mx-6 mt-3 sm:mt-4 p-4 sm:p-6 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="size-12 sm:size-16 rounded-xl sm:rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-2xl sm:text-3xl relative shrink-0">
                    🎨
                    <div className="absolute -top-1 -right-1 text-base sm:text-xl">✨</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base sm:text-lg font-semibold mb-1">Accessories Coming Soon!</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Get ready to customize your Blobbi's appearance with amazing accessories and cosmetic items.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Items List */}
            <div className="px-4 sm:px-6 py-3 sm:py-4">
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
