/**
 * BlobbiPhotoModal - Modal for taking and sharing Blobbi photos
 *
 * Features:
 * - Polaroid-style preview of the Blobbi
 * - Download as PNG
 * - Post to Nostr with Blossom upload
 *
 * Uses html-to-image for DOM-to-PNG conversion.
 */

import { useState, useRef, useCallback } from 'react';
import { toPng } from 'html-to-image';
import { Download, Send, Loader2, Camera } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BlobbiPolaroidCard } from './BlobbiPolaroidCard';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { toast } from '@/hooks/useToast';
import type { BlobbiCompanion } from '@/lib/blobbi';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BlobbiPhotoModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Callback when the modal should close */
  onOpenChange: (open: boolean) => void;
  /** The Blobbi companion to photograph */
  companion: BlobbiCompanion;
}

// ─── Utility Functions ────────────────────────────────────────────────────────

/**
 * Convert a data URL to a File object
 */
function dataUrlToFile(dataUrl: string, filename: string): File {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] ?? 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

/**
 * Trigger a file download in the browser
 */
function downloadFile(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BlobbiPhotoModal({
  open,
  onOpenChange,
  companion,
}: BlobbiPhotoModalProps) {
  const polaroidRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPosting, setIsPosting] = useState(false);

  const { user } = useCurrentUser();
  const { mutateAsync: uploadFile } = useUploadFile();
  const { mutateAsync: createEvent } = useNostrPublish();

  /**
   * Generate PNG from the polaroid card
   */
  const generateImage = useCallback(async (): Promise<string | null> => {
    if (!polaroidRef.current) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not capture the photo. Please try again.',
      });
      return null;
    }

    try {
      // Use html-to-image with high quality settings
      const dataUrl = await toPng(polaroidRef.current, {
        quality: 1.0,
        pixelRatio: 2, // 2x for retina displays
        cacheBust: true,
        // Skip external fonts that might fail to load
        skipFonts: true,
      });
      return dataUrl;
    } catch (error) {
      console.error('[BlobbiPhotoModal] Failed to generate image:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to generate the photo. Please try again.',
      });
      return null;
    }
  }, []);

  /**
   * Handle download action
   */
  const handleDownload = useCallback(async () => {
    setIsGenerating(true);
    try {
      const dataUrl = await generateImage();
      if (dataUrl) {
        const filename = `${companion.name.toLowerCase().replace(/\s+/g, '-')}-polaroid.png`;
        downloadFile(dataUrl, filename);
        toast({
          title: 'Photo saved!',
          description: 'Your Blobbi photo has been downloaded.',
        });
      }
    } finally {
      setIsGenerating(false);
    }
  }, [generateImage, companion.name]);

  /**
   * Handle post action - upload to Blossom and create Nostr post
   */
  const handlePost = useCallback(async () => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Not logged in',
        description: 'Please log in to post your Blobbi photo.',
      });
      return;
    }

    setIsPosting(true);
    try {
      // Generate the image
      const dataUrl = await generateImage();
      if (!dataUrl) {
        return;
      }

      // Convert to File for upload
      const filename = `${companion.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`;
      const file = dataUrlToFile(dataUrl, filename);

      // Upload to Blossom - returns NIP-94 compatible tags
      const tags = await uploadFile(file);

      // Extract URL from the 'url' tag (NIP-94 format)
      // The upload hook returns tags like [['url', '...'], ['m', '...'], ['x', '...'], ...]
      const urlTag = tags.find((tag) => tag[0] === 'url');
      if (!urlTag || !urlTag[1]) {
        throw new Error('Upload succeeded but no URL was returned');
      }
      const url = urlTag[1];

      // Build imeta tag from all NIP-94 tags
      // Format: ['imeta', 'url https://...', 'm image/png', 'x abc123', ...]
      const imetaFields = tags.map((tag) => `${tag[0]} ${tag[1]}`);

      // Create the post content
      const content = `${companion.name} ${url}`;

      // Publish kind 1 event
      await createEvent({
        kind: 1,
        content,
        tags: [['imeta', ...imetaFields]],
      });

      toast({
        title: 'Posted!',
        description: 'Your Blobbi photo has been shared.',
      });

      // Close the modal after successful post
      onOpenChange(false);
    } catch (error) {
      console.error('[BlobbiPhotoModal] Failed to post:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to post',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setIsPosting(false);
    }
  }, [user, generateImage, companion.name, uploadFile, createEvent, onOpenChange]);

  const isProcessing = isGenerating || isPosting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="size-5" />
            Take a Photo
          </DialogTitle>
          <DialogDescription>
            Capture a polaroid-style photo of {companion.name}
          </DialogDescription>
        </DialogHeader>

        {/* Polaroid preview - centered */}
        <div className="flex justify-center py-4">
          <BlobbiPolaroidCard
            ref={polaroidRef}
            companion={companion}
            showStage
          />
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            onClick={handleDownload}
            disabled={isProcessing}
            className="flex-1"
          >
            {isGenerating ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <Download className="size-4 mr-2" />
            )}
            Download
          </Button>

          <Button
            onClick={handlePost}
            disabled={isProcessing || !user}
            className="flex-1"
          >
            {isPosting ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <Send className="size-4 mr-2" />
            )}
            Post
          </Button>
        </div>

        {/* Login hint if not logged in */}
        {!user && (
          <p className="text-sm text-muted-foreground text-center">
            Log in to post your Blobbi photo
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
