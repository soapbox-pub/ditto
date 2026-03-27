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

import { useMemo } from 'react';
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

export type { PaletteLayout } from './ColorPaletteDisplay';

const DEFAULT_STATIONERY: Stationery = { color: DEFAULT_STATIONERY_COLOR };

function frameTintColor(resolved: ResolvedStationery): string {
  if (resolved.primaryColor) return resolved.primaryColor;
  if (resolved.colors && resolved.colors.length >= 1) return resolved.colors[0];
  return resolved.color ?? '#3a7a3a';
}

interface EmojiFrameProps {
  tint: string | null;
  thickness: number;
  emojis: string[];
  defaultBg: string;
}

function EmojiFrame({ tint, thickness, emojis, defaultBg }: EmojiFrameProps) {
  const t = thickness;
  const bgColor = tint ? darkenHex(tint, 0.45) : defaultBg;

  const flowers = useMemo(() => {
    const gap = 48;
    const row1 = 8;
    const row2 = t - 4;

    const items: { emoji: string; left: string; top: string; size: number; rot: number }[] = [];
    let ei = 0;
    const next = () => emojis[ei++ % emojis.length];

    const place = (left: string, top: string) => {
      items.push({ emoji: next(), left, top, size: 40, rot: 0 });
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
  }, [emojis, t]);

  return (
    <div
      className="absolute pointer-events-none select-none overflow-hidden"
      aria-hidden
      style={{
        inset: -t,
        borderRadius: '2rem',
        zIndex: -1,
        backgroundColor: bgColor,
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
            transform: `rotate(${f.rot}deg) translate(-50%, -50%)`,
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

function sanitizeEmoji(raw: string): string {
  return [...raw].filter((ch) => /\p{Emoji_Presentation}|\p{Extended_Pictographic}/u.test(ch)).join('').slice(0, 8);
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
  return <EmojiFrame key={frame} tint={tint} thickness={thickness} emojis={preset.emojis} defaultBg={preset.bgColor} />;
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
            backgroundImage: `url(${s.imageUrl})`,
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
            backgroundImage: `url(${s.imageUrl})`,
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
            backgroundImage: `url(${s.imageUrl})`,
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
