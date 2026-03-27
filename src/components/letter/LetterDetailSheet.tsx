/**
 * LetterDetailSheet — Minimal modal showing just the letter card.
 * Tap backdrop to dismiss.
 */

import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { Loader2, Lock, Gift, Check } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useDecryptLetter } from '@/hooks/useLetters';
import { FONT_OPTIONS, LINE_HEIGHT_RATIO, COLOR_MOMENT_KIND, THEME_KIND, type Letter } from '@/lib/letterTypes';
import { ensureLetterFonts } from '@/lib/letterUtils';
import { StationeryBackground } from './StationeryBackground';
import { useStationeryColors } from '@/hooks/useStationeryColors';
import { LetterStickers } from './LetterStickers';
import { useTheme } from '@/hooks/useTheme';
import { toast } from '@/hooks/useToast';
import { paletteToTheme, getColors } from '@/components/ColorMomentContent';
import { parseThemeDefinition } from '@/lib/themeEvent';
import { coreToTokens, type ThemeConfig } from '@/themes';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

// ---------------------------------------------------------------------------
// Attached gift — color moment or theme that can be applied on the spot
// ---------------------------------------------------------------------------

function hsl(value: string): string {
  return `hsl(${value})`;
}

/** Mini mockup showing how the theme looks — background, text, primary. */
function ThemeSwatch({ bg, text, primary, className }: { bg: string; text: string; primary: string; className?: string }) {
  return (
    <div
      className={`rounded-xl overflow-hidden ${className ?? ''}`}
      style={{ background: hsl(bg) }}
    >
      <div className="flex flex-col gap-1.5 p-3">
        <div className="h-2 w-3/4 rounded-full" style={{ background: hsl(text), opacity: 0.7 }} />
        <div className="h-2 w-1/2 rounded-full" style={{ background: hsl(text), opacity: 0.4 }} />
        <div className="h-6 w-16 rounded-lg mt-1" style={{ background: hsl(primary) }} />
      </div>
    </div>
  );
}

