/**
 * LetterDetailSheet — Minimal modal showing just the letter card.
 * Tap backdrop to dismiss.
 */

import { useState, useRef, useEffect } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { useDecryptLetter } from '@/hooks/useLetters';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useQueryClient } from '@tanstack/react-query';
import { FONT_OPTIONS, LETTER_KIND, type Letter } from '@/lib/letterTypes';
import { StationeryBackground } from './StationeryBackground';
import { useStationeryColors } from '@/hooks/useStationeryColors';
import { LetterStickers } from './LetterStickers';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

interface LetterDetailSheetProps {
  letter: Letter | null;
  mode: 'inbox' | 'sent';
  onClose: () => void;
}

export function LetterDetailSheet({ letter, mode, onClose }: LetterDetailSheetProps) {
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

  useEffect(() => {
    const el = letterRef.current;
    if (!el) return;
    let raf: number;
    const ro = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
        setLineHeightPx(Math.round(w * 0.084));
      });
    });
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [letter?.event.id]);

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
        </div>
      </DialogContent>
    </Dialog>
  );
}
