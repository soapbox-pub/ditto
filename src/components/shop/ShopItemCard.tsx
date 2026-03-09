import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import type { ShopItem } from '@/types/shop';
import { cn } from '@/lib/utils';

interface ShopItemCardProps {
  item: ShopItem;
  availableCoins: number;
  onPurchaseClick: (item: ShopItem) => void;
}

export function ShopItemCard({ item, availableCoins, onPurchaseClick }: ShopItemCardProps) {
  const isDisabled = item.status === 'disabled';
  const isAffordable = !isDisabled && availableCoins >= item.price;

  return (
    <div
      className={cn(
        'relative p-4 rounded-xl border transition-all',
        'bg-card/60 backdrop-blur-sm',
        isAffordable && !isDisabled && 'hover:border-primary/30 hover:shadow-md hover:scale-[1.02]',
        isDisabled && 'opacity-60'
      )}
    >
      {/* Item Icon with gradient background */}
      <div className="flex justify-center mb-3">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5 rounded-full blur-xl" />
          <div className="relative size-20 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-5xl">
            {item.icon}
          </div>
        </div>
      </div>

      {/* Price Badge */}
      <div className="absolute top-3 right-3">
        <Badge className="bg-gradient-to-r from-yellow-500 to-amber-500 text-white border-0">
          {item.price} coins
        </Badge>
      </div>

      {/* Item Name */}
      <h3 className="font-semibold text-center mb-2 truncate">{item.name}</h3>

      {/* Effect Badges */}
      {item.effect && Object.keys(item.effect).length > 0 && (
        <div className="flex flex-wrap gap-1 justify-center mb-3 min-h-[28px]">
          {Object.entries(item.effect).map(([stat, value]) => (
            <Badge
              key={stat}
              variant="secondary"
              className={cn(
                'text-xs',
                value > 0 ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' : 'bg-red-500/20 text-red-700 dark:text-red-300'
              )}
            >
              {value > 0 ? '+' : ''}{value} {stat.replace('_', ' ')}
            </Badge>
          ))}
        </div>
      )}

      {/* Purchase Button */}
      <Button
        variant={isAffordable && !isDisabled ? 'default' : 'secondary'}
        className={cn(
          'w-full',
          isAffordable && !isDisabled && 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600'
        )}
        onClick={() => onPurchaseClick(item)}
        disabled={!isAffordable || isDisabled}
      >
        {isDisabled ? (
          'Coming Soon'
        ) : !isAffordable ? (
          'Not Enough Coins'
        ) : (
          'Purchase'
        )}
      </Button>
    </div>
  );
}