/** Renders an "attached gift" for a letter with an embedded event. */
function LetterAttachment({ event }: { event: NostrEvent }) {
  const { applyCustomTheme, theme, customTheme, setTheme } = useTheme();
  const [applied, setApplied] = useState(false);
  const prevRef = useRef<{ mode: typeof theme; config?: ThemeConfig }>();

  const attachment = useMemo(() => {
    if (event.kind === COLOR_MOMENT_KIND) {
      const colors = getColors(event.tags);
      if (colors.length < 2) return null;
      const core = paletteToTheme(colors);
      return { type: 'color-moment' as const, label: 'Color Moment', colors, core };
    }
    if (event.kind === THEME_KIND) {
      const parsed = parseThemeDefinition(event);
      if (!parsed) return null;
      return {
        type: 'theme' as const,
        label: parsed.title ?? 'Ditto Theme',
        core: parsed.colors,
        themeConfig: { colors: parsed.colors, font: parsed.font, titleFont: parsed.titleFont, background: parsed.background, title: parsed.title } as ThemeConfig,
      };
    }
    return null;
  }, [event]);

  const handleApply = useCallback(() => {
    if (!attachment) return;
    prevRef.current = { mode: theme, config: customTheme };
    if (attachment.type === 'color-moment') {
      applyCustomTheme(attachment.core);
    } else {
      applyCustomTheme(attachment.themeConfig!);
    }
    setApplied(true);
    toast({
      title: 'Theme applied',
      description: `"${attachment.label}" is now your active theme.`,
      action: (
        <button
          className="text-sm font-medium underline underline-offset-2"
          onClick={() => {
            const prev = prevRef.current;
            if (!prev) return;
            if (prev.mode === 'custom' && prev.config) applyCustomTheme(prev.config);
            else setTheme(prev.mode);
            setApplied(false);
          }}
        >
          Undo
        </button>
      ),
    });
  }, [attachment, theme, customTheme, applyCustomTheme, setTheme]);

  if (!attachment) return null;

  const tokens = coreToTokens(attachment.core);

  return (
    <button
      onClick={handleApply}
      className="w-full mt-4 group relative"
    >
      {/* Ribbon connector */}
      <div className="flex justify-center -mb-1 relative z-10">
        <div className="w-8 h-3 rounded-t-lg" style={{ background: hsl(tokens.primary) }} />
      </div>

      {/* Gift card */}
      <div
        className="relative rounded-2xl border-2 overflow-hidden transition-transform active:scale-[0.97]"
        style={{
          borderColor: hsl(tokens.border),
          background: hsl(tokens.card),
        }}
      >
        {/* Horizontal ribbon stripe */}
        <div
          className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-6 opacity-20"
          style={{ background: hsl(tokens.primary) }}
        />

        <div className="relative flex items-center gap-3 px-4 py-3">
          <div
            className="size-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: hsl(tokens.primary) + '1a' }}
          >
            {applied
              ? <Check className="size-5" style={{ color: hsl(tokens.primary) }} />
              : <Gift className="size-5" style={{ color: hsl(tokens.primary) }} />
            }
          </div>

          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-semibold truncate" style={{ color: hsl(tokens.cardForeground) }}>
              {attachment.label}
            </p>
            <p className="text-xs" style={{ color: hsl(tokens.mutedForeground) }}>
              {applied ? 'Applied to your Ditto' : 'Tap to use as your theme'}
            </p>
          </div>

          {/* Mini swatch */}
          {attachment.type === 'color-moment' && (
            <div className="flex gap-0.5 shrink-0">
              {attachment.colors.slice(0, 5).map((c, i) => (
                <div key={i} className="size-5 rounded-full" style={{ background: c }} />
              ))}
            </div>
          )}
          {attachment.type === 'theme' && (
            <ThemeSwatch
              bg={attachment.core.background}
              text={attachment.core.text}
              primary={attachment.core.primary}
              className="w-20 shrink-0"
            />
          )}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------

interface LetterDetailSheetProps {
  letter: Letter | null;
  onClose: () => void;
}

export function LetterDetailSheet({ letter, onClose }: LetterDetailSheetProps) {
  const letterRef = useRef<HTMLDivElement>(null);
  const [lineHeightPx, setLineHeightPx] = useState(0);

  const { data: decrypted, isLoading: isDecrypting } = useDecryptLetter(letter ?? undefined);
  const content = decrypted?.content;

  const effectiveStationery = decrypted?.stationery;
  const effectiveFrame = effectiveStationery?.frame;
  const effectiveFrameTint = effectiveStationery?.frameTint;

  const { text: textColor, faint: faintColor, line: lineColor } = useStationeryColors(effectiveStationery);
  const rawFont = effectiveStationery?.fontFamily;
  const letterFontFamily = rawFont
    ? (rawFont.includes(',') ? rawFont : `${rawFont}, ${FONT_OPTIONS[0].family}`)
    : FONT_OPTIONS[0].family;

  // Lazy-load the letter's font when decrypted content is available
  useLayoutEffect(() => { ensureLetterFonts(letterFontFamily); }, [letterFontFamily]);

  // ResizeObserver for ruled line height — re-attaches when the dialog opens (letter changes)
  useEffect(() => {
    if (!letter) return;
    // Small delay to let the Dialog portal mount and layout
    const timer = setTimeout(() => {
      const el = letterRef.current;
      if (!el) return;
      const w = el.getBoundingClientRect().width;
      if (w > 0) setLineHeightPx(Math.round(w * LINE_HEIGHT_RATIO));
    }, 50);

    const el = letterRef.current;
    if (!el) return () => clearTimeout(timer);

    let raf: number;
    const ro = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
        if (w > 0) setLineHeightPx(Math.round(w * LINE_HEIGHT_RATIO));
      });
    });
    ro.observe(el);
    return () => { clearTimeout(timer); ro.disconnect(); cancelAnimationFrame(raf); };
  }, [letter]);

  return (
    <Dialog open={!!letter} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="p-0 gap-0 border-none bg-transparent shadow-none max-w-[calc(100vw-2rem)] sm:max-w-lg overflow-visible [&>button]:hidden">
        <DialogTitle className="sr-only">Letter</DialogTitle>

        <div style={effectiveFrame && effectiveFrame !== 'none'
          ? { padding: '28px 28px 44px' }
          : { padding: '0' }
        }>
          <div ref={letterRef} className="relative" style={{ containerType: 'inline-size' }}>
            <StationeryBackground
              stationery={effectiveStationery}
              frame={effectiveFrame}
              frameTint={effectiveFrameTint}
              className="rounded-3xl shadow-inner shadow-black/5"
            >
              <div
                className="relative z-10 flex flex-col"
                style={{ aspectRatio: '5 / 4', padding: '5cqw' }}
              >
                {isDecrypting ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2.5" style={{ color: faintColor }}>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-xs">unsealing...</span>
                    </div>
                  </div>
                ) : content ? (
                  <>
                    <p
                      className="whitespace-pre-wrap font-semibold tracking-wide overflow-hidden flex-1 min-h-0"
                      style={{
                        fontSize: '4.8cqw',
                        lineHeight: lineHeightPx > 0 ? `${lineHeightPx}px` : '8.4cqw',
                        letterSpacing: '0.06em',
                        paddingTop: '0.5cqw',
                        fontFamily: letterFontFamily,
                        color: textColor,
                        ...(lineHeightPx > 0 ? {
                          backgroundImage: `linear-gradient(to bottom, transparent ${lineHeightPx - 3}px, ${lineColor} ${lineHeightPx - 3}px)`,
                          backgroundSize: `100% ${lineHeightPx}px`,
                          backgroundRepeat: 'repeat-y',
                          maxHeight: `${lineHeightPx * 5}px`,
                        } : {}),
                        backgroundPosition: '0 0',
                      }}
                    >
                      {content.body}
                    </p>
                    {(content.closing || content.signature) && (
                      <div className="flex flex-col items-end" style={{ paddingTop: '6cqw', gap: '3cqw', paddingRight: '4cqw', fontFamily: letterFontFamily }}>
                        {content.closing && (
                          <p style={{ fontSize: '4.8cqw', color: textColor }}>{content.closing}</p>
                        )}
                        {content.signature && (
                          <p className="font-semibold" style={{ fontSize: '5cqw', color: textColor }}>{content.signature}</p>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2" style={{ color: faintColor }}>
                      <Lock className="w-5 h-5" />
                      <p className="text-xs italic">couldn't unseal this one</p>
                    </div>
                  </div>
                )}
              </div>
            </StationeryBackground>

            {content?.stickers && content.stickers.length > 0 && (
              <LetterStickers stickers={content.stickers} />
            )}
          </div>

          {/* Attached gift — color moment or theme */}
          {effectiveStationery?.event && (
            <LetterAttachment event={effectiveStationery.event} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
