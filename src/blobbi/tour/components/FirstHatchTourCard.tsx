/**
 * FirstHatchTourCard - Inline card shown below the egg during the first-hatch tour.
 *
 * Replaces the modal. Rendered directly in the BlobbiPage layout so the
 * experience feels focused and guided rather than interrupted.
 */

import { Send, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FirstHatchTourCardProps {
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

export function FirstHatchTourCard({
  blobbiName,
  requiredPhrase,
  postCompleted,
  onCreatePost,
  onContinue,
}: FirstHatchTourCardProps) {
  const capitalizedName = blobbiName.charAt(0).toUpperCase() + blobbiName.slice(1);

  return (
    <div className="w-full max-w-sm mx-auto px-4 space-y-4">
      {/* Title + description */}
      <div className="text-center space-y-1.5">
        <h3 className="text-lg font-semibold">
          {capitalizedName} is ready to hatch!
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Share a post to the Nostr network and help {capitalizedName} break free.
        </p>
      </div>

      {/* Mission card */}
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
              Your post must include:
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

      {/* Continue or hint */}
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
  );
}
