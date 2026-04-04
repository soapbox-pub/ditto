/**
 * BlobbiPhotoModal - Fullscreen photo overlay
 *
 * Simple blurred overlay with the polaroid photo centered,
 * and download/share buttons below. Tap outside to close.
 */

import { useState, useRef, useCallback } from 'react';
import { toPng } from 'html-to-image';
import { Download, Share2, Loader2, X } from 'lucide-react';

import { BlobbiPolaroidCard } from './BlobbiPolaroidCard';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { toast } from '@/hooks/useToast';
import { downloadTextFile, openUrl } from '@/lib/downloadFile';
import { trackDailyMissionProgress } from '@/blobbi/actions';
import { cn } from '@/lib/utils';
import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';
import { Capacitor } from '@capacitor/core';

export interface BlobbiPhotoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companion: BlobbiCompanion;
}

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

export function BlobbiPhotoModal({
  open,
  onOpenChange,
  companion,
}: BlobbiPhotoModalProps) {
  const polaroidRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const { user } = useCurrentUser();
  const { mutateAsync: uploadFile } = useUploadFile();
  const { mutateAsync: createEvent } = useNostrPublish();

  const generateImage = useCallback(async (): Promise<string | null> => {
    if (!polaroidRef.current) return null;
    try {
      return await toPng(polaroidRef.current, {
        quality: 1.0,
        pixelRatio: 2,
        cacheBust: true,
        skipFonts: true,
      });
    } catch (error) {
      console.error('[BlobbiPhoto] Failed to generate image:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to capture photo.' });
      return null;
    }
  }, []);

  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    try {
      const dataUrl = await generateImage();
      if (!dataUrl) return;
      const filename = `${companion.name.toLowerCase().replace(/\s+/g, '-')}-photo.png`;

      if (Capacitor.isNativePlatform()) {
        // On native, use the download utility which handles share sheet
        const blob = dataUrlToFile(dataUrl, filename);
        const url = URL.createObjectURL(blob);
        await openUrl(url);
        URL.revokeObjectURL(url);
      } else {
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        link.click();
      }

      toast({ title: 'Photo saved!' });
    } finally {
      setIsDownloading(false);
    }
  }, [generateImage, companion.name]);

  const handleShare = useCallback(async () => {
    if (!user) return;
    setIsSharing(true);
    try {
      const dataUrl = await generateImage();
      if (!dataUrl) return;

      const filename = `${companion.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`;
      const file = dataUrlToFile(dataUrl, filename);
      const tags = await uploadFile(file);

      const urlTag = tags.find((tag) => tag[0] === 'url');
      if (!urlTag?.[1]) throw new Error('Upload succeeded but no URL returned');
      const url = urlTag[1];

      const imetaFields = tags.map((tag) => `${tag[0]} ${tag[1]}`);
      await createEvent({
        kind: 1,
        content: `${companion.name} ${url}`,
        tags: [['imeta', ...imetaFields]],
      });

      toast({ title: 'Posted!', description: 'Your Blobbi photo has been shared.' });
      trackDailyMissionProgress('take_photo', 1, user.pubkey);
      onOpenChange(false);
    } catch (error) {
      console.error('[BlobbiPhoto] Failed to share:', error);
      toast({ variant: 'destructive', title: 'Failed to post', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setIsSharing(false);
    }
  }, [user, generateImage, companion.name, uploadFile, createEvent, onOpenChange]);

  if (!open) return null;

  const isProcessing = isDownloading || isSharing;

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center">
      {/* Backdrop — tap to close */}
      <div
        className="absolute inset-0 bg-background/60 backdrop-blur-sm"
        onClick={() => !isProcessing && onOpenChange(false)}
      />

      {/* Close button — top-right of the container */}
      <button
        onClick={() => !isProcessing && onOpenChange(false)}
        className="absolute top-3 right-3 z-10 p-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="size-5" />
      </button>

      {/* Polaroid card */}
      <div className="relative z-10 animate-in fade-in zoom-in-95 duration-200">
        <BlobbiPolaroidCard
          ref={polaroidRef}
          companion={companion}
          showStage
        />
      </div>

      {/* Action buttons */}
      <div className="relative z-10 flex items-center gap-6 mt-8">
        <button
          onClick={handleDownload}
          disabled={isProcessing}
          className={cn(
            'flex flex-col items-center gap-1.5 transition-all duration-200',
            'hover:scale-110 active:scale-95',
            isProcessing && 'opacity-50 pointer-events-none',
          )}
        >
          <div className="size-14 rounded-full flex items-center justify-center text-sky-500" style={{
            background: 'radial-gradient(circle at 40% 35%, color-mix(in srgb, #0ea5e9 25%, transparent), color-mix(in srgb, #0ea5e9 10%, transparent) 70%)',
          }}>
            {isDownloading ? <Loader2 className="size-6 animate-spin" /> : <Download className="size-6" />}
          </div>
          <span className="text-xs font-medium text-muted-foreground">Save</span>
        </button>

        {user && (
          <button
            onClick={handleShare}
            disabled={isProcessing}
            className={cn(
              'flex flex-col items-center gap-1.5 transition-all duration-200',
              'hover:scale-110 active:scale-95',
              isProcessing && 'opacity-50 pointer-events-none',
            )}
          >
            <div className="size-14 rounded-full flex items-center justify-center text-violet-500" style={{
              background: 'radial-gradient(circle at 40% 35%, color-mix(in srgb, #8b5cf6 25%, transparent), color-mix(in srgb, #8b5cf6 10%, transparent) 70%)',
            }}>
              {isSharing ? <Loader2 className="size-6 animate-spin" /> : <Share2 className="size-6" />}
            </div>
            <span className="text-xs font-medium text-muted-foreground">Post</span>
          </button>
        )}
      </div>
    </div>
  );
}
