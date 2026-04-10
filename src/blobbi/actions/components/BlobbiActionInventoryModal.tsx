// src/blobbi/actions/components/BlobbiActionInventoryModal.tsx

import { useMemo } from 'react';
import { Loader2, X } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

import type { BlobbiCompanion, BlobbonautProfile } from '@/blobbi/core/lib/blobbi';
import { cn } from '@/lib/utils';

import {
  filterInventoryByAction,
  previewStatChanges,
  previewMedicineForEgg,
  previewCleanForEgg,
  canUseAction,
  getStageRestrictionMessage,
  ACTION_METADATA,
  type InventoryAction,
  type ResolvedInventoryItem,
  type EggStatPreview,
} from '../lib/blobbi-action-utils';

interface BlobbiActionInventoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: InventoryAction;
  companion: BlobbiCompanion;
  profile: BlobbonautProfile | null;
  /** Called when user taps Use on an item. Always uses once. */
  onUseItem: (itemId: string) => void;
  onOpenShop: () => void;
  isUsingItem: boolean;
  usingItemId: string | null;
}

export function BlobbiActionInventoryModal({
  open,
  onOpenChange,
  action,
  companion,
  profile: _profile,
  onUseItem,
  onOpenShop: _onOpenShop,
  isUsingItem,
  usingItemId,
}: BlobbiActionInventoryModalProps) {
  const actionMeta = ACTION_METADATA[action];

  // Get all available items for this action from the catalog (not inventory).
  // Items are abilities/tools — no ownership required.
  const availableItems = useMemo(() => {
    return filterInventoryByAction([], action, { stage: companion.stage });
  }, [action, companion.stage]);

  // Check stage restrictions for this specific action
  const canUse = canUseAction(companion, action);
  const stageMessage = getStageRestrictionMessage(companion, action);

  const isEmpty = availableItems.length === 0;

  const handleUseItem = (item: ResolvedInventoryItem) => {
    if (isUsingItem) return;
    onUseItem(item.itemId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[calc(100%-2rem)] max-h-[85vh] flex flex-col p-0 gap-0 [&>button:last-child]:hidden">
        {/* Header - Sticky */}
        <DialogHeader className="sticky top-0 z-10 bg-background px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-9 sm:size-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-xl sm:text-2xl shrink-0">
                {actionMeta.icon}
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-lg sm:text-xl">{actionMeta.label}</DialogTitle>
                <p className="text-xs sm:text-sm text-muted-foreground truncate">
                  {actionMeta.description}
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
          {/* Stage Restriction Message */}
          {!canUse && stageMessage && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="size-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4">
                <span className="text-3xl">🥚</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">Not Available</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                {stageMessage}
              </p>
            </div>
          )}

          {/* Empty State */}
          {canUse && isEmpty && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="size-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                <span className="text-3xl">{actionMeta.icon}</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">No Items Available</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                No items are available for this action at your Blobbi's current stage.
              </p>
            </div>
          )}

          {/* Item List */}
          {canUse && !isEmpty && (
            <div className="grid gap-3">
              {availableItems.map((item) => (
                <BlobbiInventoryUseRow
                  key={item.itemId}
                  item={item}
                  companion={companion}
                  action={action}
                  onUse={() => handleUseItem(item)}
                  isUsing={isUsingItem && usingItemId === item.itemId}
                  disabled={isUsingItem}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Inventory Use Row ────────────────────────────────────────────────────────

interface BlobbiInventoryUseRowProps {
  item: ResolvedInventoryItem;
  companion: BlobbiCompanion;
  action: InventoryAction;
  onUse: () => void;
  isUsing: boolean;
  disabled: boolean;
}

function BlobbiInventoryUseRow({
  item,
  companion,
  action,
  onUse,
  isUsing,
  disabled,
}: BlobbiInventoryUseRowProps) {
  const isEgg = companion.stage === 'egg';
  const isMedicine = action === 'medicine';
  const isClean = action === 'clean';

  // Preview stat changes - handle egg-specific preview for medicine and clean
  const { normalStatChanges, eggStatChanges } = useMemo(() => {
    if (isEgg && isMedicine) {
      return {
        normalStatChanges: [],
        eggStatChanges: previewMedicineForEgg(companion.stats.health, item.effect),
      };
    }
    if (isEgg && isClean) {
      return {
        normalStatChanges: [],
        eggStatChanges: previewCleanForEgg(
          { hygiene: companion.stats.hygiene, happiness: companion.stats.happiness },
          item.effect
        ),
      };
    }
    return {
      normalStatChanges: previewStatChanges(companion.stats, item.effect),
      eggStatChanges: [] as EggStatPreview[],
    };
  }, [companion.stats, item.effect, isEgg, isMedicine, isClean]);

  const hasChanges = normalStatChanges.length > 0 || eggStatChanges.length > 0;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border bg-card/60 backdrop-blur-sm hover:border-primary/30 transition-colors">
      {/* Top row on mobile: Icon + Info + Button */}
      <div className="flex items-center gap-3 sm:contents">
        {/* Item Icon */}
        <div className="relative shrink-0">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5 rounded-full blur-xl" />
          <div className="relative size-10 sm:size-14 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-2xl sm:text-3xl">
            {item.icon}
          </div>
        </div>

        {/* Item Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 sm:mb-1">
            <h3 className="font-semibold text-sm sm:text-base truncate">{item.name}</h3>
          </div>

          {/* Effect Preview - shown inline on desktop */}
          <div className="hidden sm:block">
            {hasChanges && (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {normalStatChanges.map(({ stat, delta }) => (
                  <span key={stat} className="text-xs">
                    <span
                      className={cn(
                        'font-medium',
                        delta > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      )}
                    >
                      {delta > 0 ? '+' : ''}
                      {delta}
                    </span>{' '}
                    <span className="text-muted-foreground capitalize">
                      {stat.replace('_', ' ')}
                    </span>
                  </span>
                ))}
                {eggStatChanges.map(({ stat, delta }) => (
                  <span key={stat} className="text-xs">
                    <span
                      className={cn(
                        'font-medium',
                        delta > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      )}
                    >
                      {delta > 0 ? '+' : ''}
                      {delta}
                    </span>{' '}
                    <span className="text-muted-foreground capitalize">
                      {stat.replace('_', ' ')}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Use Button */}
        <Button
          size="sm"
          onClick={onUse}
          disabled={disabled}
          className="shrink-0"
        >
          {isUsing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            'Use'
          )}
        </Button>
      </div>

      {/* Effect Preview - shown below on mobile */}
      {hasChanges && (
        <div className="sm:hidden flex flex-wrap gap-x-3 gap-y-1 pl-13">
          {normalStatChanges.map(({ stat, delta }) => (
            <span key={stat} className="text-xs">
              <span
                className={cn(
                  'font-medium',
                  delta > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                )}
              >
                {delta > 0 ? '+' : ''}
                {delta}
              </span>{' '}
              <span className="text-muted-foreground capitalize">
                {stat.replace('_', ' ')}
              </span>
            </span>
          ))}
          {eggStatChanges.map(({ stat, delta }) => (
            <span key={stat} className="text-xs">
              <span
                className={cn(
                  'font-medium',
                  delta > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                )}
              >
                {delta > 0 ? '+' : ''}
                {delta}
              </span>{' '}
              <span className="text-muted-foreground capitalize">
                {stat.replace('_', ' ')}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
