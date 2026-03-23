// src/blobbi/actions/components/BlobbiActionsModal.tsx

import { Loader2, Moon, Sun, Utensils, Gamepad2, Sparkles as SparklesIcon, Pill, Music, Mic, X } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

import type { BlobbiCompanion } from '@/lib/blobbi';
import type { InventoryAction, DirectAction } from '../lib/blobbi-action-utils';

interface BlobbiActionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companion: BlobbiCompanion;
  onRest: () => void;
  onInventoryAction: (action: InventoryAction) => void;
  onDirectAction: (action: DirectAction) => void;
  actionInProgress: string | null;
  isPublishing: boolean;
}

export function BlobbiActionsModal({
  open,
  onOpenChange,
  companion,
  onRest,
  onInventoryAction,
  onDirectAction,
  actionInProgress,
  isPublishing,
}: BlobbiActionsModalProps) {
  const isSleeping = companion.state === 'sleeping';
  const isDisabled = isPublishing || actionInProgress !== null;
  const isEgg = companion.stage === 'egg';

  const handleAction = (action: () => void) => {
    action();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm w-[calc(100%-2rem)] max-h-[85vh] flex flex-col p-0 gap-0 [&>button:last-child]:hidden">
        {/* Header - Sticky */}
        <DialogHeader className="sticky top-0 z-10 bg-background px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 border-b">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle>Blobbi Actions</DialogTitle>
              <p className="text-sm text-muted-foreground">{companion.name}</p>
            </div>
            <DialogClose className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
              <X className="size-5" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
        </DialogHeader>
        {/* Content - Scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="grid gap-3">
          {/* Feed Action - hidden for eggs */}
          {!isEgg && (
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
                  Give your Blobbi something to eat
                </p>
              </div>
            </Button>
          )}

          {/* Play Action - hidden for eggs */}
          {!isEgg && (
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
                  Play with toys to make your Blobbi happy
                </p>
              </div>
            </Button>
          )}

          {/* Clean Action - available for all stages */}
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
                {isEgg 
                  ? 'Keep your egg clean and fresh' 
                  : 'Keep your Blobbi clean and fresh'}
              </p>
            </div>
          </Button>

          {/* Medicine Action - available for all stages */}
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-14"
            onClick={() => handleAction(() => onInventoryAction('medicine'))}
            disabled={isDisabled}
          >
            <Pill className="size-5 text-green-500" />
            <div className="text-left">
              <p className="font-medium">Medicine</p>
              <p className="text-xs text-muted-foreground">
                {isEgg 
                  ? 'Keep your egg healthy' 
                  : 'Heal your Blobbi'}
              </p>
            </div>
          </Button>

          {/* Play Music Action - available for all stages */}
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-14"
            onClick={() => handleAction(() => onDirectAction('play_music'))}
            disabled={isDisabled}
          >
            <Music className="size-5 text-pink-500" />
            <div className="text-left">
              <p className="font-medium">Play Music</p>
              <p className="text-xs text-muted-foreground">
                {isEgg 
                  ? 'Play soothing music for your egg' 
                  : 'Play music for your Blobbi'}
              </p>
            </div>
          </Button>

          {/* Sing Action - available for all stages */}
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-14"
            onClick={() => handleAction(() => onDirectAction('sing'))}
            disabled={isDisabled}
          >
            <Mic className="size-5 text-purple-500" />
            <div className="text-left">
              <p className="font-medium">Sing</p>
              <p className="text-xs text-muted-foreground">
                {isEgg 
                  ? 'Sing a lullaby to your egg' 
                  : 'Sing to your Blobbi'}
              </p>
            </div>
          </Button>

          {/* Sleep/Wake Action - hidden for eggs */}
          {!isEgg && (
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
          )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
