import { useCallback, useRef, useState } from 'react';
import { AlertTriangle, ImagePlus, Loader2, X } from 'lucide-react';
import { encode as blurhashEncode } from 'blurhash';

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { useAppContext } from '@/hooks/useAppContext';
import { resizeImage } from '@/lib/resizeImage';
import { extractHashtags } from '@/lib/hashtag';
import { cn } from '@/lib/utils';

const MAX_CAPTION_CHARS = 2000;

/** Uploaded image with its metadata and NIP-94 tags. */
interface UploadedImage {
  /** Display URL for preview. */
  url: string;
  /** NIP-94 tags from the upload (url, m, size, etc.). */
  tags: string[][];
  /** Image dimensions string, e.g. "1920x1080". */
  dim?: string;
  /** BlurHash for loading previews. */
  blurhash?: string;
  /** Alt text for accessibility. */
  alt: string;
}

/**
 * Compute image dimensions and blurhash for a File.
 * Returns empty values for non-image files or on failure.
 */
async function getImageMeta(file: File): Promise<{ dim?: string; blurhash?: string }> {
  if (!file.type.startsWith('image/')) return {};
  try {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = url;
      });

      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      if (!naturalWidth || !naturalHeight) return {};

      const dim = `${naturalWidth}x${naturalHeight}`;

      const SAMPLE_W = 64;
      const scale = SAMPLE_W / naturalWidth;
      const sampleW = SAMPLE_W;
      const sampleH = Math.max(1, Math.round(naturalHeight * scale));

      const canvas = document.createElement('canvas');
      canvas.width = sampleW;
      canvas.height = sampleH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { dim };

      ctx.drawImage(img, 0, 0, sampleW, sampleH);
      const { data } = ctx.getImageData(0, 0, sampleW, sampleH);

      const blurhash = blurhashEncode(data, sampleW, sampleH, 4, 3);
      return { dim, blurhash };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return {};
  }
}

interface PhotoComposeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function PhotoComposeModal({ open, onOpenChange, onSuccess }: PhotoComposeModalProps) {
  const { user } = useCurrentUser();
  const { mutateAsync: createEvent, isPending: isPublishing } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { config } = useAppContext();
  const imageQuality = config.imageQuality;

  const [images, setImages] = useState<UploadedImage[]>([]);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [cwEnabled, setCwEnabled] = useState(false);
  const [cwText, setCwText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const charCount = caption.length;
  const canPublish = images.length > 0 && title.trim().length > 0 && !isUploading && !isPublishing;

  const resetForm = useCallback(() => {
    setImages([]);
    setTitle('');
    setCaption('');
    setCwEnabled(false);
    setCwText('');
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Only image files are allowed.', variant: 'destructive' });
      return;
    }

    try {
      let uploadableFile: File;
      let resizedDim: string | undefined;

      if (imageQuality === 'compressed') {
        const resized = await resizeImage(file);
        uploadableFile = resized.file;
        resizedDim = resized.dimensions;
      } else {
        uploadableFile = file;
      }

      const tags = await uploadFile(uploadableFile);
      const [[, url]] = tags;

      // Compute dim + blurhash
      let dim = resizedDim;
      let blurhash: string | undefined;

      if (!dim) {
        const meta = await getImageMeta(uploadableFile);
        dim = meta.dim;
        blurhash = meta.blurhash;
      } else {
        const meta = await getImageMeta(uploadableFile);
        blurhash = meta.blurhash;
      }

      setImages((prev) => [...prev, {
        url,
        tags,
        dim,
        blurhash,
        alt: '',
      }]);
    } catch {
      toast({ title: 'Upload failed', description: 'Could not upload image.', variant: 'destructive' });
    }
  }, [uploadFile, toast, imageQuality]);

