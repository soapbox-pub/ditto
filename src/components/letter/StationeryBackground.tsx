/**
 * StationeryBackground
 *
 * Renders a letter's stationery based on its source type:
 *
 *   preset       — flat color + faint tiled emoji backsplash
 *   color-moment — ColorPaletteDisplay with the actual layout
 *   theme        — flat background color + optional image
 *
 * Frame styles overlay on top.
 */

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  FRAME_PRESETS,
  DEFAULT_STATIONERY_COLOR,
  type Stationery,
  type ResolvedStationery,
  type FrameStyle,
  resolveStationery,
} from '@/lib/letterTypes';
import { ColorPaletteDisplay, type PaletteLayout } from './ColorPaletteDisplay';
import { hexLuminance, darkenHex } from '@/lib/colorUtils';
import { layoutFrame } from '@/lib/frameLayout';
import { sanitizeEmoji } from '@/lib/sanitizeEmoji';

export type { PaletteLayout } from './ColorPaletteDisplay';

const DEFAULT_STATIONERY: Stationery = { color: DEFAULT_STATIONERY_COLOR };

function frameTintColor(resolved: ResolvedStationery): string {
  if (resolved.primaryColor) return resolved.primaryColor;
  if (resolved.colors && resolved.colors.length >= 1) return resolved.colors[0];
  return resolved.color ?? '#3a7a3a';
}

interface EmojiFrameProps {
  /** Seeds the garland layout, so the same frame always lays out the same way. */
  id?: string;
  tint: string | null;
  thickness: number;
  emojis: string[];
  defaultBg: string;
  /**
   * Jitter positions, rotations, and sizes for a hand-scattered look
   * (deterministic, so the frame renders identically every time) instead of
   * the garland following the frame's rounded outline.
   */
  scatter?: boolean;
  /**
   * Keep `defaultBg` for the band even when a tint is applied — the tint then
   * only recolors the emojis (via the blend overlay) instead of also
   * darkening the band background.
   */
  keepDefaultBg?: boolean;
}

/** Deterministic pseudo-random in [0, 1) from an index + salt. */
function jitter(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const FRAME_RADIUS = 32;

interface PlacedEmoji {
  emoji: string;
  left: number | string;
  top: number | string;
  size: number;
  rot: number;
  jx: number;
  jy: number;
}

function scatterLayout(emojis: string[], t: number): PlacedEmoji[] {
  const gap = 40;
  const row1 = 8;
  const row2 = t - 4;

  const items: PlacedEmoji[] = [];
  let ei = 0;
  const next = () => emojis[ei++ % emojis.length];

  const place = (left: string, top: string) => {
    const i = items.length;
    items.push({
      emoji: next(),
      left,
      top,
      size: 26 + jitter(i, 1) * 18,
      rot: (jitter(i, 2) - 0.5) * 60,
      jx: (jitter(i, 3) - 0.5) * 14,
      jy: (jitter(i, 4) - 0.5) * 14,
    });
  };

  for (const d of [row1, row2]) {
    for (let x = 8; x < 800; x += gap) place(`${x}px`, `${d}px`);
    for (let x = 8; x < 800; x += gap) place(`${x}px`, `calc(100% - ${d}px)`);
  }
  for (const d of [row1, row2]) {
    for (let y = t + gap; y < 800; y += gap) place(`${d}px`, `${y}px`);
    for (let y = t + gap; y < 800; y += gap) place(`calc(100% - ${d}px)`, `${y}px`);
  }
  return items;
}

/**
 * Emoji border band (also reused by LoveListContent for its hearts frame).
 * Positions itself at `inset: -thickness` of its nearest positioned ancestor
 * with `zIndex: -1` — render it inside a `relative isolate` wrapper that has
 * `thickness` of surrounding padding to expose the band.
 *
 * Letter frames lay their emoji out as a garland following the frame's
 * rounded outline: one row of big emoji, evenly spaced at any size and drawn
 * in shuffled order so no emoji sits next to itself.
 */
export function EmojiFrame({ id = '', tint, thickness, emojis, defaultBg, scatter, keepDefaultBg }: EmojiFrameProps) {
  const t = thickness;
  const bgColor = tint && !keepDefaultBg ? darkenHex(tint, 0.45) : defaultBg;
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<[number, number]>([0, 0]);

  // Measured before paint, so the garland never shows up bare
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || scatter) return;
    const measure = () => setSize((prev) =>
      prev[0] === el.offsetWidth && prev[1] === el.offsetHeight ? prev : [el.offsetWidth, el.offsetHeight]);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scatter]);

  const flowers = useMemo((): PlacedEmoji[] => {
    if (scatter) return scatterLayout(emojis, t);
    // Wider than the border, so they tuck under the letter and run off the frame's edge
    return layoutFrame(size[0], size[1], emojis, id, [
      { inset: t * 0.55, radius: FRAME_RADIUS, spacing: 38, size: 42 },
    ]).map((f) => ({ emoji: f.emoji, left: f.x, top: f.y, size: f.size, rot: f.rot, jx: 0, jy: 0 }));
  }, [scatter, emojis, t, size, id]);

  return (
    <div
      ref={ref}
      className="absolute pointer-events-none select-none overflow-hidden"
      aria-hidden
      style={{
        inset: -t,
        borderRadius: FRAME_RADIUS,
        zIndex: -1,
        backgroundColor: bgColor,
        // Its own layer: a few hundred emoji glyphs are costly to paint, and
        // drawers sliding above the letter would otherwise repaint them each frame.
        willChange: 'transform',
      }}
    >
      {flowers.map((f, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            left: f.left,
            top: f.top,
            fontSize: `${f.size}px`,
            transform: scatter
              ? `translate(${f.jx}px, ${f.jy}px) rotate(${f.rot}deg) translate(-50%, -50%)`
              : `translate(-50%, -50%) rotate(${f.rot}deg)`,
            lineHeight: 1,
          }}
        >
          {f.emoji}
        </span>
      ))}
      {tint && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: tint,
            mixBlendMode: 'color',
            opacity: 0.6,
          }}
        />
      )}
    </div>
  );
}

