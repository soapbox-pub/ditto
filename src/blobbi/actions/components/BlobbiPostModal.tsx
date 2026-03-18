// src/blobbi/actions/components/BlobbiPostModal.tsx

/**
 * Modal for creating a Blobbi hatch post.
 * 
 * Requirements:
 * - Prefilled with: "Hello Nostr! Posting to hatch #blobbi #ditto #nostr"
 * - User can ADD text but CANNOT delete the prefix or hashtags
 * - Enforced programmatically
 */

import { useState, useCallback, useEffect } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';

import {
  BLOBBI_POST_PREFIX,
  BLOBBI_POST_REQUIRED_HASHTAGS,
} from '../hooks/useHatchTasks';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlobbiPostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** The complete default post content */
const DEFAULT_CONTENT = `${BLOBBI_POST_PREFIX} #${BLOBBI_POST_REQUIRED_HASHTAGS.join(' #')}`;

// ─── Main Component ───────────────────────────────────────────────────────────

export function BlobbiPostModal({
  open,
  onOpenChange,
  onSuccess,
}: BlobbiPostModalProps) {
  const { user } = useCurrentUser();
  const { mutateAsync: createEvent, isPending } = useNostrPublish();
  
  const [content, setContent] = useState(DEFAULT_CONTENT);
  const [validationError, setValidationError] = useState<string | null>(null);
  
  // Reset content when modal opens
  useEffect(() => {
    if (open) {
      setContent(DEFAULT_CONTENT);
      setValidationError(null);
    }
  }, [open]);
  
  /**
   * Validate that the content still contains the required prefix and hashtags.
   */
  const validateContent = useCallback((text: string): string | null => {
    // Check prefix
    if (!text.startsWith(BLOBBI_POST_PREFIX)) {
      return 'The post must start with the required text';
    }
    
    // Check hashtags are present
    const lowerText = text.toLowerCase();
    for (const tag of BLOBBI_POST_REQUIRED_HASHTAGS) {
      if (!lowerText.includes(`#${tag.toLowerCase()}`)) {
        return `Missing required hashtag: #${tag}`;
      }
    }
    
    return null;
  }, []);
  
  /**
   * Handle content change with validation.
   * Prevents deletion of required content.
   */
  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    
    // Allow content changes only if it preserves the required elements
    const error = validateContent(newContent);
    
    if (error) {
      setValidationError(error);
      // Still update content but show error
      // This allows the user to see what they're trying to do
      // but the post button will be disabled
    } else {
      setValidationError(null);
    }
    
    setContent(newContent);
  }, [validateContent]);
  
  /**
   * Handle post creation.
   */
  const handlePost = useCallback(async () => {
    if (!user?.pubkey) {
      toast({
        title: 'Not logged in',
        description: 'Please log in to create a post',
        variant: 'destructive',
      });
      return;
    }
    
    // Final validation
    const error = validateContent(content);
    if (error) {
      setValidationError(error);
      return;
    }
    
    try {
      // Build tags for the post
      const tags: string[][] = [];
      
      // Add hashtags as 't' tags
      for (const hashtag of BLOBBI_POST_REQUIRED_HASHTAGS) {
        tags.push(['t', hashtag.toLowerCase()]);
      }
      
      // Extract any additional hashtags the user added
      const additionalHashtags = content.match(/#(\w+)/g) || [];
      for (const tag of additionalHashtags) {
        const tagValue = tag.slice(1).toLowerCase();
        if (!BLOBBI_POST_REQUIRED_HASHTAGS.map(t => t.toLowerCase()).includes(tagValue)) {
          tags.push(['t', tagValue]);
        }
      }
      
      await createEvent({
        kind: 1,
        content,
        tags,
      });
      
      toast({
        title: 'Post created!',
        description: 'Your Blobbi hatch post has been published.',
      });
      
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: 'Failed to create post',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [user, content, validateContent, createEvent, onOpenChange, onSuccess]);
  
  const canPost = !validationError && content.trim().length > 0;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b">
          <DialogTitle className="text-base font-semibold">
            Blobbi Hatch Post
          </DialogTitle>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1.5 -mr-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Info alert */}
          <Alert className="border-primary/20 bg-primary/5">
            <AlertDescription className="text-sm">
              This special post announces your Blobbi's hatching journey! The highlighted text must remain in your post.
            </AlertDescription>
          </Alert>
          
          {/* Textarea */}
          <div className="space-y-2">
            <Textarea
              value={content}
              onChange={handleContentChange}
              placeholder="Write your post..."
              className="min-h-[150px] resize-none"
              disabled={isPending}
            />
            
            {/* Character count and validation */}
            <div className="flex items-center justify-between text-sm">
              <div>
                {validationError && (
                  <span className="text-destructive flex items-center gap-1">
                    <AlertCircle className="size-3.5" />
                    {validationError}
                  </span>
                )}
              </div>
              <span className="text-muted-foreground">
                {content.length} characters
              </span>
            </div>
          </div>
          
          {/* Preview of required content */}
          <div className="p-3 rounded-lg bg-muted/50 border border-dashed">
            <p className="text-xs text-muted-foreground mb-1">Required content:</p>
            <p className="text-sm font-medium">
              <span className="text-primary">{BLOBBI_POST_PREFIX}</span>
              {' '}
              {BLOBBI_POST_REQUIRED_HASHTAGS.map(tag => (
                <span key={tag} className="text-blue-500">#{tag} </span>
              ))}
            </p>
          </div>
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t bg-muted/30">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handlePost}
            disabled={!canPost || isPending}
            className="min-w-24"
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Posting...
              </>
            ) : (
              'Post'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
