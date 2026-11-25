import { useEffect, useId, useRef, useState } from 'react';
import { ImageIcon, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { FormattedMessage, FormattedNumber, useIntl } from 'react-intl';

import { useTheme } from '@/hooks/useTheme';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ThemeSectionLabel } from '@/components/ThemeSectionLabel';
import { cn } from '@/lib/utils';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
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
  const fitLabelId = useId();
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
        // Replacing the image keeps the fit and panel opacity already chosen.
        mode: currentBg?.mode ?? 'cover',
        mimeType: optimized.type,
        dimensions,
        surfaceOpacity: currentBg?.surfaceOpacity,
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

  const mode = currentBg?.mode ?? 'cover';
  const previewUrl = sanitizeUrl(currentBg?.url);
  const previewStyle: React.CSSProperties | undefined = previewUrl
    ? {
      backgroundImage: `url("${previewUrl.replace(/["\\\n\r]/g, (c) => encodeURIComponent(c))}")`,
      ...(mode === 'tile'
        ? { backgroundRepeat: 'repeat', backgroundSize: 'auto' }
        : { backgroundRepeat: 'no-repeat', backgroundSize: 'cover', backgroundPosition: 'center' }),
    }
    : undefined;

  const overlayButton = 'size-8 rounded-full bg-background/80 text-foreground shadow-sm backdrop-blur-sm can-hover:bg-background';

  return (
    <div className="space-y-3">
      <ThemeSectionLabel icon={ImageIcon}>
        <FormattedMessage id="backgroundPicker.label" defaultMessage="Background" />
      </ThemeSectionLabel>

      {currentBg ? (
        <div className="space-y-3">
          {/* The image with a sample panel at the chosen opacity, so the slider shows what it does */}
          <div
            role="img"
            aria-label={intl.formatMessage({ id: 'backgroundPicker.imageAlt', defaultMessage: 'Theme background' })}
            className="relative flex h-36 items-center justify-center overflow-hidden rounded-2xl border border-border-subtle bg-secondary"
            style={previewStyle}
          >
            <div
              aria-hidden
              className="flex w-3/5 items-center gap-3 rounded-xl p-3 shadow-sm"
              style={{ backgroundColor: `hsl(var(--background) / ${surfaceOpacity})` }}
            >
              <div className="size-8 shrink-0 rounded-full bg-primary" />
              <div className="flex-1 space-y-1.5">
                <div className="h-2 w-3/4 rounded-full bg-foreground/80" />
                <div className="h-2 w-1/2 rounded-full bg-muted-foreground/60" />
              </div>
            </div>

            <div className="absolute right-2 top-2 flex gap-1.5">
              <Button
                variant="secondary"
                size="icon"
                className={overlayButton}
                onClick={() => inputRef.current?.click()}
                disabled={isUploading}
                aria-label={intl.formatMessage({ id: 'backgroundPicker.replace', defaultMessage: 'Replace image' })}
              >
                {isUploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className={cn(overlayButton, 'can-hover:text-destructive')}
                onClick={handleRemove}
                aria-label={intl.formatMessage({ id: 'backgroundPicker.remove', defaultMessage: 'Remove background' })}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span id={fitLabelId} className="w-14 shrink-0 text-xs text-muted-foreground">
                <FormattedMessage id="backgroundPicker.fit" defaultMessage="Fit" />
              </span>
              <div role="group" aria-labelledby={fitLabelId} className="inset-well inline-flex gap-1 p-1">
                {(['cover', 'tile'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => updateBackground({ mode: m })}
                    className={cn(
                      'rounded-md px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      mode === m
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {m === 'cover'
                      ? <FormattedMessage id="backgroundPicker.mode.cover" defaultMessage="Cover" />
                      : <FormattedMessage id="backgroundPicker.mode.tile" defaultMessage="Tile" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-xs text-muted-foreground">
                <FormattedMessage id="backgroundPicker.panels" defaultMessage="Panels" />
              </span>
              <Slider
                className="flex-1"
                aria-label={intl.formatMessage({ id: 'backgroundPicker.surfaceOpacity', defaultMessage: 'Panel opacity' })}
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
              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                <FormattedNumber value={surfaceOpacity} style="percent" />
              </span>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className="flex h-36 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {isUploading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <>
              <ImagePlus className="size-5" />
              <span className="text-sm"><FormattedMessage id="backgroundPicker.upload" defaultMessage="Upload image" /></span>
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


