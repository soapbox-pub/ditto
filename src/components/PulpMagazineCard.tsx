/**
 * PulpMagazineCard
 *
 * Feed card for PressStr magazines (kind 34609) and magazine issues
 * (kind 39731), styled as a retro collectible: a glossy pulp issue lying
 * fresh on a lamp-lit wooden table, beside a green-phosphor terminal readout.
 *
 * - The magazine drops onto the table the first time it scrolls into view.
 * - Hovering picks it up off the table: it lifts, tilts toward the cursor,
 *   catches the light, and its dog-eared corner flattens out.
 * - The readout boots line by line, and the "[E] Read" prompt lights up on
 *   hover. Pressing E (or Enter) while the card is focused opens it, like
 *   picking up an item in a game.
 *
 * Magazines without their own cover art (and every kind 34609 parent, whose
 * `image` is usually a logo) get a generated pulp cover: a sunburst, a
 * masthead, and the logo framed as the cover illustration. A magazine also
 * fans its latest issues out underneath.
 */

import { useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { FormattedMessage, useIntl } from 'react-intl';

import { useInView } from '@/hooks/useInView';
import { useMagazineIssues } from '@/hooks/useMagazineIssues';
import { useOpenPost } from '@/hooks/useOpenPost';
import { loadBundledFont } from '@/lib/fonts';
import {
  formatFileSize,
  MAGAZINE_KIND,
  parsePublication,
  publicationNaddr,
  type Publication,
} from '@/lib/publications';
import { cn } from '@/lib/utils';

const MASTHEAD_FONT = '"Luckiest Guy", "Impact", system-ui, sans-serif';
const PRINT_FONT = '"Special Elite", "Courier New", monospace';

/** Terminal phosphor green. */
const PHOSPHOR = '#41ff94';
const PHOSPHOR_GLOW = '0 0 6px rgba(65, 255, 148, 0.55)';

/** Grain noise overlay (same technique as the love-list paper). */
const NOISE = `url("data:image/svg+xml,%3Csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E")`;

/** Lamp-lit walnut tabletop. */
const TABLE_BACKGROUND = [
  'radial-gradient(ellipse 70% 60% at 32% 38%, rgba(255, 196, 120, 0.22), transparent 70%)',
  'radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, 0.55) 100%)',
  'repeating-linear-gradient(91deg, rgba(0, 0, 0, 0.13) 0 2px, transparent 2px 9px)',
  'repeating-linear-gradient(89deg, rgba(255, 214, 160, 0.05) 0 1px, transparent 1px 23px)',
  'linear-gradient(180deg, #4a2f1b 0%, #3a2414 55%, #2c1a0e 100%)',
].join(', ');

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

/** Crimped bottle-cap edge in a 40×40 viewBox. */
const CAP_POINTS = Array.from({ length: 42 }, (_, i) => {
  const r = i % 2 === 0 ? 20 : 18;
  const a = (i / 42) * Math.PI * 2;
  return `${(20 + r * Math.cos(a)).toFixed(2)},${(20 + r * Math.sin(a)).toFixed(2)}`;
}).join(' ');

function paletteFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return COVER_PALETTES[hash % COVER_PALETTES.length];
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

interface PulpMagazineCardProps {
  event: NostrEvent;
  className?: string;
}

export function PulpMagazineCard({ event, className }: PulpMagazineCardProps) {
  const intl = useIntl();
  const pub = useMemo(() => parsePublication(event), [event]);
  const naddr = useMemo(() => publicationNaddr(event), [event]);
  const isMagazine = event.kind === MAGAZINE_KIND;

  const { issues } = useMagazineIssues(event.pubkey, pub.identifier, isMagazine);
  const { onClick: openCard, onAuxClick } = useOpenPost(`/${naddr}`, event);

  // Fonts are bundled; this is a no-op once loaded.
  void loadBundledFont('Luckiest Guy');
  void loadBundledFont('Special Elite');

  // Drop the magazine onto the table the first time it's seen.
  const { ref: viewRef, inView } = useInView({ threshold: 0.35 });
  const [landed, setLanded] = useState(false);
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

  const stackedIssues = useMemo(
    () => issues.map(parsePublication).filter((p) => p.image).slice(0, 2),
    [issues],
  );

  return (
    <div
      ref={viewRef}
      role="link"
      tabIndex={0}
      aria-label={intl.formatMessage(
        { id: 'pulpMagazine.open', defaultMessage: 'Open {title}' },
        { title: pub.title },
      )}
      className={cn(
        'group/mag relative isolate mt-3 cursor-pointer overflow-hidden rounded-2xl',
        'shadow-md outline-none motion-safe:transition-shadow motion-safe:duration-300 hover:shadow-lg',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
      style={{ background: TABLE_BACKGROUND }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={(e) => {
        e.stopPropagation();
        openCard(e);
      }}
      onAuxClick={(e) => {
        e.stopPropagation();
        onAuxClick(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'e' || e.key === 'E') {
          e.preventDefault();
          e.stopPropagation();
          openCard();
        }
      }}
    >
      <TableDressing />

      <div className="relative flex flex-col items-center gap-7 px-5 py-8 sm:flex-row sm:items-center sm:gap-8 sm:px-8">
        {/* The magazine, lying on the table */}
        <div className="relative w-40 shrink-0 [perspective:900px] sm:w-44">
          <div className={cn(landed && 'motion-safe:animate-magazine-drop')}>
            {/* Dust kicked up on landing */}
            {landed && (
              <span
                aria-hidden
                className="pointer-events-none absolute -inset-6 rounded-[45%] opacity-0 blur-md motion-safe:animate-magazine-dust"
                style={{ background: 'radial-gradient(closest-side, rgba(240, 220, 190, 0.45), transparent)' }}
              />
            )}
            <div
              ref={planeRef}
              className={cn(
                'relative',
                'motion-safe:transition-[transform,box-shadow] motion-safe:duration-500 motion-safe:[transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)]',
                'shadow-[2px_3px_2px_rgba(0,0,0,0.35),10px_16px_22px_rgba(0,0,0,0.45)]',
                'group-hover/mag:shadow-[4px_8px_6px_rgba(0,0,0,0.25),22px_38px_42px_rgba(0,0,0,0.4)]',
                'group-hover/mag:[--lie:6deg] group-hover/mag:[--rz:-1.5deg] group-hover/mag:[--lift:1.06]',
                'group-focus-visible/mag:[--lie:6deg] group-focus-visible/mag:[--rz:-1.5deg] group-focus-visible/mag:[--lift:1.06]',
              )}
              style={{
                transform:
                  'rotateX(calc(var(--lie, 26deg) + var(--rx, 0deg))) rotateY(var(--ry, 0deg)) rotateZ(var(--rz, -6deg)) scale(var(--lift, 1))',
              }}
            >
              {/* Older issues fanned out underneath */}
              {stackedIssues.map((issue, i) => (
                <img
                  key={issue.event.id}
                  src={issue.image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 size-full rounded-[3px] object-cover brightness-[0.8] motion-safe:transition-transform motion-safe:duration-500"
                  style={{
                    transform: `translate(${(i + 1) * 14}px, ${(i + 1) * -6}px) rotate(${(i + 1) * 9}deg)`,
                    zIndex: -1 - i,
                    boxShadow: '4px 6px 10px rgba(0,0,0,0.4)',
                  }}
                />
              ))}

              <MagazineCover pub={pub} issueCount={isMagazine ? issues.length : undefined} />
            </div>
          </div>
        </div>

        <PipReadout pub={pub} isMagazine={isMagazine} issueCount={issues.length} landed={landed} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table set dressing: grain, a coffee ring, and a couple of bottle caps
// ---------------------------------------------------------------------------

function TableDressing() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-0 opacity-[0.09] mix-blend-overlay" style={{ backgroundImage: NOISE }} />
      {/* Coffee ring */}
      <span
        className="absolute right-[6%] top-[-18%] size-28 rounded-full"
        style={{
          border: '3px solid rgba(40, 18, 6, 0.4)',
          boxShadow: 'inset 0 0 6px rgba(40, 18, 6, 0.35)',
          maskImage: 'conic-gradient(#000 0 230deg, transparent 260deg 300deg, #000 330deg)',
          WebkitMaskImage: 'conic-gradient(#000 0 230deg, transparent 260deg 300deg, #000 330deg)',
        }}
      />
      <BottleCap className="bottom-[9%] left-[5%] size-6 rotate-12" />
      <BottleCap className="bottom-[16%] left-[13%] size-5 -rotate-[30deg] opacity-90" />
      <BottleCap className="right-[4%] bottom-[6%] hidden size-6 rotate-[70deg] sm:block" />
    </div>
  );
}

function BottleCap({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn('absolute drop-shadow-[1px_2px_1px_rgba(0,0,0,0.5)]', className)}>
      <polygon points={CAP_POINTS} fill="#9b9b9b" />
      <circle cx="20" cy="20" r="16" fill="#b3261e" />
      <circle cx="20" cy="20" r="11.5" fill="none" stroke="#f4ead8" strokeWidth="2" />
      <ellipse cx="15" cy="13" rx="6" ry="3" fill="rgba(255,255,255,0.28)" transform="rotate(-30 15 13)" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// The magazine cover
// ---------------------------------------------------------------------------

function MagazineCover({ pub, issueCount }: { pub: Publication; issueCount?: number }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const palette = paletteFor(pub.identifier || pub.title);
  // Issues carry real cover art; magazines (and coverless issues) get a pulp cover.
  const useArtCover = pub.kind !== MAGAZINE_KIND && pub.image && !coverFailed;

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
          <PulpCover pub={pub} palette={palette} />
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

      <CoverSticker pub={pub} issueCount={issueCount} />
    </div>
  );
}

function PulpCover({ pub, palette }: { pub: Publication; palette: (typeof COVER_PALETTES)[number] }) {
  const title = pub.title.toUpperCase();
  const titleSize = title.length <= 12 ? '1.65rem' : title.length <= 24 ? '1.2rem' : '0.95rem';

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
        {pub.image && (
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
          className="relative mx-2 mb-2 ml-12 line-clamp-2 px-1.5 py-1 text-[9px] leading-tight"
          style={{ fontFamily: PRINT_FONT, background: palette.paper, color: '#2b2118' }}
        >
          {pub.summary}
        </p>
      )}
    </div>
  );
}

function CoverSticker({ pub, issueCount }: { pub: Publication; issueCount?: number }) {
  const label = pub.issue ? (
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

// ---------------------------------------------------------------------------
// Terminal item readout
// ---------------------------------------------------------------------------

function PipReadout({
  pub,
  isMagazine,
  issueCount,
  landed,
}: {
  pub: Publication;
  isMagazine: boolean;
  issueCount: number;
  landed: boolean;
}) {
  const intl = useIntl();

  const rows: Array<{ key: string; label: ReactNode; value: string }> = [];
  if (pub.issue) {
    rows.push({ key: 'issue', label: <FormattedMessage id="pulpMagazine.issue" defaultMessage="Issue" />, value: pub.issue });
  }
  if (isMagazine && issueCount > 0) {
    rows.push({ key: 'issues', label: <FormattedMessage id="pulpMagazine.issues" defaultMessage="Issues" />, value: String(issueCount) });
  }
  if (pub.publishedAt) {
    rows.push({
      key: 'published',
      label: <FormattedMessage id="pulpMagazine.published" defaultMessage="Published" />,
      value: intl.formatDate(new Date(pub.publishedAt * 1000), { month: 'short', year: 'numeric' }),
    });
  }
  if (!isMagazine && (pub.fileUrl || typeof pub.size === 'number')) {
    rows.push({
      key: 'weight',
      label: <FormattedMessage id="pulpMagazine.weight" defaultMessage="Weight" />,
      value: typeof pub.size === 'number' ? `${pub.format} · ${formatFileSize(pub.size)}` : pub.format,
    });
  }
  if (pub.language) {
    rows.push({ key: 'lang', label: <FormattedMessage id="pulpMagazine.language" defaultMessage="Lang" />, value: pub.language });
  }

  const perks = pub.topics.slice(0, 3);
  let line = 0;
  const boot = (): CSSProperties => ({ animationDelay: `${350 + line++ * 110}ms` });
  const bootClass = landed ? 'motion-safe:animate-terminal-boot' : undefined;

  return (
    <div
      className="relative w-full min-w-0 overflow-hidden rounded-xl border p-4 font-mono text-sm uppercase sm:flex-1"
      style={{
        background: 'radial-gradient(ellipse at 50% 40%, #0d2615 0%, #061209 80%)',
        borderColor: 'rgba(65, 255, 148, 0.28)',
        color: PHOSPHOR,
        textShadow: PHOSPHOR_GLOW,
        boxShadow: '0 0 24px rgba(65, 255, 148, 0.12), inset 0 0 24px rgba(0, 0, 0, 0.6)',
      }}
    >
      {/* Scanlines + a rolling scan bar */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'repeating-linear-gradient(to bottom, rgba(0,0,0,0.28) 0 1px, transparent 1px 3px)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1/3 opacity-60 motion-safe:animate-crt-scan"
        style={{ background: 'linear-gradient(to bottom, transparent, rgba(65, 255, 148, 0.07), transparent)' }}
      />

      <div className="relative space-y-2">
        <p className={cn('text-xs opacity-75', bootClass)} style={boot()}>
          {'> '}
          {isMagazine ? (
            <FormattedMessage id="pulpMagazine.kind.magazine" defaultMessage="Magazine" />
          ) : (
            <FormattedMessage id="pulpMagazine.kind.issue" defaultMessage="Magazine issue" />
          )}
        </p>

        <p className={cn('line-clamp-2 break-words text-base font-bold leading-snug sm:text-lg', bootClass)} style={boot()}>
          {pub.title}
        </p>

        <div className={cn('h-px w-full', bootClass)} style={{ ...boot(), background: 'rgba(65, 255, 148, 0.45)' }} />

        {rows.length > 0 && (
          <dl className="space-y-1 text-xs sm:text-sm">
            {rows.map((row) => (
              <div key={row.key} className={cn('flex items-baseline gap-2', bootClass)} style={boot()}>
                <dt className="shrink-0 opacity-80">{row.label}</dt>
                <span aria-hidden className="min-w-4 flex-1 border-b border-dotted" style={{ borderColor: 'rgba(65, 255, 148, 0.35)' }} />
                <dd className="min-w-0 truncate">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {perks.length > 0 && (
          <div className={cn('flex flex-wrap gap-1.5 pt-1 text-xs', bootClass)} style={boot()}>
            {perks.map((t) => (
              <span key={t} className="rounded-sm px-1.5 py-0.5" style={{ background: 'rgba(65, 255, 148, 0.12)' }}>
                <FormattedMessage id="pulpMagazine.perk" defaultMessage="+1 {topic}" values={{ topic: t }} />
              </span>
            ))}
          </div>
        )}

        {/* Interaction prompt — the selected-row highlight inverts on hover */}
        <div
          className={cn(
            'mt-2 flex items-center gap-2 rounded-sm px-2 py-1 text-sm font-bold motion-safe:transition-colors',
            'group-hover/mag:bg-[#41ff94] group-hover/mag:text-[#061209] group-hover/mag:[text-shadow:none]',
            'group-focus-visible/mag:bg-[#41ff94] group-focus-visible/mag:text-[#061209] group-focus-visible/mag:[text-shadow:none]',
            bootClass,
          )}
          style={boot()}
        >
          <kbd className="rounded-[2px] border border-current px-1 text-xs leading-tight">E</kbd>
          <span>
            {isMagazine ? (
              <FormattedMessage id="pulpMagazine.browse" defaultMessage="Browse issues" />
            ) : (
              <FormattedMessage id="pulpMagazine.read" defaultMessage="Read" />
            )}
          </span>
          <span aria-hidden className="ml-auto motion-safe:animate-terminal-blink">▌</span>
        </div>
      </div>
    </div>
  );
}
