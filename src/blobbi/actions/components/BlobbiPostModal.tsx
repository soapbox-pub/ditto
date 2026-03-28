// src/blobbi/actions/components/BlobbiPostModal.tsx

/**
 * Modal for creating a Blobbi post (hatch or evolve).
 * 
 * Requirements:
 * - Prefilled with stage-aware text:
 *   - Hatch: "Hello Nostr! Posting to hatch #<blobbiName> #blobbi #ditto #nostr"
 *   - Evolve: "Hello Nostr! Posting to evolve #<blobbiName> #blobbi #ditto #nostr"
 * - User can ADD text but CANNOT delete the prefix or required hashtags
 * - Blobbi name is sanitized into a valid hashtag format
 * - Enforced programmatically
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
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
  BLOBBI_POST_REQUIRED_HASHTAGS,
} from '../hooks/useHatchTasks';

// ─── Types ────────────────────────────────────────────────────────────────────

/** The process type for the post */
export type BlobbiPostProcess = 'hatch' | 'evolve';

interface BlobbiPostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The Blobbi's name (will be converted to hashtag) */
  blobbiName: string;
  /** The process type - 'hatch' for incubation, 'evolve' for evolution */
  process?: BlobbiPostProcess;
  onSuccess?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sanitize a name into a valid hashtag format.
 * - Removes special characters
 * - Replaces spaces with nothing (camelCase-like)
 * - Ensures lowercase
 * - Handles edge cases
 */
function sanitizeToHashtag(name: string): string {
  return name
    .toLowerCase()
    // Remove emojis and special characters, keep letters, numbers, underscores
    .replace(/[^\p{L}\p{N}_]/gu, '')
    // Ensure it starts with a letter (prepend 'blobbi' if it starts with number)
    .replace(/^(\d)/, 'blobbi$1')
    // Limit length
    .slice(0, 30)
    // Fallback if empty
    || 'myblobbi';
}

/**
 * Build the required prefix text based on process type.
 */
function buildPrefix(process: BlobbiPostProcess): string {
  return process === 'evolve'
    ? 'Hello Nostr! Posting to evolve'
    : 'Hello Nostr! Posting to hatch';
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function BlobbiPostModal({
  open,
  onOpenChange,
  blobbiName,
  process = 'hatch',
  onSuccess,
}: BlobbiPostModalProps) {
  const { user } = useCurrentUser();
  const { mutateAsync: createEvent, isPending } = useNostrPublish();
  
  // Compute the required elements based on props
  const blobbiHashtag = useMemo(() => sanitizeToHashtag(blobbiName), [blobbiName]);
  const prefix = useMemo(() => buildPrefix(process), [process]);
  
  // All required hashtags including the Blobbi name (first)
  const allRequiredHashtags = useMemo(() => 
    [blobbiHashtag, ...BLOBBI_POST_REQUIRED_HASHTAGS],
    [blobbiHashtag]
  );
  
  // Build default content
  const defaultContent = useMemo(() => 
    `${prefix} #${allRequiredHashtags.join(' #')}`,
    [prefix, allRequiredHashtags]
  );
  
  const [content, setContent] = useState(defaultContent);
  const [validationError, setValidationError] = useState<string | null>(null);
  
  // Reset content when modal opens or props change
  useEffect(() => {
    if (open) {
      setContent(defaultContent);
      setValidationError(null);
    }
  }, [open, defaultContent]);
  
  /**
   * Validate that the content still contains the required prefix and hashtags.
   */
  const validateContent = useCallback((text: string): string | null => {
    // Check prefix
    if (!text.startsWith(prefix)) {
      return 'The post must start with the required text';
    }
    
    // Check all required hashtags are present (including Blobbi name)
    const lowerText = text.toLowerCase();
    for (const tag of allRequiredHashtags) {
      if (!lowerText.includes(`#${tag.toLowerCase()}`)) {
        return `Missing required hashtag: #${tag}`;
      }
    }
    
    return null;
  }, [prefix, allRequiredHashtags]);
  
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
      
      // Add all required hashtags as 't' tags
      for (const hashtag of allRequiredHashtags) {
        tags.push(['t', hashtag.toLowerCase()]);
      }
      
      // Extract any additional hashtags the user added
      const additionalHashtags = content.match(/#(\w+)/g) || [];
      const requiredLower = allRequiredHashtags.map(t => t.toLowerCase());
      for (const tag of additionalHashtags) {
        const tagValue = tag.slice(1).toLowerCase();
        if (!requiredLower.includes(tagValue)) {
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
        description: process === 'evolve' 
          ? 'Your Blobbi evolution post has been published.'
          : 'Your Blobbi hatch post has been published.',
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
  }, [user, content, validateContent, createEvent, onOpenChange, onSuccess, allRequiredHashtags, process]);
  
  const canPost = !validationError && content.trim().length > 0;
  
  const dialogTitle = process === 'evolve' ? 'Blobbi Evolution Post' : 'Blobbi Hatch Post';
  const alertText = process === 'evolve'
    ? "This special post announces your Blobbi's evolution! The highlighted text must remain in your post."
    : "This special post announces your Blobbi's hatching journey! The highlighted text must remain in your post.";
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b">
          <DialogTitle className="text-base font-semibold">
            {dialogTitle}
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
              {alertText}
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
              <span className="text-primary">{prefix}</span>
              {' '}
              {allRequiredHashtags.map(tag => (
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
