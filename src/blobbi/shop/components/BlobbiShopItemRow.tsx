import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import type { ShopItem } from '../types/shop.types';
import { ItemEffectDisplay } from './ItemEffectDisplay';
import { cn, formatCompactNumber } from '@/lib/utils';

interface BlobbiShopItemRowProps {
  item: ShopItem;
  availableCoins: number;
  onPurchaseClick: (item: ShopItem) => void;
}

export function BlobbiShopItemRow({ item, availableCoins, onPurchaseClick }: BlobbiShopItemRowProps) {
  const isDisabled = item.status === 'disabled';
  const isAffordable = !isDisabled && availableCoins >= item.price;

  return (
    <div
      className={cn(
        'flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg border transition-all',
        'bg-card/60 backdrop-blur-sm',
        isAffordable && !isDisabled && 'hover:border-primary/30 hover:bg-accent/30',
        isDisabled && 'opacity-60'
      )}
    >
      {/* Item Icon */}
      <div className="shrink-0">
        <div className="relative size-12 sm:size-14 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-3xl sm:text-4xl">
          {item.icon}
        </div>
      </div>

      {/* Item Info */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold truncate">{item.name}</h3>
          <Badge variant="secondary" className="text-xs capitalize shrink-0">
            {item.type}
          </Badge>
        </div>
        <ItemEffectDisplay effect={item.effect} variant="inline" />
      </div>

      {/* Price & Purchase Button */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <Badge className="bg-gradient-to-r from-yellow-500 to-amber-500 text-white border-0 hidden sm:inline-flex">
          {formatCompactNumber(item.price)} coins
        </Badge>
        <Badge className="bg-gradient-to-r from-yellow-500 to-amber-500 text-white border-0 sm:hidden text-xs px-2">
          {formatCompactNumber(item.price)}
        </Badge>
        <Button
          variant={isAffordable && !isDisabled ? 'default' : 'secondary'}
          size="sm"
          className={cn(
            'min-w-[90px]',
            isAffordable && !isDisabled && 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600'
          )}
          onClick={() => onPurchaseClick(item)}
          disabled={!isAffordable || isDisabled}
        >
          {isDisabled ? (
            'Coming Soon'
          ) : !isAffordable ? (
            <span className="text-xs sm:text-sm">No Coins</span>
          ) : (
            'Purchase'
          )}
        </Button>
      </div>
    </div>
  );
}
