// src/blobbi/actions/components/BlobbiActionInventoryModal.tsx

import { useMemo, useState } from 'react';
import { Loader2, ShoppingBag, Minus, Plus } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

import type { BlobbiCompanion, BlobbonautProfile } from '@/lib/blobbi';
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
  /** Called when user confirms using item(s). Now accepts quantity. */
  onUseItem: (itemId: string, quantity: number) => void;
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
  
  // State for confirmation dialog
  const [selectedItem, setSelectedItem] = useState<ResolvedInventoryItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Filter inventory by action type, respecting egg-compatible effects
  const availableItems = useMemo(() => {
    if (!profile) return [];
    return filterInventoryByAction(profile.storage, action, { stage: companion.stage });
  }, [profile, action, companion.stage]);

  // Check stage restrictions for this specific action
  const canUse = canUseAction(companion, action);
  const stageMessage = getStageRestrictionMessage(companion, action);

  const isEmpty = availableItems.length === 0;

  const handleSelectItem = (item: ResolvedInventoryItem) => {
    if (isUsingItem) return;
    setSelectedItem(item);
    setQuantity(1);
    setShowConfirmDialog(true);
  };

  const handleConfirmUse = () => {
    if (!selectedItem || isUsingItem) return;
    onUseItem(selectedItem.itemId, quantity);
    // Reset after starting use
    setShowConfirmDialog(false);
    setSelectedItem(null);
    setQuantity(1);
  };

  const handleCloseConfirmDialog = (isOpen: boolean) => {
    if (!isOpen) {
      setShowConfirmDialog(false);
      setSelectedItem(null);
      setQuantity(1);
    }
  };

  const handleOpenShop = () => {
    onOpenChange(false);
    onOpenShop();
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
                  onUse={() => handleSelectItem(item)}
                  isUsing={isUsingItem && usingItemId === item.itemId}
                  disabled={isUsingItem}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>

      {/* Confirmation Dialog with Quantity Selector */}
      {selectedItem && (
        <BlobbiUseItemConfirmDialog
          open={showConfirmDialog}
          onOpenChange={handleCloseConfirmDialog}
          item={selectedItem}
          companion={companion}
          action={action}
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
      // For eggs using medicine, show health preview
      // Eggs use the 3-stat model: health, hygiene, happiness
      return {
        normalStatChanges: [],
        eggStatChanges: previewMedicineForEgg(companion.stats.health, item.effect),
      };
    }
    if (isEgg && isClean) {
      // For eggs using hygiene items, show hygiene (and possibly happiness) preview
      return {
        normalStatChanges: [],
        eggStatChanges: previewCleanForEgg(
          { hygiene: companion.stats.hygiene, happiness: companion.stats.happiness },
          item.effect
        ),
      };
    }
    // Normal stats preview
    return {
      normalStatChanges: previewStatChanges(companion.stats, item.effect),
      eggStatChanges: [] as EggStatPreview[],
    };
  }, [companion.stats, item.effect, isEgg, isMedicine, isClean]);

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
            {/* Egg stat changes (health for medicine) */}
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

// ─── Use Item Confirmation Dialog ─────────────────────────────────────────────

interface BlobbiUseItemConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ResolvedInventoryItem;
  companion: BlobbiCompanion;
  action: InventoryAction;
  quantity: number;
  maxQuantity: number;
  onIncrease: () => void;
  onDecrease: () => void;
  onQuantityChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onConfirm: () => void;
  isUsing: boolean;
}

