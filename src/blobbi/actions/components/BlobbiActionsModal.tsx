// src/blobbi/actions/components/BlobbiActionsModal.tsx

import { Loader2, Moon, Sun, Utensils, Gamepad2, Sparkles as SparklesIcon } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

import type { BlobbiCompanion } from '@/lib/blobbi';
import { canUseInventoryItems } from '../lib/blobbi-action-utils';
import type { InventoryAction } from '../lib/blobbi-action-utils';

interface BlobbiActionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companion: BlobbiCompanion;
  onRest: () => void;
  onInventoryAction: (action: InventoryAction) => void;
  actionInProgress: string | null;
  isPublishing: boolean;
}

export function BlobbiActionsModal({
  open,
  onOpenChange,
  companion,
  onRest,
  onInventoryAction,
  actionInProgress,
  isPublishing,
}: BlobbiActionsModalProps) {
  const isSleeping = companion.state === 'sleeping';
  const isDisabled = isPublishing || actionInProgress !== null;
  const canUseItems = canUseInventoryItems(companion);

  const handleAction = (action: () => void) => {
    action();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Blobbi Actions</DialogTitle>
          <p className="text-sm text-muted-foreground">{companion.name}</p>
        </DialogHeader>
        <div className="grid gap-3 pt-2">
          {/* Feed Action */}
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-14"
            onClick={() => handleAction(() => onInventoryAction('feed'))}
            disabled={isDisabled}
          >
            <Utensils className="size-5 text-orange-500" />
            <div className="text-left">
              <p className="font-medium">Feed</p>
              <p className="text-xs text-muted-foreground">
                {canUseItems ? 'Give your Blobbi something to eat' : 'Not available for eggs'}
              </p>
            </div>
          </Button>

          {/* Play Action */}
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-14"
            onClick={() => handleAction(() => onInventoryAction('play'))}
            disabled={isDisabled}
          >
            <Gamepad2 className="size-5 text-yellow-500" />
            <div className="text-left">
              <p className="font-medium">Play</p>
              <p className="text-xs text-muted-foreground">
                {canUseItems ? 'Play with toys to make your Blobbi happy' : 'Not available for eggs'}
              </p>
            </div>
          </Button>

          {/* Clean Action */}
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-14"
            onClick={() => handleAction(() => onInventoryAction('clean'))}
            disabled={isDisabled}
          >
            <SparklesIcon className="size-5 text-blue-500" />
            <div className="text-left">
              <p className="font-medium">Clean</p>
              <p className="text-xs text-muted-foreground">
                {canUseItems ? 'Keep your Blobbi clean and fresh' : 'Not available for eggs'}
              </p>
            </div>
          </Button>

          {/* Sleep/Wake Action */}
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-14"
            onClick={() => handleAction(onRest)}
            disabled={isDisabled}
          >
            {actionInProgress === 'rest' ? (
              <Loader2 className="size-5 animate-spin" />
            ) : isSleeping ? (
              <Sun className="size-5 text-amber-500" />
            ) : (
              <Moon className="size-5 text-violet-500" />
            )}
            <div className="text-left">
              <p className="font-medium">{isSleeping ? 'Wake Up' : 'Sleep'}</p>
              <p className="text-xs text-muted-foreground">
                {isSleeping ? 'Wake your Blobbi up' : 'Put your Blobbi to sleep'}
              </p>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
