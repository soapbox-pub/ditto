import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useInView } from '@/hooks/useInView';
import { getAvatarShape } from '@/lib/avatarShape';
import { cn } from '@/lib/utils';
import type { AuthorData } from '@/hooks/useAuthors';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * "Everybody Votes"-style poll results in CSS 3D: every voter is a little
 * round-bodied figure with their avatar for a head. They pop up in the middle
 * of an open floor and run to the side (two options) or pie slice (three or
 * more) they voted for, then cheer.
 *
 * Built like the low-poly scenery on dreamith.to: a `perspective` container
 * with a fixed camera tilt, zero-size `preserve-3d` joints placed at their
 * pivots, and animations on the individual `rotate` / `translate` properties
 * so they stack on top of each part's static placement. Each voter is a flat
 * sprite that always faces the camera, so body parts never clip into each
 * other; the 3D is in the floor, the depth sorting and the running.
 */

interface ArenaOption {
  id: string;
  label: string;
}

interface PollArenaProps {
  options: ArenaOption[];
  votes: NostrEvent[];
  tally: Map<string, number>;
  totalVotes: number;
  pollType: string;
  userPubkey?: string;
  authorsMap?: Map<string, AuthorData>;
  /** Open the voters modal, optionally filtered to one option. */
  onOpenVoters: (optionId: string | null) => void;
}

/** Team colors, in option order. */
const OPTION_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#a855f7', // purple
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
];

/** Most bodies on the floor; the rest are represented by the tally. */
const MAX_VISIBLE = 28;

/** Floor size in world px (the whole scene is scaled to fit the card). */
const FLOOR_W = 380;
const FLOOR_D = 240;
const PIE_RADIUS = FLOOR_D / 2;
/** How thick the floating platform is. */
const PLATFORM_DEPTH = 10;
/** Seams and rim on the floor. Opaque, so lines don't darken where they cross. */
const SEAM = 'color-mix(in srgb, white 88%, hsl(var(--background)))';
/** Corner radius of the two-sided court. */
const FLOOR_RADIUS = 36;

/** Camera pitch: how far it looks down at the floor. */
const TILT = 46;

/** Width the scene is designed at; narrower cards scale it down. */
const DESIGN_WIDTH = 440;
const SCENE_HEIGHT = 256;

/** Running speed in world px per second. */
const RUN_SPEED = 120;
/** Pop-in time before a voter starts running. */
const SPAWN_MS = 220;
/** One full run cycle (left + right step). */
const STRIDE_MS = 380;
const CHEER_MS = 900;

const GOLDEN = 0.618034;

/** Zero-size 3D joint: children hang off its origin. */
const JOINT = 'absolute left-0 top-0 size-0 [transform-style:preserve-3d]';

function optionColor(index: number): string {
  return OPTION_COLORS[index % OPTION_COLORS.length];
}

function shade(color: string, amount: number): string {
  return amount >= 0
    ? `color-mix(in srgb, ${color}, white ${amount}%)`
    : `color-mix(in srgb, ${color}, black ${-amount}%)`;
}

/** Team color washed into the page background, for the floor. Works in light and dark themes. */
function floorTint(color: string, darken = 0): string {
  const tint = `color-mix(in srgb, ${color} 42%, hsl(var(--background)))`;
  return darken ? `color-mix(in srgb, ${tint}, black ${darken}%)` : tint;
}

