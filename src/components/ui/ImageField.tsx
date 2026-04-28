/**
 * `ImageField` — reusable image picker/preview component.
 *
 * Supports three ways to provide an image:
 *   1. Click the thumbnail to open a native file-picker and upload to Blossom.
 *   2. Paste an image (image/*) anywhere on the component — same upload path.
 *   3. Type/paste a URL directly into the text input.
 *
 * Props
 * ─────
 *  value        Current image URL (controlled).
 *  onChange     Called with the new URL whenever it changes (or '' to clear).
 *  label        Label text rendered above the field. Pass `null` to hide it.
 *  className    Extra classes on the outermost wrapper div.
 */

import { useCallback, useRef } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useToast } from '@/hooks/useToast';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

export interface ImageFieldProps {
  value: string;
  onChange: (url: string) => void;
  /** Label text above the field. Pass `null` to hide the label entirely. */
  label?: string | null;
  className?: string;
}

export function ImageField({ value, onChange, label = 'Image', className }: ImageFieldProps) {
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const safePreview = sanitizeUrl(value);

  // ── Upload helper (shared by click-to-upload and paste) ──────────────────

  const uploadAndSet = useCallback(async (file: File) => {
    try {
      const tags = await uploadFile(file);
      const url = tags[0]?.[1];
      if (url) onChange(url);
    } catch (err) {
      toast({
        title: 'Image upload failed',
        description: err instanceof Error ? err.message : 'Unknown error.',
        variant: 'destructive',
      });
    }
  }, [uploadFile, onChange, toast]);

  // ── File-picker change ────────────────────────────────────────────────────

  const handleFilePick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so the same file can be re-selected after a remove.
    e.target.value = '';
    if (file) await uploadAndSet(file);
  }, [uploadAndSet]);

  // ── Paste: image blob → upload; plain text → set as URL ──────────────────

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    if (!e.clipboardData) return;

    // Check for an image item first.
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) await uploadAndSet(file);
        return;
      }
    }
    // Plain-text paste falls through to the Input's default behaviour
    // (the URL will be reflected via the onChange on the input).
  }, [uploadAndSet]);

  return (
    <div className={cn('space-y-1.5', className)} onPaste={handlePaste}>
      {label !== null && <Label>{label}</Label>}

      <div className="flex items-start gap-3">
        {/* Thumbnail — click to open file picker */}
        <div
          className="relative size-20 shrink-0 rounded-lg border border-border bg-muted overflow-hidden cursor-pointer group"
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
          aria-label="Upload image"
        >
          {safePreview ? (
            <img
              src={safePreview}
              alt=""
              className="size-full object-cover"
              onError={() => onChange('')}
            />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <ImagePlus className="size-6" />
            </div>
          )}
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            {isUploading
              ? <Loader2 className="size-5 text-white animate-spin" />
              : <ImagePlus className="size-5 text-white" />}
          </div>
        </div>

        {/* URL input + hint */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <Input
            placeholder="https://… (or click / paste to upload)"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            Click the preview to upload, or paste an image or URL.
          </p>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFilePick}
      />

      {/* Remove link */}
      {safePreview && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-1"
        >
          <X className="size-3" /> Remove image
        </button>
      )}
    </div>
  );
}
