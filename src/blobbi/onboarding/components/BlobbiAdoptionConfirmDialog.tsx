/**
 * BlobbiAdoptionConfirmDialog - Confirmation modal before adopting
 * 
 * Shows a clear confirmation that adopting will cost 100 coins.
 */

import { Loader2, Heart, Coins, AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { BLOBBI_ADOPTION_COST } from '@/lib/blobbi';

import type { BlobbiEggPreview } from '../lib/blobbi-preview';
import { previewToBlobbiCompanion } from '../lib/blobbi-preview';

interface BlobbiAdoptionConfirmDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Called when dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** The preview being adopted */
  preview: BlobbiEggPreview;
  /** Current coin balance */
  coins: number;
  /** Whether adoption is in progress */
  isAdopting: boolean;
  /** Called when user confirms adoption */
  onConfirm: () => void;
}

export function BlobbiAdoptionConfirmDialog({
  open,
  onOpenChange,
  preview,
  coins,
  isAdopting,
  onConfirm,
}: BlobbiAdoptionConfirmDialogProps) {
  const companionForVisual = previewToBlobbiCompanion(preview);
  const coinsAfterAdoption = coins - BLOBBI_ADOPTION_COST;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm Adoption</DialogTitle>
          <DialogDescription>
            You're about to adopt this Blobbi. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Preview Visual */}
          <div className="flex justify-center">
            <BlobbiStageVisual
              companion={companionForVisual}
              size="md"
              animated
            />
          </div>
          
          {/* Cost Breakdown */}
          <div className="p-4 rounded-lg bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">Current Balance</span>
              <span className="font-semibold flex items-center gap-1">
                <Coins className="size-4 text-amber-500" />
                {coins} coins
              </span>
            </div>
            <div className="flex items-center justify-between mb-3 text-destructive">
              <span className="text-sm">Adoption Cost</span>
              <span className="font-semibold">-{BLOBBI_ADOPTION_COST} coins</span>
            </div>
            <div className="border-t border-amber-500/20 pt-3 flex items-center justify-between">
              <span className="text-sm font-medium">After Adoption</span>
              <span className="font-bold flex items-center gap-1">
                <Coins className="size-4 text-amber-500" />
                {coinsAfterAdoption} coins
              </span>
            </div>
          </div>
          
          {/* Confirmation Note */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
            <AlertCircle className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              By adopting, you'll spend <strong>{BLOBBI_ADOPTION_COST} coins</strong>.
              This Blobbi will become your companion and will be saved to your Nostr account.
            </p>
          </div>
        </div>
        
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isAdopting}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isAdopting}
            className="min-w-32"
          >
            {isAdopting ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Adopting...
              </>
            ) : (
              <>
                <Heart className="size-4 mr-2" />
                Adopt Now
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
