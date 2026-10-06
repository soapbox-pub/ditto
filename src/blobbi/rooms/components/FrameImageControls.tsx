/**
 * FrameImageControls — upload or paste the photo shown in a picture frame.
 * URLs must be https (sanitizeUrl); uploads go to the user's Blossom servers.
 */

import { useState, useCallback, useRef } from 'react';
import { Link, Loader2, Upload, X } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useToast } from '@/hooks/useToast';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

// ─── Frame Image Controls ─────────────────────────────────────────────────────

interface FrameImageControlsProps {
  imageUrl: string | undefined;
  onImageChange: (url: string | undefined) => void;
}

export function FrameImageControls({ imageUrl, onImageChange }: FrameImageControlsProps) {
  const intl = useIntl();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pasteValue, setPasteValue] = useState('');
  const [pasteError, setPasteError] = useState(false);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-selected
    e.target.value = '';
    try {
      const [[, url]] = await uploadFile(file);
      // The server's answer is as untrusted as a pasted URL
      const sanitized = sanitizeUrl(url);
      if (!sanitized) throw new Error('Upload returned an unusable URL');
      onImageChange(sanitized);
    } catch {
      toast({
        title: intl.formatMessage({ id: 'blobbiRoom.frame.uploadFailed', defaultMessage: 'Upload failed' }),
        description: intl.formatMessage({ id: 'blobbiRoom.frame.uploadFailedDescription', defaultMessage: 'Could not upload image.' }),
        variant: 'destructive',
      });
    }
  }, [uploadFile, onImageChange, toast, intl]);

  const handlePasteCommit = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setPasteError(false);
      return;
    }
    const sanitized = sanitizeUrl(trimmed);
    if (sanitized) {
      onImageChange(sanitized);
      setPasteValue('');
      setPasteError(false);
    } else {
      setPasteError(true);
    }
  }, [onImageChange]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-12 shrink-0">
          <FormattedMessage id="blobbiRoom.frame.image" defaultMessage="Image" />
        </span>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {/* Upload button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? <Loader2 className="animate-spin" /> : <Upload />}
            {isUploading
              ? <FormattedMessage id="blobbiRoom.frame.uploading" defaultMessage="Uploading…" />
              : <FormattedMessage id="blobbiRoom.frame.upload" defaultMessage="Upload" />}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          {/* Thumbnail preview + clear */}
          {imageUrl && (
            <div className="flex items-center gap-1 min-w-0">
              <img
                src={imageUrl}
                alt=""
                className="size-9 rounded-lg object-cover border border-border/60"
                decoding="async"
              />
              <button
                type="button"
                onClick={() => onImageChange(undefined)}
                className="size-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4"
                aria-label={intl.formatMessage({ id: 'blobbiRoom.frame.removeImage', defaultMessage: 'Remove image' })}
              >
                <X />
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Paste URL input */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-12 shrink-0">
          <Link className="size-4 mx-auto" />
        </span>
        <div className="flex-1 min-w-0">
          <Input
            type="url"
            value={pasteValue}
            onChange={(e) => { setPasteValue(e.target.value); setPasteError(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handlePasteCommit(pasteValue); }}
            onBlur={() => handlePasteCommit(pasteValue)}
            placeholder={intl.formatMessage({ id: 'blobbiRoom.frame.pastePlaceholder', defaultMessage: 'Paste image URL…' })}
            aria-label={intl.formatMessage({ id: 'blobbiRoom.frame.imageUrl', defaultMessage: 'Image URL' })}
            aria-invalid={pasteError}
            className={cn(pasteError && 'border-destructive focus-visible:ring-destructive')}
          />
          {pasteError && (
            <p className="text-xs text-destructive mt-1">
              <FormattedMessage id="blobbiRoom.frame.httpsOnly" defaultMessage="Must be an https:// URL" />
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
