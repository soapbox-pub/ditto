import { useEffect, useId, useRef, useState } from 'react';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import { FormattedMessage, FormattedNumber, useIntl } from 'react-intl';

import { useTheme } from '@/hooks/useTheme';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { resizeImage } from '@/lib/resizeImage';
import { DEFAULT_SURFACE_OPACITY, MIN_SURFACE_OPACITY, type ThemeBackground } from '@/themes';

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
  const intl = useIntl();
  const { theme, customTheme, applyCustomTheme } = useTheme();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const opacityLabelId = useId();
  const controlled = onChange !== undefined;

  const currentBg: ThemeBackground | undefined = controlled
    ? value
    : (theme === 'custom' ? customTheme?.background : undefined);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      toast({
        title: intl.formatMessage({ id: 'backgroundPicker.invalidFile.title', defaultMessage: 'Invalid file' }),
        description: intl.formatMessage({ id: 'backgroundPicker.invalidFile.description', defaultMessage: 'Please select an image file.' }),
        variant: 'destructive',
      });
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
          // An edited theme is no longer the creator's work.
          source: undefined,
        });
      }
    } catch (error) {
      console.error('Failed to upload background:', error);
      toast({
        title: intl.formatMessage({ id: 'backgroundPicker.uploadFailed.title', defaultMessage: 'Upload failed' }),
        description: intl.formatMessage({ id: 'backgroundPicker.uploadFailed.description', defaultMessage: 'Could not upload the image.' }),
        variant: 'destructive',
      });
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
      source: undefined,
    });
  };

  const updateBackground = (patch: Partial<ThemeBackground>) => {
    if (controlled) {
      if (!value) return;
      onChange({ ...value, ...patch });
      return;
    }
    if (!customTheme?.background) return;
    applyCustomTheme({
      ...customTheme,
      background: { ...customTheme.background, ...patch },
      source: undefined,
    });
  };

  // While dragging, preview through an inline --surface-opacity on <html>
  // (it outranks the theme stylesheet's :root rule) and save once on release,
  // rather than rewriting the theme config on every tick.
  const [dragOpacity, setDragOpacity] = useState<number>();
  const savedOpacity = currentBg?.surfaceOpacity;
  const surfaceOpacity = dragOpacity ?? savedOpacity ?? DEFAULT_SURFACE_OPACITY;

  useEffect(() => {
    if (dragOpacity === undefined) return;
    const root = document.documentElement.style;
    root.setProperty('--surface-opacity', String(dragOpacity));
    return () => {
      root.removeProperty('--surface-opacity');
    };
  }, [dragOpacity]);

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground">
        <FormattedMessage id="backgroundPicker.label" defaultMessage="Background" />
      </span>

      {currentBg ? (
        <div className="space-y-2">
          <div className="relative rounded-lg overflow-hidden border border-border-subtle">
            <img
              src={currentBg.url}
              alt={intl.formatMessage({ id: 'backgroundPicker.imageAlt', defaultMessage: 'Theme background' })}
              className="w-full h-24 object-cover"
              decoding="async"
            />
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-1.5 right-1.5 size-6 rounded-full bg-background/80 backdrop-blur-sm can-hover:bg-background"
              onClick={handleRemove}
              aria-label={intl.formatMessage({ id: 'backgroundPicker.remove', defaultMessage: 'Remove background' })}
            >
              <X className="size-3.5" />
            </Button>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-1 rounded-lg border border-border-subtle p-0.5 w-fit">
            {(['cover', 'tile'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => updateBackground({ mode })}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                  (currentBg.mode ?? 'cover') === mode
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {mode === 'cover'
                  ? <FormattedMessage id="backgroundPicker.mode.cover" defaultMessage="Cover" />
                  : <FormattedMessage id="backgroundPicker.mode.tile" defaultMessage="Tile" />}
              </button>
            ))}
          </div>

          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <label id={opacityLabelId}>
                <FormattedMessage id="backgroundPicker.surfaceOpacity" defaultMessage="Panel opacity" />
              </label>
              <span className="tabular-nums">
                <FormattedNumber value={surfaceOpacity} style="percent" />
              </span>
            </div>
            <Slider
              aria-labelledby={opacityLabelId}
              min={MIN_SURFACE_OPACITY}
              max={1}
              step={0.05}
              value={[surfaceOpacity]}
              onValueChange={([v]) => setDragOpacity(v)}
              onValueCommit={([v]) => {
                setDragOpacity(undefined);
                if (v !== savedOpacity) updateBackground({ surfaceOpacity: v });
              }}
            />
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
              <span className="text-xs"><FormattedMessage id="backgroundPicker.upload" defaultMessage="Upload image" /></span>
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


