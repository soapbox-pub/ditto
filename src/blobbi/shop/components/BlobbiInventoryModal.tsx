import { useMemo } from 'react';
import { Package } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

import type { BlobbonautProfile } from '@/lib/blobbi';
import { getShopItemById } from '../lib/blobbi-shop-items';
import { cn } from '@/lib/utils';

interface BlobbiInventoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: BlobbonautProfile | null;
}

export function BlobbiInventoryModal({ open, onOpenChange, profile }: BlobbiInventoryModalProps) {
  // Resolve storage items with their metadata from the shop catalog
  const inventoryItems = useMemo(() => {
    if (!profile) return [];

    return profile.storage
      .map(storageItem => {
        const item = getShopItemById(storageItem.itemId);
        if (!item) return null;

        return {
          ...storageItem,
          ...item,
        };
      })
      .filter(Boolean);
  }, [profile]);

  const isEmpty = inventoryItems.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center">
              <Package className="size-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-2xl">Inventory</DialogTitle>
              <p className="text-sm text-muted-foreground">
                {isEmpty ? 'No items yet' : `${inventoryItems.length} ${inventoryItems.length === 1 ? 'item' : 'items'}`}
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
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
            <div className="grid gap-3">
              {inventoryItems.map(item => {
                if (!item) return null;

                return (
                  <div
                    key={item.itemId}
                    className="flex items-center gap-4 p-4 rounded-xl border bg-card/60 backdrop-blur-sm hover:border-primary/30 transition-colors"
                  >
                    {/* Item Icon */}
                    <div className="relative shrink-0">
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5 rounded-full blur-xl" />
                      <div className="relative size-16 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-4xl">
                        {item.icon}
                      </div>
                    </div>

                    {/* Item Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate">{item.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs capitalize">
                              {item.type}
                            </Badge>
                            {item.effect && Object.keys(item.effect).length > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {Object.entries(item.effect).map(([stat, value]) => (
                                  <span key={stat} className="mr-2">
                                    <span
                                      className={cn(
                                        'font-medium',
                                        value > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                                      )}
                                    >
                                      {value > 0 ? '+' : ''}{value}
                                    </span>{' '}
                                    {stat.replace('_', ' ')}
                                  </span>
                                )).slice(0, 2)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Quantity Badge */}
                        <Badge className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white border-0 text-base px-3 py-1 shrink-0">
                          ×{item.quantity}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
