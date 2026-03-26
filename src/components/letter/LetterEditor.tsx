/**
 * LetterEditor — shared toolbar, drawer, and preview card used by both
 * ComposeLetterSheet and LetterPreferencesPage. Callers provide:
 *
 *   - state for font/stationery/frame/closing/signature
 *   - optional body content to render inside the card (textarea or placeholder)
 *   - optional extra toolbar buttons (stickers, draw)
 *   - optional children rendered after the card (stickers layer)
 */

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { Paintbrush } from 'lucide-react';

import {
  FONT_OPTIONS,
  CLOSING_PRESETS,
  type Stationery,
  type FrameStyle,
} from '@/lib/letterTypes';
import { StationeryBackground } from './StationeryBackground';
import { useStationeryColors } from '@/hooks/useStationeryColors';
import { StationeryPicker } from './StationeryPicker';
import { FramePicker } from './FramePicker';
import { resolveFont } from '@/lib/letterUtils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ---------------------------------------------------------------------------
// FrameIcon — shared SVG
// ---------------------------------------------------------------------------

export function FrameIcon({ className, strokeWidth = 2 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="3" width="20" height="18" rx="3" />
      <rect x="5.5" y="6.5" width="13" height="11" rx="2" />
      <path d="M4 5 C4.5 5.5 5 6 5.5 6.5" />
      <path d="M20 5 C19.5 5.5 19 6 18.5 6.5" />
      <path d="M4 19 C4.5 18.5 5 18 5.5 17.5" />
      <path d="M20 19 C19.5 18.5 19 18 18.5 17.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Overlay types — base set shared by all consumers
// ---------------------------------------------------------------------------

export type BaseOverlay = 'none' | 'font' | 'stationery' | 'frame';

// ---------------------------------------------------------------------------
// LetterEditor props
// ---------------------------------------------------------------------------

export interface LetterEditorFont {
  value: string;
  label: string;
  family: string;
}

export interface LetterEditorState {
  selectedFont: LetterEditorFont;
  setSelectedFont: (f: LetterEditorFont) => void;
  stationery: Stationery;
  setStationery: (s: Stationery) => void;
  frame: FrameStyle;
  setFrame: (f: FrameStyle) => void;
  frameTint: boolean;
  setFrameTint: (v: boolean) => void;
  closing: string;
  setClosing: (v: string) => void;
  signature: string;
  setSignature: (v: string) => void;
}

interface LetterEditorProps {
  state: LetterEditorState;
  /** Content rendered inside the toolbar header bar (e.g. back button) — placed before the toggle buttons */
  headerLeft?: ReactNode;
  /** Extra buttons rendered after the base font/stationery/frame toggles */
  extraButtons?: ReactNode;
  /** Extra drawer panels keyed by overlay name. Rendered when the overlay matches. */
  extraDrawerContent?: ReactNode;
  /** Current overlay — managed externally so callers can add custom overlays */
  overlay: string;
  setOverlay: (o: string) => void;
  /** Body content rendered inside the card above the outro (e.g. textarea or placeholder) */
  bodyContent?: (ctx: { lineHeightPx: number; stationeryTextColor: string; stationeryLineColor: string; resolvedFontFamily: string }) => ReactNode;
  /** Content rendered after the StationeryBackground inside the card ref div (e.g. stickers layer) */
  cardOverlay?: ReactNode;
  /** Content rendered between toolbar and preview card (e.g. recipient row, blurb) */
  beforeCard?: ReactNode;
  /**
   * When false, the toolbar buttons render as a plain non-sticky row (for use inside
   * a page that already has its own sticky header). Default true (fullscreen compose mode).
   */
  stickyHeader?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LetterEditor({
  state,
  headerLeft,
  extraButtons,
  extraDrawerContent,
  overlay,
  setOverlay,
  bodyContent,
  cardOverlay,
  beforeCard,
  stickyHeader = true,
}: LetterEditorProps) {
  const {
    selectedFont, setSelectedFont,
    stationery, setStationery,
    frame, setFrame,
    frameTint, setFrameTint,
    closing, setClosing,
    signature, setSignature,
  } = state;

  const cardRef = useRef<HTMLDivElement>(null);
  const [lineHeightPx, setLineHeightPx] = useState(0);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
      setLineHeightPx(Math.round(w * 0.084));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { text: stationeryTextColor, line: stationeryLineColor, fontFamily: themeFont } = useStationeryColors(stationery);
  const resolvedFontFamily = resolveFont(selectedFont.family, themeFont);

  const isBaseOverlay = (o: string): o is BaseOverlay => ['none', 'font', 'stationery', 'frame'].includes(o);
  const drawerOpen = overlay !== 'none';

  const toolbarRow = (
    <div className="flex items-center gap-1 px-4 py-2">
      {headerLeft}
      <div className="flex-1" />
      <button
        onClick={() => setOverlay(overlay === 'font' ? 'none' : 'font')}
        className={`px-3 py-2 rounded-2xl transition-colors text-sm font-semibold tracking-tight ${
          overlay === 'font'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
        }`}
      >
        <span className="text-lg font-bold">Aa</span>
      </button>
      <button
        onClick={() => setOverlay(overlay === 'stationery' ? 'none' : 'stationery')}
        className={`p-2.5 rounded-2xl transition-colors ${
          overlay === 'stationery'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
        }`}
      >
        <Paintbrush className="h-6 w-6" strokeWidth={2.5} />
      </button>
      <button
        onClick={() => setOverlay(overlay === 'frame' ? 'none' : 'frame')}
        className={`p-2.5 rounded-2xl transition-colors ${
          overlay === 'frame'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
        }`}
        title="frame"
      >
        <FrameIcon className="h-6 w-6" strokeWidth={2.5} />
      </button>
      {extraButtons}
    </div>
  );

  const drawer = (
    <div
      style={{
        overflow: 'hidden',
        maxHeight: drawerOpen ? '400px' : '0',
        transition: 'max-height 0.25s ease-in-out',
      }}
    >
      <div className="max-w-xl mx-auto w-full px-4 pb-5 pt-3">
        {overlay === 'font' && (
          <div className="flex gap-2 flex-wrap">
            {FONT_OPTIONS.map((font) => (
              <button
                key={font.value}
                onClick={() => setSelectedFont(font)}
                className={`px-4 py-2.5 rounded-2xl text-base font-medium transition-all ${
                  selectedFont.value === font.value
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
                style={{ fontFamily: font.family }}
              >
                {font.label}
              </button>
            ))}
          </div>
        )}
        {overlay === 'stationery' && (
          <StationeryPicker selected={stationery} onSelect={setStationery} />
        )}
        {overlay === 'frame' && (
          <FramePicker
            frame={frame}
            frameTint={frameTint}
            onFrameSelect={setFrame}
            onFrameTintChange={setFrameTint}
          />
        )}
        {!isBaseOverlay(overlay) && extraDrawerContent}
      </div>
    </div>
  );

  const card = (
    <>
      {beforeCard}
      <div
        className="max-w-xl mx-auto w-full flex-1"
        style={frame !== 'none' ? { padding: '28px 44px 44px' } : { padding: '0 16px 16px' }}
      >
        <div ref={cardRef} className="relative" style={{ containerType: 'inline-size' }}>
          <StationeryBackground
            stationery={stationery}
            frame={frame}
            frameTint={frameTint}
            className="rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
          >
            <div className="relative z-10 flex flex-col" style={{ aspectRatio: '5 / 4', padding: '5cqw' }}>
              {bodyContent?.({ lineHeightPx, stationeryTextColor, stationeryLineColor, resolvedFontFamily })}
              {/* Outro — closing + signature */}
              <div className="flex flex-col items-end" style={{ paddingTop: '4cqw', gap: '3cqw', paddingRight: '4cqw' }}>
                <Select value={closing || '__none__'} onValueChange={(v) => setClosing(v === '__none__' ? '' : v)}>
                  <SelectTrigger
                    className="w-auto h-auto focus:ring-0 focus:ring-offset-0 ring-0 ring-offset-0 outline-none rounded-2xl border-0 shadow-none flex-row-reverse gap-3 [&>span]:text-right"
                    style={{
                      fontSize: '4cqw',
                      padding: '2.5cqw 4cqw',
                      marginRight: '-4cqw',
                      color: closing ? stationeryTextColor : `${stationeryTextColor}44`,
                      backgroundColor: parseInt(stationeryTextColor.slice(stationeryTextColor.indexOf('(') + 1), 10) < 128
                        ? 'rgba(0,0,0,0.07)'
                        : 'rgba(255,255,255,0.18)',
                      fontFamily: resolvedFontFamily,
                    }}
                  >
                    <SelectValue placeholder="Closing..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-muted-foreground italic">None</span>
                    </SelectItem>
                    {CLOSING_PRESETS.map((preset) => (
                      <SelectItem key={preset} value={preset}>
                        {preset}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input
                  type="text"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  onFocus={() => setOverlay('none')}
                  maxLength={50}
                  placeholder="Your Name"
                  className="bg-transparent border-none font-semibold text-right focus:outline-none placeholder:opacity-60"
                  style={{
                    fontSize: '4.2cqw',
                    color: stationeryTextColor,
                    width: '60%',
                    fontFamily: resolvedFontFamily,
                  }}
                />
              </div>
            </div>
          </StationeryBackground>
          {cardOverlay}
        </div>
      </div>
    </>
  );

  if (!stickyHeader) {
    // Settings page mode: plain non-sticky toolbar row + drawer + card
    return (
      <>
        <div className="border-b border-border">
          {toolbarRow}
          {drawer}
        </div>
        {card}
      </>
    );
  }

  // Compose mode: full sticky header with backdrop blur
  return (
    <>
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        {toolbarRow}
        {drawer}
      </div>
      {card}
    </>
  );
}
