import { useState } from 'react';
import { Star } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePublishReview, useUserBookReview } from '@/hooks/useBookReviews';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import type { BookReview } from '@/lib/bookstr';

interface BookReviewFormDialogProps {
  isbn: string;
  children: React.ReactNode;
}

/** Dialog wrapper that opens a review form. */
export function BookReviewFormDialog({ isbn, children }: BookReviewFormDialogProps) {
  const [open, setOpen] = useState(false);
  const { data: existingReview } = useUserBookReview(isbn);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {existingReview ? 'Edit Review' : 'Write a Review'}
          </DialogTitle>
        </DialogHeader>
        <BookReviewForm
          isbn={isbn}
          existingReview={existingReview?.review}
          onClose={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

interface BookReviewFormProps {
  isbn: string;
  existingReview?: BookReview;
  onClose?: () => void;
}

/** Inline review form with star rating, text, and spoiler support. */
function BookReviewForm({ isbn, existingReview, onClose }: BookReviewFormProps) {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const [content, setContent] = useState(existingReview?.content ?? '');
  const [rating, setRating] = useState(existingReview?.rating !== undefined ? Math.round(existingReview.rating * 5) : 0);
  const [hasSpoiler, setHasSpoiler] = useState(!!existingReview?.contentWarning);
  const [contentWarning, setContentWarning] = useState(existingReview?.contentWarning ?? '');

  const { mutate: publishReview, isPending } = usePublishReview();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim() && rating === 0) {
      toast({ title: 'Please provide either a written review or a rating', variant: 'destructive' });
      return;
    }

    const review: BookReview = {
      isbn,
      content: content.trim(),
      rating: rating > 0 ? rating / 5 : undefined,
      contentWarning: hasSpoiler && contentWarning.trim() ? contentWarning.trim() : undefined,
    };

    publishReview(review, {
      onSuccess: () => {
        toast({ title: existingReview ? 'Review updated' : 'Review published' });
        onClose?.();
      },
      onError: () => {
        toast({ title: 'Failed to publish review', variant: 'destructive' });
      },
    });
  };

  if (!user) return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Star rating */}
      <div className="space-y-2">
        <Label>Rating (optional)</Label>
        <div className="flex items-center gap-2">
          <div className="flex">
            {[...Array(5)].map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setRating(i + 1)}
                className="p-0.5 hover:scale-110 transition-transform"
              >
                <Star
                  className={cn(
                    'size-7',
                    i < rating
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-muted-foreground/30 hover:text-amber-400',
                  )}
                />
              </button>
            ))}
          </div>
          {rating > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {rating}/5
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setRating(0)}
              >
                Clear
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Review text */}
      <div className="space-y-2">
        <Label htmlFor="review-content">Review (optional)</Label>
        <Textarea
          id="review-content"
          placeholder="Share your thoughts about this book..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
        />
      </div>

      {/* Spoiler warning */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="spoiler"
            checked={hasSpoiler}
            onCheckedChange={(checked) => setHasSpoiler(checked === true)}
          />
          <Label htmlFor="spoiler" className="text-sm cursor-pointer">
            This review contains spoilers
          </Label>
        </div>

        {hasSpoiler && (
          <div className="space-y-2">
            <Label htmlFor="warning-message">Spoiler warning message</Label>
            <Input
              id="warning-message"
              placeholder="e.g., Major plot points discussed"
              value={contentWarning}
              onChange={(e) => setContentWarning(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Publishing...' : existingReview ? 'Update Review' : 'Publish Review'}
        </Button>
      </div>
    </form>
  );
}
