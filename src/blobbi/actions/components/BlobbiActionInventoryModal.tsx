// src/blobbi/actions/components/BlobbiActionInventoryModal.tsx

import { useMemo } from 'react';
import { Loader2, ShoppingBag } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import type { BlobbiCompanion, BlobbonautProfile } from '@/lib/blobbi';
import { cn } from '@/lib/utils';

import {
  filterInventoryByAction,
  previewStatChanges,
  previewMedicineForEgg,
  canUseAction,
  getStageRestrictionMessage,
  ACTION_METADATA,
  type InventoryAction,
  type ResolvedInventoryItem,
  type EggStatPreview,
} from '../lib/blobbi-action-utils';
import { getTagValue } from '@/lib/blobbi';

interface BlobbiActionInventoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: InventoryAction;
  companion: BlobbiCompanion;
  profile: BlobbonautProfile | null;
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
  profile,
  onUseItem,
  onOpenShop,
  isUsingItem,
  usingItemId,
}: BlobbiActionInventoryModalProps) {
  const actionMeta = ACTION_METADATA[action];

  // Filter inventory by action type
  const availableItems = useMemo(() => {
    if (!profile) return [];
    return filterInventoryByAction(profile.storage, action);
  }, [profile, action]);

  // Check stage restrictions for this specific action
  const canUse = canUseAction(companion, action);
  const stageMessage = getStageRestrictionMessage(companion, action);

  const isEmpty = availableItems.length === 0;

  const handleUseItem = (itemId: string) => {
    if (isUsingItem) return;
    onUseItem(itemId);
  };

  const handleOpenShop = () => {
    onOpenChange(false);
    onOpenShop();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-2xl">
              {actionMeta.icon}
            </div>
            <div>
              <DialogTitle className="text-xl">{actionMeta.label}</DialogTitle>
              <p className="text-sm text-muted-foreground">
                {actionMeta.description}
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
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
              <h3 className="text-lg font-semibold mb-2">No Items</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-4">
                You don't have any items for this action. Visit the shop to get some!
              </p>
              <Button onClick={handleOpenShop} className="gap-2">
                <ShoppingBag className="size-4" />
                Open Shop
              </Button>
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
                  onUse={() => handleUseItem(item.itemId)}
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

  // Preview stat changes - handle egg-specific preview for medicine
  const { normalStatChanges, eggStatChanges } = useMemo(() => {
    if (isEgg && isMedicine) {
      // For eggs using medicine, show shell_integrity preview
      const shellIntegrityStr = getTagValue(companion.event.tags, 'shell_integrity');
      const currentShellIntegrity = shellIntegrityStr ? parseInt(shellIntegrityStr, 10) : undefined;
      return {
        normalStatChanges: [],
        eggStatChanges: previewMedicineForEgg(currentShellIntegrity, item.effect),
      };
    }
    // Normal stats preview
    return {
      normalStatChanges: previewStatChanges(companion.stats, item.effect),
      eggStatChanges: [] as EggStatPreview[],
    };
  }, [companion.stats, companion.event.tags, item.effect, isEgg, isMedicine]);

  const hasChanges = normalStatChanges.length > 0 || eggStatChanges.length > 0;

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border bg-card/60 backdrop-blur-sm hover:border-primary/30 transition-colors">
      {/* Item Icon */}
      <div className="relative shrink-0">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5 rounded-full blur-xl" />
        <div className="relative size-14 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-3xl">
          {item.icon}
        </div>
      </div>

      {/* Item Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-semibold truncate">{item.name}</h3>
          <Badge variant="secondary" className="text-xs shrink-0">
            x{item.quantity}
          </Badge>
        </div>

        {/* Effect Preview */}
        {hasChanges && (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {/* Normal stat changes */}
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
            {/* Egg stat changes (shell_integrity) */}
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
  );
}
