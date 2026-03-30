/**
 * LetterDetailSheet — Minimal modal showing just the letter card.
 * Tap backdrop to dismiss.
 */

import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { Loader2, Lock } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useDecryptLetter } from '@/hooks/useLetters';
import { FONT_OPTIONS, LINE_HEIGHT_RATIO, COLOR_MOMENT_KIND, THEME_KIND, resolveStationery, colorMomentToStationery, themeToStationery, type Letter } from '@/lib/letterTypes';
import { hexLuminance, backgroundTextColor } from '@/lib/colorUtils';
import { ColorPaletteDisplay, type PaletteLayout } from './ColorPaletteDisplay';
import { ensureLetterFonts } from '@/lib/letterUtils';
import { StationeryBackground } from './StationeryBackground';
import { useStationeryColors } from '@/hooks/useStationeryColors';
import { LetterStickers } from './LetterStickers';
import { useTheme } from '@/hooks/useTheme';
import { toast } from '@/hooks/useToast';
import { paletteToTheme, getColors } from '@/components/ColorMomentContent';
import { parseThemeDefinition } from '@/lib/themeEvent';
import type { ThemeConfig } from '@/themes';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

// ---------------------------------------------------------------------------
// Attached gift — color moment or theme that can be applied on the spot
// ---------------------------------------------------------------------------

/** Renders an attached gift — present box overlapping a themed bubble. */
function LetterAttachment({ event }: { event: NostrEvent }) {
  const { applyCustomTheme, theme, customTheme, setTheme } = useTheme();
  const [applied, setApplied] = useState(false);
  const prevRef = useRef<{ mode: typeof theme; config?: ThemeConfig } | undefined>(undefined);

  const attachment = useMemo(() => {
    if (event.kind === COLOR_MOMENT_KIND) {
      const colors = getColors(event.tags);
      if (colors.length < 2) return null;
      const core = paletteToTheme(colors);
      const stationery = colorMomentToStationery(event);
      const resolved = resolveStationery(stationery);
      return { type: 'color-moment' as const, label: 'Color Moment', colors, core, resolved };
    }
    if (event.kind === THEME_KIND) {
      const parsed = parseThemeDefinition(event);
      if (!parsed) return null;
      const stationery = themeToStationery(event);
      const resolved = resolveStationery(stationery);
      return {
        type: 'theme' as const,
        label: parsed.title ?? 'Theme',
        colors: [] as string[],
        core: parsed.colors,
        resolved,
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

  const { resolved } = attachment;
  const bg = resolved.color;
  const primary = `hsl(${attachment.core.primary})`;
  // Use a visible border when the bg is very light to avoid white-on-white
  const needsBorder = hexLuminance(bg) > 0.85;
  const ribbonColor = attachment.type === 'color-moment'
    ? (attachment.colors[Math.floor(attachment.colors.length / 2)] ?? primary)
    : primary;
  // Derive readable text color from the scrimmed background
  const textColor = backgroundTextColor(bg);

  return (
    <div className="relative max-w-[220px] mx-auto mt-16 pointer-events-none">
      {/* Present box — overlaps the bubble top */}
      <div className="flex justify-center relative z-10 mb-[-20px]">
        <svg width="56" height="60" viewBox="0 0 56 60" fill="none" className="drop-shadow-sm">
          {/* Box body */}
          <rect x="4" y="26" width="48" height="32" rx="3" fill={bg} stroke={needsBorder ? '#0001' : 'none'} strokeWidth="1" />
          <rect x="4" y="26" width="48" height="8" rx="3" fill="white" opacity="0.07" />
          {/* Ribbon vertical */}
          <rect x="24" y="26" width="8" height="32" fill={ribbonColor} opacity="0.8" />
          {/* Ribbon horizontal */}
          <rect x="4" y="38" width="48" height="6" fill={ribbonColor} opacity="0.8" />
          {/* Lid */}
          <rect x="2" y="18" width="52" height="10" rx="2.5" fill={bg} stroke={needsBorder ? '#0001' : ribbonColor} strokeWidth={needsBorder ? 1 : 0.5} strokeOpacity={needsBorder ? 1 : 0.2} />
          <rect x="2" y="18" width="52" height="4" rx="2.5" fill="white" opacity="0.1" />
          {/* Lid ribbon */}
          <rect x="24" y="18" width="8" height="10" fill={ribbonColor} opacity="0.8" />
          {/* Bow — left loop */}
          <ellipse cx="20" cy="14" rx="8" ry="6" fill={ribbonColor} />
          <ellipse cx="19.5" cy="12.5" rx="4.5" ry="3" fill="white" opacity="0.2" />
          {/* Bow — right loop */}
          <ellipse cx="36" cy="14" rx="8" ry="6" fill={ribbonColor} />
          <ellipse cx="36.5" cy="12.5" rx="4.5" ry="3" fill="white" opacity="0.2" />
          {/* Bow — knot */}
          <ellipse cx="28" cy="16" rx="5" ry="4" fill={ribbonColor} />
          <ellipse cx="28" cy="15" rx="2.5" ry="2" fill="white" opacity="0.15" />
        </svg>
      </div>

      {/* Themed bubble — clickable */}
      <div
        onClick={handleApply}
        role="button"
        tabIndex={0}
        title={applied ? 'Theme applied!' : `Tap to use "${attachment.label}" as your theme`}
        className="relative rounded-2xl overflow-hidden pointer-events-auto cursor-pointer transition-transform duration-200 active:scale-95 hover:scale-[1.02]"
        style={{
          background: bg,
          border: needsBorder ? '1px solid hsl(var(--border))' : `1px solid ${ribbonColor}22`,
        }}
      >
        {/* Background: actual color moment pattern or theme image */}
        {attachment.type === 'color-moment' && attachment.colors.length > 0 && (
          <ColorPaletteDisplay
            colors={attachment.colors}
            layout={(resolved.layout as PaletteLayout) || 'horizontal'}
            className="absolute inset-0"
          />
        )}
        {attachment.type === 'theme' && resolved.imageUrl && (
          <div className="absolute inset-0">
            <img
              src={resolved.imageUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        )}
        {/* Scrim for text readability */}
        <div className="absolute inset-0" style={{ background: `${bg}bb` }} />

        {/* Content */}
        <div className="relative px-4 pt-7 pb-3.5 text-center">
          <p className="text-xs font-semibold truncate" style={{ color: textColor }}>
            {attachment.label}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: textColor, opacity: 0.6 }}>
            {applied ? 'Applied as your theme' : 'Tap to use as theme'}
          </p>
        </div>
      </div>
    </div>
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
              <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none" style={{ zIndex: 20 }}>
                <div className="relative w-full h-full">
                  <LetterStickers stickers={content.stickers} />
                </div>
              </div>
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
