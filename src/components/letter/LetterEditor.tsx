/**
 * LetterEditor — drawer and preview card for composing/previewing letters.
 *
 * Callers own the sticky header. LetterEditor exposes its toolbar buttons
 * via the `renderToolbarButtons` render prop so callers can place them
 * inline in their own header row alongside back buttons, titles, etc.
 */

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { Paintbrush } from 'lucide-react';
import { TabButton } from '@/components/TabButton';

import {
  FONT_OPTIONS,
  CLOSING_PRESETS,
  LINE_HEIGHT_RATIO,
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
// LetterEditor types
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
  /**
   * Render prop — receives the toolbar button nodes and the sliding drawer so
   * the caller can compose them into their own sticky header+drawer region.
   * The drawer is passed separately so callers that want the arc-then-drawer
   * pattern can render it outside the SubHeaderBar.
   */
  renderToolbarButtons: (buttons: ReactNode, drawer: ReactNode) => ReactNode;
  /** Extra buttons appended after the base Aa/paintbrush/frame buttons. */
  extraButtons?: ReactNode;
  /** Extra drawer panels for overlays beyond 'font'/'stationery'/'frame'. */
  extraDrawerContent?: ReactNode;
  /** Current overlay — managed externally so callers can add custom overlays. */
  overlay: string;
  setOverlay: (o: string) => void;
  /** Body content rendered inside the card above the outro. */
  bodyContent?: (ctx: { lineHeightPx: number; stationeryTextColor: string; stationeryLineColor: string; resolvedFontFamily: string }) => ReactNode;
  /** Content rendered on top of the card (e.g. stickers layer). */
  cardOverlay?: ReactNode;
  /** Content rendered between the drawer and the card (e.g. recipient row). */
  beforeCard?: ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LetterEditor({
  state,
  renderToolbarButtons,
  extraButtons,
  extraDrawerContent,
  overlay,
  setOverlay,
  bodyContent,
  cardOverlay,
  beforeCard,
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
      setLineHeightPx(Math.round(w * LINE_HEIGHT_RATIO));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { text: stationeryTextColor, line: stationeryLineColor, fontFamily: themeFont } = useStationeryColors(stationery);
  const resolvedFontFamily = resolveFont(selectedFont.family, themeFont);

  const isBaseOverlay = (o: string): o is BaseOverlay => ['none', 'font', 'stationery', 'frame'].includes(o);
  const drawerOpen = overlay !== 'none';

  // The toolbar buttons — passed to renderToolbarButtons so the caller
  // can embed them in their own sticky header row.
  const toolbarButtons = (
    <>
      <TabButton
        label="Font"
        active={overlay === 'font'}
        onClick={() => setOverlay(overlay === 'font' ? 'none' : 'font')}
      >
        <span className="text-base font-bold">Aa</span>
      </TabButton>
      <TabButton
        label="Stationery"
        active={overlay === 'stationery'}
        onClick={() => setOverlay(overlay === 'stationery' ? 'none' : 'stationery')}
      >
        <Paintbrush className="h-5 w-5" strokeWidth={2.5} />
      </TabButton>
      <TabButton
        label="Frame"
        active={overlay === 'frame'}
        onClick={() => setOverlay(overlay === 'frame' ? 'none' : 'frame')}
      >
        <FrameIcon className="h-5 w-5" strokeWidth={2.5} />
      </TabButton>
      {extraButtons}
    </>
  );

  const drawer = (
    <div
      style={{
        overflow: 'hidden',
        maxHeight: drawerOpen ? (overlay === 'draw' ? '600px' : '400px') : '0',
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

  return (
    <>
      {/* Caller composes the toolbar buttons and drawer into their own sticky region */}
      {renderToolbarButtons(toolbarButtons, drawer)}

      {beforeCard}

      <div
        className="max-w-xl mx-auto w-full"
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
}
