/**
 * PulpMagazine
 *
 * PressStr magazines (kind 34609) and magazine issues (kind 39731) rendered
 * as a physical retro collectible: a glossy pulp issue lying fresh on the
 * page, with a worn cover, a dog-eared corner, a barcode, and a starburst
 * sticker.
 *
 * - It drops into place the first time it scrolls into view.
 * - Hovering picks it up: it lifts, tilts toward the cursor, catches the
 *   light, and its dog-eared corner flattens out.
 * - Clicking it opens the issue for reading (a magazine opens its latest
 *   issue). Enter, Space, or E work too when it's focused.
 *
 * Magazines without their own cover art (and every kind 34609 parent, whose
 * `image` is usually a logo) get a generated pulp cover: a sunburst, a
 * masthead, and the logo framed as the cover illustration. A magazine also
 * fans its latest issues out underneath.
 *
 * Used by the feed (`PulpMagazineCard`) and the publication detail view.
 */

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { Capacitor } from '@capacitor/core';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';

import { PdfReaderDialog } from '@/components/PdfViewer';
import { useAppContext } from '@/hooks/useAppContext';
import { useInView } from '@/hooks/useInView';
import { useMagazineIssues } from '@/hooks/useMagazineIssues';
import { useOpenPost } from '@/hooks/useOpenPost';
import { getContentWarning } from '@/lib/contentWarning';
import { openUrl } from '@/lib/downloadFile';
import { loadBundledFont } from '@/lib/fonts';
import {
  MAGAZINE_KIND,
  parsePublication,
  publicationNaddr,
  type Publication,
} from '@/lib/publications';
import { cn } from '@/lib/utils';

const MASTHEAD_FONT = '"Luckiest Guy", "Impact", system-ui, sans-serif';
const PRINT_FONT = '"Special Elite", "Courier New", monospace';

/** Grain noise overlay (same technique as the love-list paper). */
const NOISE = `url("data:image/svg+xml,%3Csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E")`;

/** Pulp cover palettes for generated covers, picked per magazine. */
const COVER_PALETTES = [
  { bg: '#E9B949', ink: '#1F2A44', shadow: '#C8412F', paper: '#F6ECD2' },
  { bg: '#2F7F86', ink: '#FFF3D6', shadow: '#1B3F45', paper: '#F6ECD2' },
  { bg: '#B8382B', ink: '#FFF3D6', shadow: '#5E1A12', paper: '#F6ECD2' },
  { bg: '#25395E', ink: '#F6E7C1', shadow: '#E5533D', paper: '#F6ECD2' },
];

const STICKER_COLOR = '#F2C14E';
const STICKER_INK = '#7A1F12';