function BlobbiUseItemConfirmDialog({
  open,
  onOpenChange,
  item,
  companion,
  action,
  quantity,
  maxQuantity,
  onIncrease,
  onDecrease,
  onQuantityChange,
  onConfirm,
  isUsing,
}: BlobbiUseItemConfirmDialogProps) {
  const actionMeta = ACTION_METADATA[action];
  const isEgg = companion.stage === 'egg';
  const isMedicine = action === 'medicine';
  const isClean = action === 'clean';

  // Preview stat changes for the selected quantity
  const statPreview = useMemo(() => {
    if (!item.effect) return { normalChanges: [], eggChanges: [] };

    if (isEgg && isMedicine) {
      // Calculate health change for N items
      const healthDelta = item.effect.health ?? 0;
      let currentHealth = companion.stats.health ?? 0;
      for (let i = 0; i < quantity; i++) {
        currentHealth = Math.max(0, Math.min(100, currentHealth + healthDelta));
      }
      const totalDelta = currentHealth - (companion.stats.health ?? 0);
      return {
        normalChanges: [],
        eggChanges: totalDelta !== 0 ? [{ stat: 'health' as const, delta: totalDelta }] : [],
      };
    }

    if (isEgg && isClean) {
      // Calculate hygiene and happiness changes for N items
      const hygieneDelta = item.effect.hygiene ?? 0;
      const happinessDelta = item.effect.happiness ?? 0;
      let currentHygiene = companion.stats.hygiene ?? 0;
      let currentHappiness = companion.stats.happiness ?? 0;
      for (let i = 0; i < quantity; i++) {
        currentHygiene = Math.max(0, Math.min(100, currentHygiene + hygieneDelta));
        currentHappiness = Math.max(0, Math.min(100, currentHappiness + happinessDelta));
      }
      const changes: Array<{ stat: 'health' | 'hygiene' | 'happiness'; delta: number }> = [];
      const totalHygieneDelta = currentHygiene - (companion.stats.hygiene ?? 0);
      const totalHappinessDelta = currentHappiness - (companion.stats.happiness ?? 0);
      if (totalHygieneDelta !== 0) changes.push({ stat: 'hygiene', delta: totalHygieneDelta });
      if (totalHappinessDelta !== 0) changes.push({ stat: 'happiness', delta: totalHappinessDelta });
      return { normalChanges: [], eggChanges: changes };
    }

    // Normal stats preview - simulate N applications
    const statKeys = ['hunger', 'happiness', 'energy', 'hygiene', 'health'] as const;
    const currentStats = { ...companion.stats };
    for (let i = 0; i < quantity; i++) {
      for (const stat of statKeys) {
        const delta = item.effect[stat];
        if (delta !== undefined) {
          currentStats[stat] = Math.max(0, Math.min(100, (currentStats[stat] ?? 0) + delta));
        }
      }
    }
    const changes: Array<{ stat: string; delta: number }> = [];
    for (const stat of statKeys) {
      const delta = (currentStats[stat] ?? 0) - (companion.stats[stat] ?? 0);
      if (delta !== 0) {
        changes.push({ stat, delta });
      }
    }
    return { normalChanges: changes, eggChanges: [] };
  }, [item.effect, companion.stats, quantity, isEgg, isMedicine, isClean]);

  const hasChanges = statPreview.normalChanges.length > 0 || statPreview.eggChanges.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{actionMeta.label}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Item Preview */}
          <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
            <div className="text-4xl">{item.icon}</div>
            <div className="flex-1">
              <h3 className="font-semibold">{item.name}</h3>
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
          {hasChanges && (
            <div className="p-4 rounded-lg bg-gradient-to-r from-emerald-500/10 to-green-500/10 border border-emerald-500/20">
              <h4 className="text-sm font-medium mb-2">
                Total effect{quantity > 1 ? ` (x${quantity})` : ''}
              </h4>
              <div className="flex flex-wrap gap-2">
                {statPreview.normalChanges.map(({ stat, delta }) => (
                  <Badge
                    key={stat}
                    variant="secondary"
                    className={cn(
                      'text-xs',
                      delta > 0
                        ? 'bg-green-500/20 text-green-700 dark:text-green-300'
                        : 'bg-red-500/20 text-red-700 dark:text-red-300'
                    )}
                  >
                    {delta > 0 ? '+' : ''}{delta} {stat}
                  </Badge>
                ))}
                {statPreview.eggChanges.map(({ stat, delta }) => (
                  <Badge
                    key={stat}
                    variant="secondary"
                    className={cn(
                      'text-xs',
                      delta > 0
                        ? 'bg-green-500/20 text-green-700 dark:text-green-300'
                        : 'bg-red-500/20 text-red-700 dark:text-red-300'
                    )}
                  >
                    {delta > 0 ? '+' : ''}{delta} {stat}
                  </Badge>
                ))}
              </div>
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