function EmojiBacksplash({ emoji }: { emoji: string }) {
  const safe = sanitizeEmoji(emoji);
  if (!safe) return null;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><text x='12' y='44' font-size='32' opacity='0.10'>${safe}</text></svg>`;
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden select-none"
      aria-hidden
      style={{
        backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
        backgroundSize: '64px 64px',
        backgroundRepeat: 'repeat',
      }}
    />
  );
}

function EmojiEmblem({ emoji }: { emoji: string }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
      aria-hidden
    >
      <span style={{ fontSize: '4rem', lineHeight: 1, opacity: 0.10, transform: 'scale(3.5)', display: 'inline-block' }}>{emoji}</span>
    </div>
  );
}

interface StationeryBackgroundProps {
  stationery?: Stationery;
  frame?: FrameStyle;
  frameTint?: boolean;
  className?: string;
  children?: React.ReactNode;
}

function FrameRenderer({ frame, tint, thickness }: { frame: FrameStyle; tint: string | null; thickness: number }) {
  const preset = FRAME_PRESETS.find(f => f.id === frame);
  if (!preset?.emojis || !preset.bgColor) return null;
  return <EmojiFrame key={frame} id={frame} tint={tint} thickness={thickness} emojis={preset.emojis} defaultBg={preset.bgColor} />;
}

export function StationeryBackground({
  stationery,
  frame,
  frameTint = false,
  className = '',
  children,
}: StationeryBackgroundProps) {
  const s = resolveStationery(stationery ?? DEFAULT_STATIONERY);
  const hasColors = s.colors && s.colors.length >= 2;

  const tint = frameTint ? frameTintColor(s) : null;
  const frameThickness = 28;

  const containerStyle: React.CSSProperties = hasColors
    ? {}
    : { backgroundColor: s.color };

  const radiusClasses = className.match(/rounded-\S+/g)?.join(' ') ?? '';
  const hasFrame = frame && frame !== 'none';

  return (
    <div className={hasFrame ? `isolate relative ${className}` : `relative ${className}`} style={hasFrame ? { overflow: 'visible' } : { overflow: 'hidden', ...containerStyle }}>
    {hasFrame && <FrameRenderer frame={frame} tint={tint} thickness={frameThickness} />}
    <div
      className={hasFrame ? `relative overflow-hidden ${radiusClasses}` : ''}
      style={hasFrame ? containerStyle : {}}
    >
      {hasColors && (
        <ColorPaletteDisplay
          colors={s.colors!}
          layout={(s.layout as PaletteLayout) ?? 'horizontal'}
          className="absolute inset-0 w-full h-full"
        />
      )}
      {hasColors && s.emoji && (
        s.emojiMode === 'emblem'
          ? <EmojiEmblem emoji={s.emoji} />
          : <EmojiBacksplash emoji={s.emoji} />
      )}

      {!hasColors && s.imageUrl && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("${s.imageUrl}")`,
            backgroundSize: s.imageMode === 'tile' ? 'auto' : 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: s.imageMode === 'tile' ? 'repeat' : 'no-repeat',
            opacity: 0.5,
          }}
        />
      )}
      {!hasColors && s.emoji && (
        s.emojiMode === 'emblem'
          ? <EmojiEmblem emoji={s.emoji} />
          : <EmojiBacksplash emoji={s.emoji} />
      )}

      {children}
    </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StationeryPreview — picker grid swatch