/** Deterministic 0–1 value from a string, so voters keep their spot between renders. */
function hash01(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

function frac(n: number): number {
  return n - Math.floor(n);
}

/** Option IDs a vote counts toward, following the same rules as the tally. */
function votedOptionIds(vote: NostrEvent, pollType: string): string[] {
  const ids = vote.tags.filter(([n]) => n === 'response').map(([, id]) => id).filter(Boolean);
  if (pollType === 'singlechoice') return ids.slice(0, 1);
  return [...new Set(ids)];
}

/** A spot on the floor: x is left→right, z is far→near, both centered on the floor. */
interface FloorPoint {
  x: number;
  z: number;
}

interface Placement extends FloorPoint {
  key: string;
  pubkey: string;
  optionIndex: number;
}

/** Floor point at `r` from the center; angle 0 is the far edge, clockwise seen from above. */
function polar(r: number, angle: number): FloorPoint {
  return { x: r * Math.sin(angle), z: -r * Math.cos(angle) };
}

/** How big each figure is drawn, given how many share the floor. */
function figureScale(count: number): number {
  const room = Math.sqrt((Math.PI * (FLOOR_W / 2) * (FLOOR_D / 2) * 0.5) / Math.max(1, count));
  return Math.min(1, Math.max(0.6, room / 44));
}

/**
 * Huddle a team together on its side of the court, Everybody Votes style:
 * a tight, slightly ragged crowd packed out from the middle of the side
 * (the first voter, usually you, stands in the middle).
 */
function huddlePoints(keys: string[], x0: number, x1: number, scale: number): FloorPoint[] {
  const n = keys.length;
  if (n === 0) return [];
  const cx = (x0 + x1) / 2;
  const cz = FLOOR_D * 0.04;
  // Shoulder-to-shoulder spacing, squeezed if the crowd would spill off its side.
  const reach = Math.sqrt(n);
  const sx = Math.min(17 * scale, ((x1 - x0) / 2) / reach);
  const sz = Math.min(19 * scale, (FLOOR_D * 0.36) / reach);
  return keys.map((key, i) => {
    const r = Math.sqrt(i + 0.5);
    const angle = i * GOLDEN * Math.PI * 2;
    return {
      x: cx + Math.cos(angle) * r * sx + (hash01(key) - 0.5) * sx * 0.35,
      z: cz + Math.sin(angle) * r * sz + (hash01(key + 'z') - 0.5) * sz * 0.35,
    };
  });
}

/** Scatter points over a pie wedge, sunflower-style. */
function wedgePoints(keys: string[], a0: number, a1: number): FloorPoint[] {
  const n = keys.length;
  const span = a1 - a0;
  const pad = Math.min(span * 0.12, 0.15);
  const usable = span - pad * 2;
  const rMin = PIE_RADIUS * (span > Math.PI ? 0.1 : 0.34);
  const rMax = PIE_RADIUS * 0.82;
  return keys.map((key, i) => {
    const r = rMin + (rMax - rMin) * Math.sqrt((i + 0.5) / n);
    const angle = a0 + pad + usable * frac(0.5 + i * GOLDEN + (n > 1 ? hash01(key) * 0.05 : 0));
    return polar(r, angle);
  });
}

function usePrefersReducedMotion(): boolean {
  const [reduced] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
  return reduced;
}

export function PollArena({
  options,
  votes,
  tally,
  totalVotes,
  pollType,
  userPubkey,
  authorsMap,
  onOpenVoters,
}: PollArenaProps) {
  const intl = useIntl();
  const reduced = usePrefersReducedMotion();
  // When the race started (ms, `performance.now()`), or null until the arena
  // first scrolls into view. Observing stops once it has.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const { ref: inViewRef, inView } = useInView({ threshold: 0.3, skip: startedAt !== null });
  const [scale, setScale] = useState(1);
  const boxRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (inView) setStartedAt(performance.now());
  }, [inView]);

  // Fit the fixed-size world to the card width.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(1.2, entry.contentRect.width / DESIGN_WIDTH));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isSplit = options.length === 2;

  const shares = useMemo(
    () => options.map((opt) => (totalVotes > 0 ? (tally.get(opt.id) ?? 0) / totalVotes : 1 / options.length)),
    [options, tally, totalVotes],
  );

  const slices = useMemo(() => {
    let acc = 0;
    return shares.map((share) => {
      const a0 = acc * Math.PI * 2;
      acc += share;
      return { a0, a1: acc * Math.PI * 2 };
    });
  }, [shares]);

  // Share of the floor the left team gets. Clamped so a lopsided vote
  // still leaves the minority somewhere to stand.
  const leftShare = isSplit ? Math.min(0.7, Math.max(0.3, shares[0])) : 0.5;
  const dividerX = -FLOOR_W / 2 + FLOOR_W * leftShare;

  const placements = useMemo<Placement[]>(() => {
    const optionIndex = new Map(options.map((opt, i) => [opt.id, i]));

    // You first, then oldest votes, so newcomers join the back of the
    // crowd instead of reshuffling it.
    const groups: NostrEvent[][] = options.map(() => []);
    const sorted = [...votes].sort((a, b) => {
      if (a.pubkey === userPubkey) return -1;
      if (b.pubkey === userPubkey) return 1;
      return a.created_at - b.created_at;
    });
    for (const vote of sorted) {
      for (const id of votedOptionIds(vote, pollType)) {
        const idx = optionIndex.get(id);
        if (idx !== undefined) groups[idx].push(vote);
      }
    }

    const entries = groups.reduce((sum, g) => sum + g.length, 0);
    const visible = groups.map((g) =>
      entries <= MAX_VISIBLE ? g : g.slice(0, Math.max(1, Math.round((g.length / entries) * MAX_VISIBLE))),
    );

    const scale = figureScale(visible.reduce((sum, g) => sum + g.length, 0));
    const edge = FLOOR_W * 0.4;
    const result: Placement[] = [];
    visible.forEach((group, idx) => {
      const keys = group.map((v) => `${options[idx].id}:${v.pubkey}`);
      const points = isSplit
        ? huddlePoints(keys, idx === 0 ? -edge : dividerX + 18, idx === 0 ? dividerX - 18 : edge, scale)
        : wedgePoints(keys, slices[idx].a0, slices[idx].a1);
      group.forEach((vote, i) => {
        result.push({ key: keys[i], pubkey: vote.pubkey, optionIndex: idx, ...points[i] });
      });
    });
    return result;
  }, [options, votes, pollType, userPubkey, isSplit, dividerX, slices]);

  // Size the figures to the room each one gets, so a big crowd shrinks
  // instead of piling heads on top of heads.
  const bodyScale = figureScale(placements.length);

  const home = useMemo<FloorPoint>(() => (isSplit ? { x: dividerX, z: FLOOR_D * 0.38 } : { x: 0, z: 0 }), [isSplit, dividerX]);

  const myOptionIds = useMemo(() => {
    const mine = userPubkey ? votes.find((v) => v.pubkey === userPubkey) : undefined;
    return new Set(mine ? votedOptionIds(mine, pollType) : []);
  }, [votes, userPubkey, pollType]);

  /** Floor paint; `darken` shades it for the platform's side. */
  const floorPaint = (darken: number): string => {
    if (isSplit) {
      const at = leftShare * 100;
      return `linear-gradient(to right, ${floorTint(optionColor(0), darken)} ${at}%, ${floorTint(optionColor(1), darken)} ${at}%)`;
    }
    const stops = slices
      .map(({ a0, a1 }, idx) => `${floorTint(optionColor(idx), darken)} ${a0}rad ${a1}rad`)
      .join(', ');
    return `conic-gradient(${stops})`;
  };

  // Seams between teams, drawn as real lines so they stay the same width
  // all the way to the middle of the pie.
  const seams = useMemo(() => {
    if (isSplit) {
      const x = FLOOR_W * leftShare;
      return [{ x1: x, y1: 0, x2: x, y2: FLOOR_D }];
    }
    const filled = slices.filter(({ a0, a1 }) => a1 - a0 > 1e-6);
    if (filled.length < 2) return [];
    return filled.map(({ a0 }) => {
      const p = polar(PIE_RADIUS, a0);
      return { x1: PIE_RADIUS, y1: PIE_RADIUS, x2: PIE_RADIUS + p.x, y2: PIE_RADIUS + p.z };
    });
  }, [isSplit, leftShare, slices]);

  const floorBox: CSSProperties = {
    left: isSplit ? -FLOOR_W / 2 : -PIE_RADIUS,
    top: isSplit ? -FLOOR_D / 2 : -PIE_RADIUS,
    width: isSplit ? FLOOR_W : PIE_RADIUS * 2,
    height: isSplit ? FLOOR_D : PIE_RADIUS * 2,
    // Two sides stand on a rounded-rectangle court; more options on a round pie.
    borderRadius: isSplit ? FLOOR_RADIUS : '50%',
  };

  return (
    <div className="mt-3">
      <button
        ref={(node) => {
          boxRef.current = node;
          inViewRef(node);
        }}
        type="button"
        onClick={() => onOpenVoters(null)}
        aria-label={intl.formatMessage({ id: 'poll.seeVoters', defaultMessage: 'See who voted' })}
        className="relative block w-full overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ height: SCENE_HEIGHT * scale, perspective: 1000 * scale, perspectiveOrigin: '50% 0%' }}
      >
        {/* Camera: a fixed tilt down at the floor */}
        <div
          className={JOINT}
          style={{
            left: '50%',
            top: '50%',
            transform: `translateY(${(isSplit ? -14 : 8) * scale}px) rotateX(-${TILT}deg) scale3d(${scale}, ${scale}, ${scale})`,
          }}
        >
          {/* Soft contact shadow under the platform */}
          <div
            className="absolute blur-md"
            style={{ ...floorBox, transform: `rotateX(90deg) translateZ(-${PLATFORM_DEPTH + 4}px) scale(1.02)`, background: 'rgb(0 0 0 / 0.07)' }}
          />

          {/* Platform side: stacked copies of the floor, a little darker, so it reads as a solid disc */}
          {[4, 3, 2, 1].map((step) => (
            <div
              key={step}
              className="absolute"
              style={{
                ...floorBox,
                transform: `rotateX(90deg) translateZ(-${(PLATFORM_DEPTH * step) / 4}px)`,
                background: floorPaint(14),
              }}
            />
          ))}

          {/* Floor: the platform's top face, with a soft sheen, white seams and a white rim */}
          <div
            className="absolute overflow-hidden"
            style={{
              ...floorBox,
              transform: 'rotateX(90deg)',
              background: `radial-gradient(ellipse at 50% 30%, rgb(255 255 255 / 0.25), transparent 65%), ${floorPaint(0)}`,
              boxShadow: `inset 0 0 0 3px ${SEAM}`,
            }}
          >
            <svg
              className="absolute inset-0 size-full"
              viewBox={`0 0 ${floorBox.width} ${floorBox.height}`}
              aria-hidden
            >
              {seams.map((seam, i) => (
                <line key={i} {...seam} stroke={SEAM} strokeWidth={4} strokeLinecap="round" />
              ))}
            </svg>
          </div>

          {/* Voters only exist once the race starts, so their CSS runs play on mount. */}
          {(startedAt !== null || reduced) && placements.map((p, i) => (
            <Voter
              key={p.key}
              target={p}
              home={home}
              startedAt={startedAt ?? 0}
              reduced={reduced}
              delay={Math.min(i * 70, 1400)}
              bodyScale={bodyScale}
              color={optionColor(p.optionIndex)}
              isMe={p.pubkey === userPubkey}
              author={authorsMap?.get(p.pubkey)}
            />
          ))}
        </div>
      </button>

      {/* Legend: one bar per option, filled to its share */}
      <div className="mt-3 space-y-1.5">
        {options.map((opt, idx) => {
          const count = tally.get(opt.id) ?? 0;
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const isMine = myOptionIds.has(opt.id);
          const color = optionColor(idx);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onOpenVoters(opt.id)}
              className="relative flex w-full items-center gap-2.5 overflow-hidden rounded-lg border border-border-subtle px-3 py-2 text-left transition-colors hover:border-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className="absolute inset-y-0 left-0 transition-[width] duration-700 ease-out motion-reduce:transition-none"
                style={{ width: `${pct}%`, backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}
              />
              <span className="relative size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              <span className={cn('relative min-w-0 flex-1 text-sm break-words', isMine && 'font-semibold')}>{opt.label}</span>
              {isMine && <CheckCircle2 className="relative size-4 shrink-0 text-primary" />}
              <span className="relative shrink-0 text-xs tabular-nums text-muted-foreground">
                <FormattedMessage id="poll.voteCount" defaultMessage="{count, plural, one {# vote} other {# votes}}" values={{ count }} />
              </span>
              <span className="relative w-10 shrink-0 text-right text-sm font-semibold tabular-nums">{pct}%</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ──── Voter ──── */

interface VoterProps {
  target: FloorPoint;
  home: FloorPoint;
  /** When the race started (`performance.now()`). */
  startedAt: number;
  reduced: boolean;
  delay: number;
  bodyScale: number;
  color: string;
  isMe: boolean;
  author?: AuthorData;
}

/**
 * The sprite is drawn at twice its on-screen size and scaled down. Chrome
 * rasterizes each animated layer in its own local pixels, so this keeps
 * avatars and edges crisp instead of soft.
 */
const RES = 2;
/** Sprite size in local px (RES × world px, before `bodyScale`). */
const SPRITE_W = 64;
const SPRITE_H = 96;
/**
 * Empty margin around the sprite. Chrome crops each animated layer to its
 * own box, so the box must leave room for hops and cheering arms.
 */
const SPRITE_PAD = 32;

const PANTS = '#475569';
const SHOES = '#1e293b';

/**
 * Shade a limb or torso as a lit cylinder: light from the upper left,
 * a bright core, and a dark falloff on both edges (more on the right).
 */
function cylinder(color: string): string {
  return `linear-gradient(90deg, ${shade(color, -38)}, ${shade(color, -4)} 18%, ${shade(color, 22)} 36%, ${color} 58%, ${shade(color, -24)} 84%, ${shade(color, -48)})`;
}

/** Shading over the avatar so the head reads as a ball, not a sticker. */
const HEAD_SHADING = [
  'radial-gradient(circle at 33% 26%, rgb(255 255 255 / 0.55), rgb(255 255 255 / 0.12) 16%, transparent 32%)',
  'radial-gradient(circle at 45% 40%, transparent 50%, rgb(0 0 0 / 0.18) 78%, rgb(0 0 0 / 0.45) 100%)',
].join(', ');

/**
 * One voter: pops up at `home`, runs to `target`, cheers, then stands still.
 * The whole performance is scheduled up front as CSS animations with
 * per-voter delays, so it costs no React renders while it plays and nothing
 * at all once everyone has arrived.
 */
const Voter = memo(function Voter({ target, home, startedAt, reduced, delay, bodyScale, color, isMe, author }: VoterProps) {
  const intl = useIntl();

  // Plan the run once, at mount. Voters who show up after the race has begun
  // (e.g. a fresh vote) set off right away instead of waiting their turn. If
  // the crowd later reshuffles, the voter's end spot moves but the race
  // doesn't replay.
  const [run] = useState(() => {
    const late = performance.now() - startedAt > 250;
    const dx = target.x - home.x;
    const dz = target.z - home.z;
    const dist = Math.hypot(dx, dz);
    // A whole number of strides, so the limbs finish at rest.
    const strides = Math.max(1, Math.round(dist / RUN_SPEED / (STRIDE_MS / 1000)));
    return {
      from: home,
      spawnAt: late ? 0 : delay,
      runAt: (late ? 0 : delay) + SPAWN_MS,
      strides,
      ms: strides * STRIDE_MS,
      // Lean sideways by how much of the run is across the screen.
      lean: dist > 0 ? (dx / dist) * 8 : 0,
    };
  });

  const metadata = author?.metadata;
  const name = metadata?.name || metadata?.display_name || intl.formatMessage({ id: 'common.anonymous', defaultMessage: 'Anonymous' });

  const { spawnAt, runAt, strides, ms } = run;
  const arriveAt = runAt + ms;
  const anim = (css: string) => (reduced ? undefined : css);
  const running = (name: string, period = STRIDE_MS, count = strides, extra = '') =>
    anim(`${name} ${period}ms ease-in-out ${runAt}ms ${count}${extra}`);

  const feet = `50% calc(100% - ${SPRITE_PAD}px)`;

  return (
    <div
      className={JOINT}
      style={{
        ['--poll-from-x' as string]: `${run.from.x}px`,
        ['--poll-from-z' as string]: `${run.from.z}px`,
        ['--poll-to-x' as string]: `${target.x}px`,
        ['--poll-to-z' as string]: `${target.z}px`,
        translate: `${target.x}px 0 ${target.z}px`,
        animation: anim(`poll-run ${ms}ms linear ${runAt}ms both`),
      }}
      title={name}
    >
      {/* The sprite stands on the floor and cancels the camera tilt, so it
          always faces the viewer. Everything inside is flat and layered by
          DOM order, so parts never cut through each other. */}
      <div
        className="absolute"
        style={{
          left: -SPRITE_W / 2 - SPRITE_PAD,
          top: -SPRITE_H - SPRITE_PAD,
          width: SPRITE_W + SPRITE_PAD * 2,
          height: SPRITE_H + SPRITE_PAD * 2,
          transformOrigin: feet,
          transform: `rotateX(${TILT}deg) scale(${bodyScale / RES})`,
        }}
      >
        {/* Contact shadow at the feet */}
        <div
          className="absolute h-[12px] w-[44px] rounded-full"
          style={{
            left: SPRITE_PAD + SPRITE_W / 2 - 22,
            top: SPRITE_PAD + SPRITE_H - 6,
            background: 'radial-gradient(closest-side, rgb(0 0 0 / 0.34), rgb(0 0 0 / 0.12) 60%, transparent)',
          }}
        />

        <div className="absolute inset-0" style={{ animation: anim(`poll-pop ${SPAWN_MS}ms ease-out ${spawnAt}ms both`) }}>
          <div className="absolute inset-0" style={{ animation: running('poll-run-bob', STRIDE_MS / 2, strides * 2) }}>
            <div className="absolute inset-0" style={{ animation: anim(`poll-hop ${CHEER_MS}ms ease-out ${arriveAt}ms`) }}>
              <div
                className="absolute inset-0"
                style={{
                  ['--poll-lean' as string]: `${run.lean}deg`,
                  transformOrigin: feet,
                  animation: anim(`poll-lean ${ms}ms linear ${runAt}ms both`),
                }}
              >
                <div className="absolute" style={{ left: SPRITE_PAD, top: SPRITE_PAD, width: SPRITE_W, height: SPRITE_H }}>
                  {/* Legs, with rounded shoes */}
                  {(['a', 'b'] as const).map((leg) => (
                    <div
                      key={leg}
                      className="absolute bottom-0 h-[26px] w-[12px]"
                      style={{ left: leg === 'a' ? 20 : 32, animation: running(`poll-step-${leg}`) }}
                    >
                      <div className="absolute inset-x-[1px] top-0 h-[22px] rounded-b-[5px]" style={{ background: cylinder(PANTS) }} />
                      <div
                        className="absolute -inset-x-[1px] bottom-0 h-[8px] rounded-[6px_6px_4px_4px]"
                        style={{
                          background: `radial-gradient(ellipse at 35% 25%, ${shade(SHOES, 35)}, ${SHOES} 60%)`,
                        }}
                      />
                    </div>
                  ))}

                  {/* Arms, behind the torso; they pump while running and go up to cheer */}
                  {[-1, 1].map((side) => (
                    <div
                      key={side}
                      className="absolute top-[40px] h-[27px] w-[10px] origin-[50%_5px]"
                      style={{
                        left: SPRITE_W / 2 + side * 14 - 5,
                        animation: running('poll-arm-pump', STRIDE_MS, strides, side < 0 ? ' reverse' : ''),
                      }}
                    >
                      <div
                        className="absolute inset-0 origin-[50%_5px] rounded-full"
                        style={{
                          ['--side' as string]: side,
                          background: cylinder(shade(color, -10)),
                          animation: anim(`poll-cheer-arm ${CHEER_MS}ms ease-in-out ${arriveAt}ms`),
                        }}
                      />
                    </div>
                  ))}

                  {/* Torso: a rounded barrel in the team color, shadowed under the head */}
                  <div
                    className="absolute left-[18px] top-[36px] h-[38px] w-[28px] rounded-[13px_13px_9px_9px]"
                    style={{
                      background: [
                        'radial-gradient(ellipse 55% 28% at 50% 0%, rgb(0 0 0 / 0.32), transparent)',
                        'radial-gradient(ellipse 22% 16% at 34% 30%, rgb(255 255 255 / 0.45), transparent)',
                        cylinder(color),
                      ].join(', '),
                      boxShadow: 'inset 0 -7px 8px -4px rgb(0 0 0 / 0.3)',
                    }}
                  />

                  {/* Avatar head, shaded as a sphere */}
                  <Avatar
                    shape={getAvatarShape(metadata)}
                    className="absolute left-[12px] top-0 size-[40px] bg-white"
                    style={{
                      boxShadow: `0 0 0 2px ${isMe ? 'hsl(var(--primary))' : shade(color, -20)}, 0 4px 5px rgb(0 0 0 / 0.22)`,
                    }}
                  >
                    <AvatarImage src={metadata?.picture} imeta={author?.imeta?.picture} alt={name} />
                    <AvatarFallback className="text-[18px] font-bold text-white" style={{ background: color }}>
                      {name[0]?.toUpperCase()}
                    </AvatarFallback>
                    <div className="pointer-events-none absolute inset-0" style={{ background: HEAD_SHADING }} />
                  </Avatar>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
