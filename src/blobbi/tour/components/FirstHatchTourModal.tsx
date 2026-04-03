/**
 * FirstHatchTourModal - Modal shown during the `show_hatch_modal` tour step.
 *
 * Tells the user their egg is about to hatch and guides them to create a post.
 * Contains a single mission: create the hatch post.
 */

import { Egg, Send, Check } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FirstHatchTourModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The Blobbi's display name */
  blobbiName: string;
  /** The exact phrase the user needs to include in their post */
  requiredPhrase: string;
  /** Whether the post mission has been completed */
  postCompleted: boolean;
  /** Open the post composer */
  onCreatePost: () => void;
  /** Advance the tour (called after post is confirmed complete) */
  onContinue: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FirstHatchTourModal({
  open,
  onOpenChange,
  blobbiName,
  requiredPhrase,
  postCompleted,
  onCreatePost,
  onContinue,
}: FirstHatchTourModalProps) {
  const capitalizedName = blobbiName.charAt(0).toUpperCase() + blobbiName.slice(1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 gap-0 [&>button:last-child]:hidden">
        {/* Header with egg accent */}
        <div className="px-6 pt-8 pb-4 text-center space-y-3">
          <div className="mx-auto size-14 rounded-full bg-amber-500/10 flex items-center justify-center">
            <Egg className="size-7 text-amber-500" />
          </div>

          <DialogTitle className="text-xl font-bold">
            {capitalizedName} is ready to hatch!
          </DialogTitle>

          <p className="text-sm text-muted-foreground leading-relaxed">
            Share a post to the Nostr network and help {capitalizedName} break free.
          </p>
        </div>

        {/* Mission card */}
        <div className="px-6 pb-4">
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-start gap-3">
              {/* Status indicator */}
              <div className={
                postCompleted
                  ? 'mt-0.5 size-5 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0'
                  : 'mt-0.5 size-5 rounded-full border-2 border-muted-foreground/30 shrink-0'
              }>
                {postCompleted && <Check className="size-3 text-emerald-500" />}
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-sm font-medium">
                  {postCompleted ? 'Post shared!' : 'Share a hatch post'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Post must include the phrase:
                </p>
                <p className="text-xs font-medium text-primary break-words">
                  {requiredPhrase}
                </p>
              </div>
            </div>

            {!postCompleted && (
              <Button
                size="sm"
                className="w-full"
                onClick={onCreatePost}
              >
                <Send className="size-3.5 mr-2" />
                Create Post
              </Button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          {postCompleted ? (
            <Button className="w-full" onClick={onContinue}>
              Continue
            </Button>
          ) : (
            <p className="text-xs text-center text-muted-foreground">
              You can add extra text before or after the required phrase.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