// ---------------------------------------------------------------------------

interface StationeryPreviewProps {
  stationery: Stationery;
  selected?: boolean;
  className?: string;
}

function ThemeMockup({ stationery }: { stationery: Stationery }) {
  const s = resolveStationery(stationery);
  const bg      = s.color;
  const text    = s.textColor    ?? '#333333';
  const primary = s.primaryColor ?? '#4CAF50';
  const isDark  = hexLuminance(bg) < 0.3;
  const cardBg  = isDark ? `${bg}dd` : '#ffffffcc';

  return (
    <div className="absolute inset-0 p-1.5 flex flex-col gap-1" style={{ backgroundColor: bg }}>
      {s.imageUrl && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("${s.imageUrl}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.35,
          }}
        />
      )}
      <div className="relative z-10 h-2 rounded-sm" style={{ backgroundColor: cardBg }} />
      <div
        className="relative z-10 flex-1 rounded-sm p-1 flex flex-col justify-between overflow-hidden"
        style={{ backgroundColor: cardBg }}
      >
        <div className="space-y-0.5">
          <div className="h-1 w-3/4 rounded-full opacity-60" style={{ backgroundColor: text }} />
          <div className="h-1 w-1/2 rounded-full opacity-40" style={{ backgroundColor: text }} />
        </div>
        <div className="h-2 w-8 rounded-sm" style={{ backgroundColor: primary }} />
      </div>
      <div
        className="absolute right-0 top-0 bottom-0 w-3 z-10"
        style={{ backgroundColor: primary, opacity: 0.6 }}
      />
    </div>
  );
}

export function StationeryPreview({
  stationery,
  selected,
  className = '',
}: StationeryPreviewProps) {
  const s = resolveStationery(stationery);
  const ringClass = selected
    ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
    : '';

  if (s.colors && s.colors.length >= 2) {
    return (
      <div className={`relative overflow-hidden rounded-2xl ${ringClass} ${className}`}>
        <ColorPaletteDisplay
          colors={s.colors}
          layout={(s.layout as PaletteLayout) ?? 'horizontal'}
          className="w-full h-full"
        >
          {s.emoji && (
            <span className="text-xl drop-shadow select-none">{s.emoji}</span>
          )}
        </ColorPaletteDisplay>
      </div>
    );
  }

  if (s.textColor || s.primaryColor) {
    return (
      <div className={`relative overflow-hidden rounded-2xl ${ringClass} ${className}`}>
        <ThemeMockup stationery={stationery} />
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl ${ringClass} ${className}`}
      style={{ backgroundColor: s.color }}
    >
      {s.imageUrl && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("${s.imageUrl}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}
      {s.emoji && !s.imageUrl && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
          <span className="text-3xl opacity-70">{s.emoji}</span>
        </div>
      )}
    </div>
  );
}
