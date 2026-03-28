import { useRef } from 'react';
import { ImagePlus, X, Loader2 } from 'lucide-react';

import { useTheme } from '@/hooks/useTheme';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { resizeImage } from '@/lib/resizeImage';
import type { ThemeBackground } from '@/themes';

/**
 * Background image picker for theme customization.
 *
 * Supports two modes:
 * - **Uncontrolled** (default): reads/writes via `useTheme().applyCustomTheme()`
 * - **Controlled**: pass `value` and `onChange` props to manage state externally
 */
export function BackgroundPicker({ value, onChange }: {
  /** Controlled value — overrides useTheme() when provided. */
  value?: ThemeBackground | undefined;
  /** Controlled onChange — called instead of applyCustomTheme() when provided. */
  onChange?: (bg: ThemeBackground | undefined) => void;
} = {}) {
  const { theme, customTheme, applyCustomTheme } = useTheme();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const controlled = onChange !== undefined;

  const currentBg: ThemeBackground | undefined = controlled
    ? value
    : (theme === 'custom' ? customTheme?.background : undefined);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please select an image file.', variant: 'destructive' });
      return;
    }

    try {
      // Resize & convert to JPEG before uploading for better performance.
      const { file: optimized, dimensions } = await resizeImage(file);

      const tags = await uploadFile(optimized);
      const url = tags[0][1];

      const bg: ThemeBackground = {
        url,
        mode: 'cover',
        mimeType: optimized.type,
        dimensions,
      };

      if (controlled) {
        onChange(bg);
      } else {
        const currentColors = customTheme?.colors ?? {
          background: '228 20% 10%',
          text: '210 40% 98%',
          primary: '258 70% 60%',
        };
        applyCustomTheme({
          ...customTheme,
          colors: currentColors,
          background: bg,
        });
      }
    } catch (error) {
      console.error('Failed to upload background:', error);
      toast({ title: 'Upload failed', description: 'Could not upload the image.', variant: 'destructive' });
    }
  };

  const handleRemove = () => {
    if (controlled) {
      onChange(undefined);
      return;
    }
    if (!customTheme) return;
    applyCustomTheme({
      ...customTheme,
      background: undefined,
    });
  };

  const handleModeChange = (mode: 'cover' | 'tile') => {
    if (controlled) {
      if (!value) return;
      onChange({ ...value, mode });
      return;
    }
    if (!customTheme?.background) return;
    applyCustomTheme({
      ...customTheme,
      background: { ...customTheme.background, mode },
    });
  };

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground">
        Background
      </span>

      {currentBg ? (
        <div className="space-y-2">
          <div className="relative rounded-lg overflow-hidden border border-border">
            <img
              src={currentBg.url}
              alt="Theme background"
              className="w-full h-24 object-cover"
            />
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-1.5 right-1.5 size-6 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background"
              onClick={handleRemove}
            >
              <X className="size-3.5" />
            </Button>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-1 rounded-lg border border-border p-0.5 w-fit">
            {(['cover', 'tile'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => handleModeChange(mode)}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                  (currentBg.mode ?? 'cover') === mode
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {mode === 'cover' ? 'Cover' : 'Tile'}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className="w-full h-20 rounded-lg border-2 border-dashed border-border hover:border-primary/40 transition-colors flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {isUploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              <ImagePlus className="size-4" />
              <span className="text-xs">Upload image</span>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}