/** 16-point starburst polygon in a 100×100 viewBox. */
const STARBURST_POINTS = Array.from({ length: 32 }, (_, i) => {
  const r = i % 2 === 0 ? 50 : 40;
  const a = (i / 32) * Math.PI * 2 - Math.PI / 2;
  return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`;
}).join(' ');

const SIZE_CLASSES = {
  feed: 'w-56 sm:w-72',
  detail: 'w-44 sm:w-52',
  grid: 'w-full',
} as const;

function paletteFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return COVER_PALETTES[hash % COVER_PALETTES.length];
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// ---------------------------------------------------------------------------
// Feed card: just the magazine
// ---------------------------------------------------------------------------

export function PulpMagazineCard({ event, className }: { event: NostrEvent; className?: string }) {
  const naddr = useMemo(() => publicationNaddr(event), [event]);
  const { onClick: openDetail } = useOpenPost(`/${naddr}`, event);

  return (
    <div className={cn('mt-3 flex justify-center px-6 pb-8 pt-6', className)}>
      {/* Nothing to read yet (e.g. a magazine with no issues): open its page. */}
      <PulpMagazine event={event} size="feed" onUnreadable={() => openDetail()} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The magazine object
// ---------------------------------------------------------------------------

interface PulpMagazineProps {
  event: NostrEvent;
  size?: keyof typeof SIZE_CLASSES;
  /** Called on click when there's no file to read. Without it, an unreadable magazine isn't clickable. */
  onUnreadable?: () => void;
  /**
   * Set when nothing above this magazine has applied the content-warning
   * guard to `event` (e.g. the issues grid). A warned issue then gets a plain
   * cover with no art, and clicking calls `onUnreadable` instead of reading.
   */
  concealSensitive?: boolean;
  className?: string;
}

export function PulpMagazine({ event, size = 'feed', onUnreadable, concealSensitive, className }: PulpMagazineProps) {
  const intl = useIntl();
  const navigate = useNavigate();
  const { config } = useAppContext();
  const pub = useMemo(() => parsePublication(event), [event]);
  const isMagazine = event.kind === MAGAZINE_KIND;

  /** Whether a publication's content warning should keep it covered. */
  const isWarned = (p: Publication) => config.contentWarningPolicy !== 'show' && getContentWarning(p.event) !== undefined;
  const concealed = Boolean(concealSensitive && isWarned(pub));

  const { issues } = useMagazineIssues(event.pubkey, pub.identifier, isMagazine);
  const issuePubs = useMemo(() => issues.map(parsePublication), [issues]);

  // What clicking reads: the issue itself, or a magazine's latest readable issue.
  const readTarget = concealed
    ? undefined
    : isMagazine ? issuePubs.find((p) => p.fileUrl) : pub.fileUrl ? pub : undefined;
  // A magazine's latest issue never went through the guard, so a warned one
  // opens on its own page (where the guard applies) instead of the reader.
  const readTargetWarned = isMagazine && readTarget !== undefined && isWarned(readTarget);
  const [readerOpen, setReaderOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const interactive = Boolean(readTarget || onUnreadable);

  // Fonts are bundled; this is a no-op once loaded.
  void loadBundledFont('Luckiest Guy');
  void loadBundledFont('Special Elite');

  // Drop into place the first time it's seen.
  const [landed, setLanded] = useState(false);
  const { ref: viewRef, inView } = useInView({ threshold: 0.35, skip: landed });
  if (inView && !landed) setLanded(true);

  const planeRef = useRef<HTMLDivElement>(null);

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const plane = planeRef.current;
    if (!plane || e.pointerType !== 'mouse' || prefersReducedMotion()) return;
    const rect = plane.getBoundingClientRect();
    const x = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const y = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1);
    plane.style.setProperty('--ry', `${((x - 0.5) * 16).toFixed(2)}deg`);
    plane.style.setProperty('--rx', `${((0.5 - y) * 12).toFixed(2)}deg`);
    plane.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
    plane.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
  };

  const handlePointerLeave = () => {
    const plane = planeRef.current;
    if (!plane) return;
    for (const prop of ['--rx', '--ry', '--gx', '--gy']) plane.style.removeProperty(prop);
  };

  const open = () => {
    if (!readTarget?.fileUrl) {
      onUnreadable?.();
    } else if (readTargetWarned) {
      navigate(`/${publicationNaddr(readTarget.event)}`);
    } else if (readTarget.format === 'PDF' && !Capacitor.isNativePlatform()) {
      // Swing the cover open first, then hand off to the reader.
      if (prefersReducedMotion()) setReaderOpen(true);
      else setOpening(true);
    } else {
      // EPUBs can't render inline, and native WebViews read PDFs poorly.
      void openUrl(readTarget.fileUrl);
    }
  };

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    open();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      e.stopPropagation();
      open();
    }
  };

  const stackedIssues = issuePubs.filter((p) => p.image && !isWarned(p)).slice(0, 2);

  return (
    <>
      <div
        ref={viewRef}
        className={cn(
          'group/mag relative shrink-0 rounded-sm outline-none [perspective:900px]',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background',
          interactive && 'cursor-pointer',
          SIZE_CLASSES[size],
          className,
        )}
        {...(interactive && {
          role: 'button',
          tabIndex: 0,
          'aria-label': readTarget
            ? intl.formatMessage({ id: 'pulpMagazine.readTitle', defaultMessage: 'Read {title}' }, { title: readTarget.title })
            : intl.formatMessage({ id: 'pulpMagazine.open', defaultMessage: 'Open {title}' }, { title: pub.title }),
          onClick: handleClick,
          onKeyDown: handleKeyDown,
        })}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <div className={cn(landed && 'motion-safe:animate-magazine-drop')}>
          {/* Dust kicked up on landing */}
          {landed && (
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-6 rounded-[45%] opacity-0 blur-md motion-safe:animate-magazine-dust"
              style={{ background: 'radial-gradient(closest-side, rgba(200, 180, 150, 0.4), transparent)' }}
            />
          )}
          <div
            ref={planeRef}
            className={cn(
              'relative',
              'motion-safe:transition-[transform,box-shadow] motion-safe:duration-500 motion-safe:[transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)]',
              'shadow-[2px_3px_2px_rgba(0,0,0,0.3),10px_16px_22px_rgba(0,0,0,0.3)]',
              'group-hover/mag:shadow-[4px_8px_6px_rgba(0,0,0,0.2),22px_38px_42px_rgba(0,0,0,0.3)]',
              'group-hover/mag:[--lie:6deg] group-hover/mag:[--rz:-1.5deg] group-hover/mag:[--lift:1.06]',
              'group-focus-visible/mag:[--lie:6deg] group-focus-visible/mag:[--rz:-1.5deg] group-focus-visible/mag:[--lift:1.06]',
            )}
            style={{
              transform:
                'rotateX(calc(var(--lie, 26deg) + var(--rx, 0deg))) rotateY(var(--ry, 0deg)) rotateZ(var(--rz, -6deg)) scale(var(--lift, 1))',
            }}
          >
            {/* Latest issues fanned out underneath */}
            {stackedIssues.map((issue, i) => (
              <img
                key={issue.event.id}
                src={issue.image}
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute inset-0 size-full rounded-[3px] object-cover brightness-[0.8]"
                style={{
                  transform: `translate(${(i + 1) * 14}px, ${(i + 1) * -6}px) rotate(${(i + 1) * 9}deg)`,
                  zIndex: -1 - i,
                  boxShadow: '4px 6px 10px rgba(0,0,0,0.3)',
                }}
              />
            ))}

            <MagazineCover pub={pub} issueCount={isMagazine ? issues.length : undefined} hideArt={concealed} />
          </div>
        </div>
      </div>

      {readTarget?.fileUrl && readTarget.format === 'PDF' && !readTargetWarned && (
        // The dialog portals out, but React events still bubble through this
        // tree — keep reader clicks and keys from reaching an enclosing card.
        <div className="contents" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {opening && (
            <MagazineOpening
              pub={readTarget}
              onDone={() => {
                setOpening(false);
                setReaderOpen(true);
              }}
            />
          )}
          <PdfReaderDialog url={readTarget.fileUrl} title={readTarget.title} open={readerOpen} onOpenChange={setReaderOpen} />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Opening animation: the cover swings open on its spine before the reader
// ---------------------------------------------------------------------------

/** How long the cover takes to swing open (keep in sync with the animations). */
const OPEN_DURATION_MS = 900;

/**
 * Purely decorative: it only animates the cover art already on screen. The
 * PDF itself is still rendered by the browser's built-in viewer in the reader
 * dialog, so no untrusted file is parsed by the app.
 */
function MagazineOpening({ pub, onDone }: { pub: Publication; onDone: () => void }) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Hand off on a timer rather than animationend, which never fires if the
  // animation is interrupted or the tab is hidden.
  useEffect(() => {
    const timer = window.setTimeout(() => onDoneRef.current(), OPEN_DURATION_MS + 150);
    return () => window.clearTimeout(timer);
  }, []);

  return createPortal(
    <div
      aria-hidden
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 animate-in fade-in duration-300"
      onClick={() => onDoneRef.current()}
    >
      <div className="w-[min(60vw,20rem)] [perspective:1800px]">
        {/* The book slides right as it opens so the spread ends up centered. */}
        <div className="relative animate-magazine-open-shift [transform-style:preserve-3d]">
          {/* First page, revealed under the cover */}
          <div
            className="absolute inset-0 overflow-hidden rounded-r-[3px] shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
            style={{ background: 'linear-gradient(90deg, #d9ccae 0%, #f3ead3 6%, #f6eedb 100%)' }}
          >
            <div className="absolute inset-0 opacity-[0.1] mix-blend-multiply" style={{ backgroundImage: NOISE }} />
            <div className="relative flex h-full flex-col justify-center gap-3 p-[10%]" style={{ containerType: 'inline-size' }}>
              <p className="line-clamp-4 text-[#2b2118]" style={{ fontFamily: MASTHEAD_FONT, fontSize: '9cqw', lineHeight: 1 }}>
                {pub.title}
              </p>
              <div className="h-[2px] w-1/3 bg-[#2b2118]/60" />
              {pub.summary && (
                <p className="line-clamp-6 text-[#2b2118]/80" style={{ fontFamily: PRINT_FONT, fontSize: '5cqw', lineHeight: 1.35 }}>
                  {pub.summary}
                </p>
              )}
            </div>
          </div>

          {/* The cover, hinged on its spine */}
          <div className="relative origin-left animate-magazine-open [transform-style:preserve-3d]">
            <div className="[backface-visibility:hidden]">
              <MagazineCover pub={pub} />
            </div>
            {/* Inside of the cover */}
            <div
              className="absolute inset-0 rounded-[3px] [backface-visibility:hidden] [transform:rotateY(180deg)]"
              style={{ background: 'linear-gradient(270deg, #cbbd9c 0%, #ece2c8 8%, #efe6cf 100%)' }}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// The magazine cover
// ---------------------------------------------------------------------------

function MagazineCover({ pub, issueCount, hideArt }: { pub: Publication; issueCount?: number; hideArt?: boolean }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const palette = paletteFor(pub.identifier || pub.title);
  // Issues carry real cover art; magazines (and coverless issues) get a pulp cover.
  const useArtCover = pub.kind !== MAGAZINE_KIND && pub.image && !coverFailed && !hideArt;

  return (
    <div className="relative [--ear:18px] group-hover/mag:[--ear:0px] group-focus-visible/mag:[--ear:0px]">
      {/* Page block peeking out under the cover */}
      <div
        aria-hidden
        className="absolute inset-0 translate-x-[3px] translate-y-[3px] rounded-[3px]"
        style={{
          background: 'repeating-linear-gradient(135deg, #efe5cc 0 1px, #d9ccad 1px 2px)',
          clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - var(--ear)), calc(100% - var(--ear)) 100%, 0 100%)',
        }}
      />

      <div
        className={cn(
          'relative aspect-[3/4] overflow-hidden rounded-[3px]',
          'motion-safe:transition-[clip-path] motion-safe:duration-500',
        )}
        style={{
          backgroundColor: palette.bg,
          // Cover type scales with the cover's width (cqw), so it reads the same at every size.
          containerType: 'inline-size',
          clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - var(--ear)), calc(100% - var(--ear)) 100%, 0 100%)',
        }}
      >
        {useArtCover ? (
          <img
            src={pub.image}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 size-full object-cover"
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <PulpCover pub={pub} palette={palette} hideArt={hideArt} />
        )}

        {/* Barcode */}
        <div className="absolute bottom-2 left-2 flex h-5 w-9 items-end rounded-[1px] bg-[#f6ecd2] p-[2px]">
          <div
            className="size-full"
            style={{
              background:
                'repeating-linear-gradient(90deg, #1a1a1a 0 1px, transparent 1px 2px, #1a1a1a 2px 4px, transparent 4px 5px, #1a1a1a 5px 6px, transparent 6px 8px)',
            }}
          />
        </div>

        {/* Gloss, wear, and a glare that follows the cursor */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(115deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 28%, rgba(255,255,255,0) 62%, rgba(255,255,255,0.1) 100%)',
            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.25), inset 0 0 14px rgba(60, 35, 10, 0.35)',
          }}
        />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.12] mix-blend-multiply" style={{ backgroundImage: NOISE }} />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 mix-blend-soft-light motion-safe:transition-opacity motion-safe:duration-300 group-hover/mag:opacity-100"
          style={{
            background: 'radial-gradient(circle at var(--gx, 30%) var(--gy, 20%), rgba(255,255,255,0.85), transparent 55%)',
          }}
        />
        {/* Spine crease */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-2"
          style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.3), rgba(255,255,255,0.12) 60%, transparent)' }}
        />
      </div>

      {/* Dog-eared corner: the back of the page folded over */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 motion-safe:transition-[width,height] motion-safe:duration-500"
        style={{
          width: 'var(--ear)',
          height: 'var(--ear)',
          background: 'linear-gradient(to top left, transparent 50%, #e9ddc0 50%, #d6c6a0 100%)',
          filter: 'drop-shadow(-1px -1px 1px rgba(0,0,0,0.3))',
        }}
      />

      <CoverSticker pub={pub} issueCount={issueCount} sensitive={hideArt} />
    </div>
  );
}

function PulpCover({ pub, palette, hideArt }: { pub: Publication; palette: (typeof COVER_PALETTES)[number]; hideArt?: boolean }) {
  const title = pub.title.toUpperCase();
  const titleSize = title.length <= 12 ? '16.5cqw' : title.length <= 24 ? '12cqw' : '9.5cqw';

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Sunburst */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: 'repeating-conic-gradient(from 0deg at 50% 64%, rgba(255,255,255,0.16) 0 7deg, transparent 7deg 14deg)',
        }}
      />

      {/* Masthead */}
      <div className="relative px-2.5 pt-3">
        <p
          className="line-clamp-3 break-words"
          style={{
            fontFamily: MASTHEAD_FONT,
            fontSize: titleSize,
            lineHeight: 0.92,
            color: palette.ink,
            textShadow: `2px 2px 0 ${palette.shadow}`,
            letterSpacing: '0.01em',
          }}
        >
          {title}
        </p>
        <div className="mt-1.5 h-[2px] w-full" style={{ background: palette.ink, opacity: 0.7 }} />
      </div>

      {/* Cover illustration */}
      <div className="relative flex flex-1 items-center justify-center px-4 py-2">
        {pub.image && !hideArt && (
          <div className="relative w-[70%] rotate-[-3deg] p-[3px] shadow-[2px_3px_6px_rgba(0,0,0,0.35)]" style={{ background: palette.paper }}>
            <img src={pub.image} alt="" loading="lazy" decoding="async" className="aspect-square w-full object-cover" />
            {/* Halftone print dots */}
            <div
              aria-hidden
              className="absolute inset-[3px] mix-blend-multiply"
              style={{ background: 'radial-gradient(rgba(0,0,0,0.22) 0.8px, transparent 1.1px) 0 0 / 4px 4px' }}
            />
          </div>
        )}
      </div>

      {/* Tagline */}
      {pub.summary && (
        <p
          className="relative mx-2 mb-2 ml-12 line-clamp-2 px-1.5 py-1 leading-tight"
          style={{ fontFamily: PRINT_FONT, fontSize: '5.6cqw', background: palette.paper, color: '#2b2118' }}
        >
          {pub.summary}
        </p>
      )}
    </div>
  );
}

function CoverSticker({ pub, issueCount, sensitive }: { pub: Publication; issueCount?: number; sensitive?: boolean }) {
  const label = sensitive ? (
    <FormattedMessage id="pulpMagazine.sticker.sensitive" defaultMessage="Sensitive" />
  ) : pub.issue ? (
    <FormattedMessage id="pulpMagazine.sticker.issue" defaultMessage="No. {issue}" values={{ issue: pub.issue.slice(0, 9) }} />
  ) : issueCount ? (
    <FormattedMessage id="pulpMagazine.sticker.issueCount" defaultMessage="{count, plural, one {# issue} other {# issues}}" values={{ count: issueCount }} />
  ) : (
    <FormattedMessage id="pulpMagazine.sticker.new" defaultMessage="New!" />
  );

  return (
    <div
      className="absolute -right-4 -top-4 flex size-16 rotate-12 items-center justify-center motion-safe:transition-transform motion-safe:duration-500 group-hover/mag:rotate-[24deg] group-hover/mag:scale-110"
      style={{ filter: 'drop-shadow(1px 2px 1px rgba(0,0,0,0.4))' }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
        <polygon points={STARBURST_POINTS} fill={STICKER_COLOR} stroke={STICKER_INK} strokeWidth="2" />
      </svg>
      <span
        className="relative max-w-[3.25rem] text-center text-[11px] uppercase leading-[0.95]"
        style={{ fontFamily: MASTHEAD_FONT, color: STICKER_INK }}
      >
        {label}
      </span>
    </div>
  );
}