  const handleRemoveImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleAltChange = useCallback((index: number, alt: string) => {
    setImages((prev) => prev.map((img, i) => i === index ? { ...img, alt } : img));
  }, []);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          await handleFileUpload(file);
        }
        break;
      }
    }
  }, [handleFileUpload]);

  const handleSubmit = async () => {
    if (!canPublish || !user) return;

    try {
      const tags: string[][] = [];

      // Title tag (required by NIP-68)
      tags.push(['title', title.trim()]);

      // Build imeta tags for each uploaded image
      for (const img of images) {
        const imetaFields: string[] = [
          `url ${img.url}`,
        ];

        // Add mime type from upload tags
        const mimeTag = img.tags.find(t => t[0] === 'm');
        if (mimeTag) {
          imetaFields.push(`m ${mimeTag[1]}`);
        }

        if (img.dim) {
          imetaFields.push(`dim ${img.dim}`);
        }
        if (img.blurhash) {
          imetaFields.push(`blurhash ${img.blurhash}`);
        }
        if (img.alt.trim()) {
          imetaFields.push(`alt ${img.alt.trim()}`);
        }

        // Add hash if present in upload tags
        const hashTag = img.tags.find(t => t[0] === 'x');
        if (hashTag) {
          imetaFields.push(`x ${hashTag[1]}`);
        }

        tags.push(['imeta', ...imetaFields]);
      }

      // Extract hashtags from caption
      const captionText = caption.trim();
      for (const tag of extractHashtags(captionText)) {
        tags.push(['t', tag]);
      }

      // Content warning
      if (cwEnabled) {
        tags.push(['content-warning', cwText || '']);
        tags.push(['L', 'content-warning']);
        if (cwText) {
          tags.push(['l', cwText, 'content-warning']);
        }
      }

      // NIP-31 alt tag for clients that don't support kind 20
      tags.push(['alt', `Photo: ${title.trim()}`]);

      await createEvent({
        kind: 20,
        content: captionText,
        tags,
      });

      // Invalidate feeds to show the new photo
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['trending'] });

      toast({ title: 'Photo published!', description: 'Your photo has been shared.' });
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch {
      toast({ title: 'Error', description: 'Failed to publish photo.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[520px] max-h-[85vh] rounded-2xl p-0 gap-0 border-border overflow-hidden [&>button]:hidden flex flex-col"
        onPaste={handlePaste}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-12 shrink-0 border-b border-border/50">
          <DialogTitle className="text-base font-semibold">
            New photo
          </DialogTitle>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1.5 -mr-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Image upload area */}
            {images.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className={cn(
                  'w-full aspect-[4/3] rounded-xl border-2 border-dashed transition-colors flex flex-col items-center justify-center gap-3',
                  isUploading
                    ? 'border-primary/30 bg-primary/5 cursor-wait'
                    : 'border-border hover:border-primary/50 hover:bg-primary/5 cursor-pointer',
                )}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="size-8 text-primary animate-spin" />
                    <p className="text-sm text-muted-foreground">Uploading...</p>
                  </>
                ) : (
                  <>
                    <div className="size-14 rounded-full bg-primary/10 flex items-center justify-center">
                      <ImagePlus className="size-7 text-primary" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground">Choose a photo</p>
                      <p className="text-xs text-muted-foreground mt-0.5">or paste from clipboard</p>
                    </div>
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-3">
                {/* Image previews */}
                <div className={cn(
                  'grid gap-2',
                  images.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
                )}>
                  {images.map((img, index) => (
                    <div key={img.url} className="relative group rounded-xl overflow-hidden bg-secondary/30">
                      <img
                        src={img.url}
                        alt={img.alt || `Photo ${index + 1}`}
                        className="w-full aspect-square object-cover"
                      />
                      {/* Remove button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(index)}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                      >
                        <X className="size-4" />
                      </button>
                      {/* Alt text input overlay */}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6">
                        <input
                          type="text"
                          dir="auto"
                          value={img.alt}
                          onChange={(e) => handleAltChange(index, e.target.value)}
                          placeholder="Alt text (accessibility)"
                          className="w-full bg-black/30 backdrop-blur-sm text-white placeholder:text-white/50 text-xs rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-white/40"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add more button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-full py-2.5 rounded-xl border border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary"
                >
                  {isUploading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ImagePlus className="size-4" />
                  )}
                  {isUploading ? 'Uploading...' : 'Add more photos'}
                </button>
              </div>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = e.target.files;
                if (files) {
                  Array.from(files).forEach((file) => handleFileUpload(file));
                }
                e.target.value = '';
              }}
            />

            {/* Title field */}
            <div className="space-y-1.5">
              <label htmlFor="photo-title" className="text-xs font-medium text-muted-foreground">
                Title <span className="text-destructive">*</span>
              </label>
              <Input
                id="photo-title"
                dir="auto"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Give your photo a title"
                maxLength={200}
                className="bg-secondary/40 border-0 rounded-lg focus-visible:ring-1 focus-visible:ring-primary/40"
              />
            </div>

            {/* Caption field */}
            <div className="space-y-1.5">
              <label htmlFor="photo-caption" className="text-xs font-medium text-muted-foreground">
                Caption
              </label>
              <textarea
                id="photo-caption"
                dir="auto"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Write a caption... (supports #hashtags)"
                rows={3}
                maxLength={MAX_CAPTION_CHARS}
                className="w-full bg-secondary/40 rounded-lg px-3 py-2 text-sm outline-none resize-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground"
              />
              {charCount > 0 && (
                <p className={cn(
                  'text-xs text-right tabular-nums',
                  charCount > MAX_CAPTION_CHARS * 0.9 ? 'text-amber-500' : 'text-muted-foreground',
                )}>
                  {charCount}/{MAX_CAPTION_CHARS}
                </p>
              )}
            </div>

            {/* Content warning toggle */}
            <div>
              <button
                type="button"
                onClick={() => setCwEnabled((v) => !v)}
                className={cn(
                  'flex items-center gap-2 text-xs font-medium transition-colors',
                  cwEnabled ? 'text-amber-500' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <AlertTriangle className="size-3.5" />
                {cwEnabled ? 'Content warning enabled' : 'Add content warning'}
              </button>

              {cwEnabled && (
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    value={cwText}
                    onChange={(e) => setCwText(e.target.value)}
                    placeholder="Content warning reason (optional)"
                    className="h-8 text-sm bg-secondary/40 border-0 rounded-lg"
                  />
                  <button
                    onClick={() => { setCwEnabled(false); setCwText(''); }}
                    className="p-1 rounded-full text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-border/50 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canPublish}
            className="rounded-full px-5 font-bold"
            size="sm"
          >
            {isPublishing ? (
              <>
                <Loader2 className="size-4 animate-spin mr-1.5" />
                Publishing...
              </>
            ) : (
              'Publish'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
