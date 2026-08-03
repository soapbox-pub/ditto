/**
 * LoveListContent
 *
 * Display for kind 15683 Love List updates (see NIP.md). Instead of a plain
 * people-list row, renders a tangible love letter: a cream paper sheet framed
 * by the letters' hearts emoji border, ruled lines, a stitched rose border, a
 * splattered wax heart seal, drifting hearts, and the loved ones written out
 * in a handwritten script — one heart per line, like names doodled in the
 * margin of a notebook.
 *
 * The kind number 15683 keypad-spells "1·LOVE" — "One Love".
 */

import { useId, useMemo, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { Heart } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { Skeleton } from '@/components/ui/skeleton';
import { EmojiFrame } from '@/components/letter/StationeryBackground';
import { useAuthor } from '@/hooks/useAuthor';
import { loveListPubkeys } from '@/hooks/useLoveList';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { getAvatarShape } from '@/lib/avatarShape';
import { getDisplayName } from '@/lib/getDisplayName';
import { FONT_OPTIONS, FRAME_PRESETS } from '@/lib/letterTypes';
import { ensureLetterFonts } from '@/lib/letterUtils';
import { cn } from '@/lib/utils';

/** The default letter font (Fredoka) — same as kind 8211 letters. */
const LETTER_FONT = FONT_OPTIONS[0].family;

/** How many loved ones to write on the sheet before "+N more". */
const MAX_NAMES = 8;
const MAX_NAMES_COMPACT = 4;

/** Paper-grain noise overlay (same technique as the letter envelope). */
const PAPER_NOISE = `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23n)'/%3E%3C/svg%3E")`;

/** Sealing-wax pink palette for the heart seal + splat. */
const WAX_LIGHT = '#f283b4';
const WAX_MID = '#d9518f';
const WAX_DARK = '#a52e68';
const WAX_EDGE = '#b03a72';

/** Sealing-wax gradient shared by the heart seal disc. */
const WAX_BACKGROUND = `
  radial-gradient(ellipse at 35% 30%, rgba(255,255,255,0.22) 0%, transparent 50%),
  radial-gradient(ellipse at 65% 70%, rgba(0,0,0,0.14) 0%, transparent 50%),
  radial-gradient(circle at 50% 50%, ${WAX_LIGHT} 0%, ${WAX_MID} 55%, ${WAX_DARK} 100%)
`;

/**
 * Wax splat blob behind the seal — the same path the letter send animation
 * (SendAnimation.tsx) stamps onto envelopes, so love lists and letters share
 * one distinct splat. ViewBox 0 0 84 84.
 */
const WAX_SPLAT_PATH =
  'M42 3 C50 2, 58 7, 64 13 C69 18, 76 24, 78 33 C80 41, 82 48, 77 56 C73 62, 66 70, 56 73 C48 76, 40 78, 32 74 C24 71, 14 66, 9 58 C5 50, 2 42, 4 34 C6 26, 12 18, 19 12 C26 6, 34 4, 42 3 Z';

/**
 * The letters' "Hearts" emoji frame preset — the same border band a letter
 * gets when its stationery uses the Hearts frame.
 */
const HEARTS_FRAME = FRAME_PRESETS.find((f) => f.id === 'hearts');

/** Frame band thickness, matching StationeryBackground's frameThickness. */
const FRAME_THICKNESS = 28;

/** Vivid rose-pink frame band (saturated, not washed out). */
const FRAME_BG = '#F0699F';

/**
 * Scattered background hearts drifting across the paper. Static positions
 * (not random) so the card renders identically every time.
 */
const BACKGROUND_HEARTS: Array<{
  style: CSSProperties;
  size: string;
  rotate: string;
  opacity: number;
}> = [
  { style: { top: '-0.75rem', right: '-0.75rem' }, size: 'size-20', rotate: 'rotate-12', opacity: 0.12 },
  { style: { top: '18%', left: '-1rem' }, size: 'size-14', rotate: '-rotate-[18deg]', opacity: 0.09 },
  { style: { top: '36%', right: '8%' }, size: 'size-9', rotate: 'rotate-[24deg]', opacity: 0.1 },
  { style: { top: '6%', left: '34%' }, size: 'size-7', rotate: '-rotate-6', opacity: 0.09 },
  { style: { top: '12%', right: '28%' }, size: 'size-6', rotate: 'rotate-[16deg]', opacity: 0.08 },
  { style: { top: '52%', left: '6%' }, size: 'size-8', rotate: 'rotate-[8deg]', opacity: 0.09 },
  { style: { top: '48%', left: '58%' }, size: 'size-6', rotate: '-rotate-[22deg]', opacity: 0.08 },
  { style: { bottom: '26%', right: '-0.75rem' }, size: 'size-16', rotate: '-rotate-[14deg]', opacity: 0.1 },
  { style: { bottom: '8%', left: '14%' }, size: 'size-10', rotate: '-rotate-12', opacity: 0.11 },
  { style: { bottom: '-1rem', right: '32%' }, size: 'size-16', rotate: 'rotate-[20deg]', opacity: 0.08 },
  { style: { top: '72%', left: '44%' }, size: 'size-7', rotate: 'rotate-[30deg]', opacity: 0.08 },
  { style: { bottom: '14%', right: '12%' }, size: 'size-7', rotate: 'rotate-6', opacity: 0.09 },
];

/**
 * A few hearts that float up from the bottom of the sheet like lava-lamp
 * bubbles, on a slow staggered loop — an ambient touch, kept to a handful so
 * the infinite animation stays cheap even when love-list cards appear in a
 * feed.
 */
const FLOATING_HEARTS: Array<{
  left: string;
  size: string;
  opacity: number;
  sway: number;
  duration: number;
  delay: number;
}> = [
  { left: '18%', size: 'size-5', opacity: 0.5, sway: 16, duration: 7, delay: 0 },
  { left: '46%', size: 'size-4', opacity: 0.4, sway: -14, duration: 8.5, delay: 2.4 },
  { left: '68%', size: 'size-6', opacity: 0.45, sway: 20, duration: 6.5, delay: 4.2 },
  { left: '84%', size: 'size-4', opacity: 0.35, sway: -12, duration: 9, delay: 1.2 },
];

// ---------------------------------------------------------------------------
// A single loved one, written on a ruled line
// ---------------------------------------------------------------------------

function LovedNameRow({ pubkey, compact }: { pubkey: string; compact?: boolean }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, pubkey);
  const avatarShape = getAvatarShape(metadata);
  const profileUrl = useProfileUrl(pubkey, metadata);

  return (
    <li
      className={cn(
        'relative flex items-center gap-3 min-w-0',
        compact ? 'py-2' : 'py-2.5',
      )}
    >
      {/* Ruled line — 3px with rounded caps, matching letter stationery lines */}
      <span
        aria-hidden
        className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full pointer-events-none"
        style={{ background: 'rgba(196, 134, 134, 0.3)' }}
      />
      <Heart
        aria-hidden
        className={cn('shrink-0', compact ? 'size-4' : 'size-[18px]')}
        style={{ color: '#C0392B', fill: '#E74C3C' }}
      />
      {author.isLoading ? (
        <>
          <Skeleton className={cn('rounded-full shrink-0', compact ? 'size-7' : 'size-8')} />
          <Skeleton className="h-5 w-28" />
        </>
      ) : (
        <>
          <ProfileHoverCard pubkey={pubkey} asChild>
            <Link to={profileUrl} className="shrink-0" onClick={(e) => e.stopPropagation()}>
              <Avatar
                shape={avatarShape}
                className={cn(compact ? 'size-7' : 'size-8', 'ring-1 ring-[#C48686]/40')}
              >
                <AvatarImage src={metadata?.picture} alt={displayName} />
                <AvatarFallback className="bg-[#E74C3C]/15 text-[#A93226] text-xs font-bold">
                  {displayName[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Link>
          </ProfileHoverCard>
          <ProfileHoverCard pubkey={pubkey} asChild>
            <Link
              to={profileUrl}
              onClick={(e) => e.stopPropagation()}
              className="truncate hover:underline decoration-[#C0392B]/50"
              style={{
                fontFamily: LETTER_FONT,
                fontSize: compact ? '1.5rem' : '1.7rem',
                lineHeight: 1.2,
                color: '#6B3A3A',
              }}
            >
              {displayName}
            </Link>
          </ProfileHoverCard>
        </>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

interface LoveListContentProps {
  event: NostrEvent;
  /** Compact mode for feed cards (fewer names, tighter spacing). */
  compact?: boolean;
  className?: string;
}

export function LoveListContent({ event, compact, className }: LoveListContentProps) {
  const pubkeys = useMemo(() => loveListPubkeys(event), [event]);
  const splatGradientId = useId();

  // Lazy-load the bundled letter font (no-op once loaded).
  ensureLetterFonts(LETTER_FONT);

  const maxNames = compact ? MAX_NAMES_COMPACT : MAX_NAMES;
  const visible = pubkeys.slice(0, maxNames);
  const overflow = pubkeys.length - visible.length;

  if (pubkeys.length === 0) {
    return (
      <div className={cn('mt-2 px-4 py-3', className)}>
        <p className="text-sm text-muted-foreground italic">An empty love list — hearts yet to be written.</p>
      </div>
    );
  }

  return (
    <div className={cn('mt-3', className)}>
      {/* Full feed width — the card is the content, like an image attachment.
          The padding band exposes the hearts emoji frame behind the sheet,
          exactly how letters wear their stationery frames. */}
      <div
        className="w-full rounded-[2rem] shadow-md motion-safe:transition-shadow motion-safe:duration-300 hover:shadow-lg"
        style={{ padding: FRAME_THICKNESS }}
      >
        {/* isolate keeps the frame's zIndex:-1 inside this card */}
        <div className="relative isolate">
          {HEARTS_FRAME?.emojis && (
            <EmojiFrame
              tint={FRAME_BG}
              thickness={FRAME_THICKNESS}
              emojis={HEARTS_FRAME.emojis}
              defaultBg={FRAME_BG}
              scatter
              keepDefaultBg
            />
          )}
          {/* Paper sheet */}
          <div
            className="relative rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(165deg, #FFF8F0 0%, #FDEFE6 55%, #F9E3DC 100%)',
            }}
          >
          {/* Paper grain */}
          <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: PAPER_NOISE }} />

          {/* Stitched rose border */}
          <div
            className="absolute inset-3 rounded-xl pointer-events-none"
            style={{ border: '2.5px dashed rgba(192, 57, 43, 0.4)' }}
          />

          {/* Drifting background hearts — a gentle side-to-side sway. Only
              ~12 per card and translate-only, so it composites cheaply. */}
          {BACKGROUND_HEARTS.map((h, i) => (
            <span
              key={i}
              aria-hidden
              className="absolute pointer-events-none motion-safe:animate-heart-drift"
              style={{ ...h.style, animationDelay: `${(i % 4) * 0.5}s`, animationDuration: `${4 + (i % 3)}s` }}
            >
              <Heart
                className={cn('block', h.size, h.rotate)}
                style={{ color: '#E74C3C', fill: '#E74C3C', opacity: h.opacity }}
              />
            </span>
          ))}

          {/* Hearts floating up from the bottom of the sheet (ambient loop) */}
          {FLOATING_HEARTS.map((h, i) => (
            <span
              key={`float-${i}`}
              aria-hidden
              className="absolute pointer-events-none motion-safe:animate-heart-float"
              style={{
                left: h.left,
                animationDelay: `${h.delay}s`,
                '--float-sway': `${h.sway}px`,
                '--float-opacity': h.opacity,
                '--float-duration': `${h.duration}s`,
              } as CSSProperties}
            >
              <Heart className={cn('block', h.size)} style={{ color: '#E74C3C', fill: '#E74C3C' }} />
            </span>
          ))}

          {/* Subtle paper edge shading */}
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{ boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.6), inset 0 -2px 8px rgba(122, 26, 25, 0.06)' }}
          />

          {/* Content sits inside the dotted border (inset-3 + 2.5px stitch) */}
          <div className={cn('relative', compact ? 'p-7' : 'px-8 sm:px-10 py-8')}>
            {/* Heading — wax-seal heart + handwritten title. The m-1 gives the
                splat a little breathing room from the title and content edge. */}
            <div className="flex items-center gap-4 mb-5">
              <span className={cn('relative shrink-0 m-1', compact ? 'size-14' : 'size-16')}>
                {/* Wax splat — same blob the letter send animation stamps on */}
                <svg
                  aria-hidden
                  viewBox="0 0 84 84"
                  className="absolute pointer-events-none"
                  style={{ left: '-17%', top: '-17%', width: '134%', height: '134%' }}
                >
                  <defs>
                    <radialGradient id={splatGradientId}>
                      <stop offset="0%" stopColor={WAX_LIGHT} />
                      <stop offset="50%" stopColor={WAX_MID} />
                      <stop offset="85%" stopColor={WAX_DARK} />
                      <stop offset="100%" stopColor={WAX_DARK} stopOpacity="0.6" />
                    </radialGradient>
                  </defs>
                  <path d={WAX_SPLAT_PATH} fill={`url(#${splatGradientId})`} />
                  <path d={WAX_SPLAT_PATH} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                </svg>
                {/* Seal disc */}
                <span
                  className="absolute rounded-full flex items-center justify-center"
                  style={{
                    inset: 2,
                    background: WAX_BACKGROUND,
                    border: `2px solid ${WAX_EDGE}`,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.14), inset 0 1.5px 2px rgba(255,255,255,0.18), inset 0 -1.5px 2px rgba(0,0,0,0.18)',
                  }}
                >
                  <Heart className={compact ? 'size-7' : 'size-8'} style={{ color: '#FBE9E7', fill: '#FBE9E7' }} aria-hidden />
                </span>
              </span>
              <span
                style={{
                  fontFamily: LETTER_FONT,
                  fontSize: compact ? '2rem' : '2.4rem',
                  color: '#7a1a19',
                  lineHeight: 1,
                  // Optical correction: Fredoka's ink mass sits below the
                  // line-box center, so nudge up to truly center on the seal.
                  transform: 'translateY(-0.06em)',
                }}
              >
                Love List
              </span>
            </div>

            {/* The loved ones, written line by line */}
            <ul className="space-y-0">
              {visible.map((pk) => (
                <LovedNameRow key={pk} pubkey={pk} compact={compact} />
              ))}
            </ul>

            {overflow > 0 && (
              <p
                className="mt-3"
                style={{
                  fontFamily: LETTER_FONT,
                  fontSize: compact ? '1.35rem' : '1.5rem',
                  color: '#A05252',
                }}
              >
                …and {overflow} more dearly loved
              </p>
            )}

            {/* Footer flourish */}
            <div className="flex items-center justify-center gap-2.5 mt-5" aria-hidden>
              <span className="h-px flex-1 max-w-28" style={{ background: 'linear-gradient(90deg, transparent, #C48686)' }} />
              <Heart className="size-4" style={{ color: '#C0392B', fill: '#E74C3C', opacity: 0.7 }} />
              <span className="h-px flex-1 max-w-28" style={{ background: 'linear-gradient(270deg, transparent, #C48686)' }} />
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact card for embedded notes / quote posts
// ---------------------------------------------------------------------------

interface LoveListCompactProps {
  event: NostrEvent;
  className?: string;
}

/**
 * Minimal inline card for kind 15683 in embedded contexts.
 * Shows author avatar + "updated their Love List · N loved ones" on a
 * miniature paper chip.
 */
export function LoveListCompact({ event, className }: LoveListCompactProps) {
  const navigate = useNavigate();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = getDisplayName(metadata, event.pubkey);
  const profileUrl = useProfileUrl(event.pubkey, metadata);
  const count = useMemo(() => loveListPubkeys(event).length, [event]);

  const neventId = useMemo(
    () => nip19.neventEncode({ id: event.id, author: event.pubkey }),
    [event.id, event.pubkey],
  );

  return (
    <div
      className={cn(
        'group block rounded-2xl border overflow-hidden cursor-pointer transition-colors',
        className,
      )}
      style={{
        background: 'linear-gradient(165deg, #FFF8F0 0%, #F9E3DC 100%)',
        borderColor: 'rgba(192, 57, 43, 0.25)',
      }}
      role="link"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/${neventId}`);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          navigate(`/${neventId}`);
        }
      }}
    >
      <div className="px-3 py-2 space-y-1">
        {/* Author row */}
        <div className="flex items-center gap-2 min-w-0">
          {author.isLoading ? (
            <>
              <Skeleton className="size-5 rounded-full shrink-0" />
              <Skeleton className="h-3.5 w-24" />
            </>
          ) : (
            <>
              <ProfileHoverCard pubkey={event.pubkey} asChild>
                <Link to={profileUrl} className="shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Avatar shape={avatarShape} className="size-5">
                    <AvatarImage src={metadata?.picture} alt={displayName} />
                    <AvatarFallback className="bg-[#E74C3C]/15 text-[#A93226] text-[10px]">
                      {displayName[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Link>
              </ProfileHoverCard>
              <ProfileHoverCard pubkey={event.pubkey} asChild>
                <Link
                  to={profileUrl}
                  className="text-sm font-semibold truncate hover:underline"
                  style={{ color: '#6B3A3A' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {displayName}
                </Link>
              </ProfileHoverCard>
            </>
          )}
        </div>

        {/* Content line */}
        <p className="flex items-center gap-1.5 text-sm" style={{ color: '#A05252' }}>
          <Heart className="size-3.5 shrink-0" style={{ fill: '#E74C3C', color: '#C0392B' }} aria-hidden />
          <span>
            Updated their Love List
            {count > 0 && (
              <> · <span className="font-medium" style={{ color: '#7a1a19' }}>{count} loved {count === 1 ? 'one' : 'ones'}</span></>
            )}
          </span>
        </p>
      </div>
    </div>
  );
}
