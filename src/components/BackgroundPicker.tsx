import { useRef } from 'react';
import { ImagePlus, X, Loader2 } from 'lucide-react';

import { useTheme } from '@/hooks/useTheme';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ThemeBackground } from '@/themes';

/**
 * Background image picker for theme customization.
 * Uploads via Blossom and stores the URL in ThemeConfig.background.
 */
export function BackgroundPicker() {
  const { theme, customTheme, applyCustomTheme } = useTheme();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const currentBg: ThemeBackground | undefined = theme === 'custom' ? customTheme?.background : undefined;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please select an image file.', variant: 'destructive' });
      return;
    }

    try {
      const tags = await uploadFile(file);
      const url = tags[0][1];

      // Read dimensions from the image
      const dimensions = await getImageDimensions(file);

      const currentColors = customTheme?.colors ?? {
        background: '228 20% 10%',
        text: '210 40% 98%',
        primary: '258 70% 60%',
      };

      const bg: ThemeBackground = {
        url,
        mode: 'cover',
        mimeType: file.type,
        dimensions,
      };

      applyCustomTheme({
        ...customTheme,
        colors: currentColors,
        background: bg,
      });
    } catch (error) {
      console.error('Failed to upload background:', error);
      toast({ title: 'Upload failed', description: 'Could not upload the image.', variant: 'destructive' });
    }
  };

  const handleRemove = () => {
    if (!customTheme) return;
    applyCustomTheme({
      ...customTheme,
      background: undefined,
    });
  };

  const handleModeChange = (mode: 'cover' | 'tile') => {
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

/** Read image dimensions from a File. */
function getImageDimensions(file: File): Promise<string | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve(`${img.naturalWidth}x${img.naturalHeight}`);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      resolve(undefined);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });
}
