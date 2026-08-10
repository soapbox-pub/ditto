import { useState } from 'react';
import { Lock } from 'lucide-react';

import { DittoLogo } from '@/components/DittoLogo';
import { DITTO_EXPLORER_BADGE_IMAGE } from '@/lib/badgeClaim';
import { cn } from '@/lib/utils';

/**
 * Artwork for the mission surfaces, and the three different things it has to
 * mean.
 *
 * The Ditto Explorer badge image (`DITTO_EXPLORER_BADGE_IMAGE`) **is the
 * reward**: a sticker showing exactly what the user gets for finishing the
 * journey. It was being used as the journey's identity as well, on every
 * surface, from the first second of the arrival onwards. Desaturating it did
 * not help, because the shape is the spoiler.
 *
 * So the ideas are kept apart:
 *
 *  - {@link ExplorerJourneyMark} — what the *journey* looks like. Abstract, and
 *    safe to show at 0/4. Used by the sidebar widget, the mobile teaser, the
 *    introduction and the page header.
 *  - {@link SealedRewardArt} — what the *unrevealed reward* looks like. The
 *    real badge artwork, cropped and blurred past recognition behind a sharp
 *    Ditto seal.
 *  - The real badge image, sharp — rendered only by `/badges`, from the badge
 *    event, once the badge has actually been issued.
 *
 * ### The mission surfaces may now render the badge image — but only sealed
 *
 * The rule used to be "no mission surface ever renders the badge artwork", and
 * for a fully abstract placeholder that was the whole story. It is now more
 * precise: **the reward surfaces may render the official badge artwork, but only
 * inside {@link SealedRewardArt}, cropped and obscured so the reward is not
 * revealed.** A sharp, recognisable badge image before the reveal is still
 * forbidden, and that is what the tests pin.
 *
 * This is spoiler prevention, not secrecy. The badge definition is a public
 * kind 30009 event and the image URL is in the DOM; anyone who wants to look can
 * look. The point is that nobody sees it *by accident*, on the way to earning it.
 */

/**
 * The Ditto Explorer journey's own mark.
 *
 * An orbit and a small traveller: it echoes Ditto's ringed planet without
 * borrowing the app's logo, and says "a journey" rather than "a prize". Built
 * from an inline SVG so it inherits the theme's primary colour, costs no
 * network request, and cannot be confused with the badge.
 */
export function ExplorerJourneyMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      // Stable hook for tests and the development harness: the class list
      // carries per-surface sizing, so it is not selectable.
      data-explorer-journey-mark=""
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl',
        'bg-gradient-to-br from-primary/20 via-primary/10 to-transparent ring-1 ring-primary/20',
        className,
      )}
    >
      <svg viewBox="0 0 48 48" fill="none" className="size-[64%] text-primary">
        <ellipse
          cx="24"
          cy="24"
          rx="19"
          ry="8"
          stroke="currentColor"
          strokeOpacity="0.4"
          strokeWidth="2"
          transform="rotate(-24 24 24)"
        />
        <circle cx="24" cy="24" r="8.5" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="24" cy="24" r="3" fill="currentColor" fillOpacity="0.5" />
        <circle cx="39.5" cy="15" r="2.75" fill="currentColor" />
      </svg>
    </span>
  );
}

/**
 * How far into the badge artwork the sealed crop zooms.
 *
 * **The crop does more work than the blur, and this is why.** Blur is a low-pass
 * filter: it destroys lettering and edges, but it preserves large tonal masses,
 * and the astronaut's near-black visor on a white helmet is exactly that. Blurred
 * at a sane radius with the whole badge in frame, it survives as a dark blob over
 * a light one, which reads as a head in well under a second.
 *
 * At 3× the frame lands inside the spacesuit. The visor, the flag, the moon, the
 * "Ditto Explorer" banner and the badge's own circular border are all outside it
 * — not softened, *absent*. What is left is real, specific, softly-shaded colour
 * with no boundary between subject and ground, which is the thing worth showing.
 *
 * Measured, not guessed: at 2.6 a dark smudge still sits top-left of the frame.
 */
const SEALED_CROP_SCALE = 3;

/** Where in the artwork that crop is centred — the suit, not the helmet. */
const SEALED_CROP_POSITION = '48% 50%';

/**
 * Blur radius as a fraction of the rendered frame width.
 *
 * Proportional rather than fixed: a radius tuned at 112px would leave the same
 * artwork legible at the ~320px the reveal will use. Both sizes get the same
 * *apparent* softness, so the treatment cannot quietly weaken as it grows.
 *
 * 3.8% is deliberately modest (≈4px at 112, ≈12px at 320). Heavier radii were
 * tried and are worse: past ~8% every frame collapses into the same flat purple
 * field, which hides the reward by destroying it rather than by concealing it,
 * and leaves nothing that feels like a real object.
 */
const SEALED_BLUR_RATIO = 0.038;

/**
 * The Ditto seal, as fractions of the frame: the plate, the mark on it, and the
 * lock chip on its rim.
 *
 * The lock is small and sits *on the rim at 45°* rather than beside the mark. A
 * larger chip nearer the middle — the first attempt — read as a notification
 * blob stuck to the logo and competed with it for the same glance.
 */
const SEAL_LOGO_RATIO = 0.3;
const SEAL_PLATE_RATIO = 0.44;
const SEAL_LOCK_RATIO = 0.2;

/**
 * The reward, still sealed: the real thing, behind Ditto's seal.
 *
 * The predecessor was a hexagon — honest, safe, and silent. A generic container
 * implies generic contents, so it carried no anticipation at all. This shows the
 * actual badge artwork, cropped and blurred past recognition, which says *there
 * is a specific, real, made thing here* without saying what it is.
 *
 * Layered back to front:
 *
 *  1. **Ground** — a soft primary field and the abstract seal. Always rendered,
 *     never conditional, because the artwork above it is a remote image: if it
 *     is slow, blocked, or gone, what remains must still look like a finished
 *     sealed object rather than a hole.
 *  2. **Artwork** — {@link DITTO_EXPLORER_BADGE_IMAGE}, cropped by
 *     {@link SEALED_CROP_SCALE}, blurred by {@link SEALED_BLUR_RATIO},
 *     desaturated and slightly flattened, and masked to fade out at the edges so
 *     it reads as a sealed object rather than as a rectangular photograph
 *     underneath.
 *  3. **Wash** — a little primary over the top, so the colours that survive
 *     belong to Ditto's palette rather than announcing the reward's own.
 *  4. **Seal** — the Ditto logo, sharp, on a plate. The plate is not decoration:
 *     the logo is a solid `--primary` silhouette and the artwork behind it is
 *     purple, so without it the mark disappears into its own background. On the
 *     plate it holds in every theme, and the composition reads as *Ditto is
 *     holding something for you*.
 *  5. **Lock** — a chip on the plate's edge. Never colour alone: there is a
 *     padlock glyph here, and the word "Locked" beside it in `MissionReward`.
 *
 * `ready` warms the treatment — the frame's ring, the ground, the wash — but the
 * padlock **stays**. Nothing has been unlocked at 4/4; the reward has only become
 * claimable, and the panel's copy and its call to action carry that. Swapping the
 * lock for a spark here said "opened" a whole ceremony too early.
 *
 * Decorative throughout: `aria-hidden` on the root, `alt=""` on the image. The
 * reward's state is carried by real text in `MissionReward`, so none of it
 * depends on this rendering, on filters being supported, or on the remote image
 * arriving at all.
 */
export function SealedRewardArt({
  size = 112,
  ready = false,
  className,
}: {
  /**
   * Rendered edge length in px. A number rather than a size class because the
   * blur is derived from it — see {@link SEALED_BLUR_RATIO}.
   */
  size?: number;
  /** The journey is finished and the reward can be claimed. Still sealed. */
  ready?: boolean;
  className?: string;
}) {
  // Local and deliberately not persisted: a failed image is a fact about this
  // page load, not about the user. A remount is free to try again.
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <span
      aria-hidden
      data-sealed-reward-art=""
      style={{ width: size, height: size }}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl',
        'ring-1',
        ready ? 'ring-primary/30' : 'ring-border',
        className,
      )}
    >
      {/* 1 — ground. Also the whole picture when the artwork never arrives. */}
      <span
        className={cn(
          'absolute inset-0',
          ready
            ? 'bg-[radial-gradient(circle_at_50%_38%,hsl(var(--primary)/0.30),hsl(var(--primary)/0.10)_52%,transparent_76%)]'
            : 'bg-[radial-gradient(circle_at_50%_38%,hsl(var(--primary)/0.16),hsl(var(--primary)/0.05)_52%,transparent_76%)]',
        )}
      />
      <span className={cn('absolute inset-0', ready ? 'bg-primary/[0.04]' : 'bg-muted/40')} />
      <svg viewBox="0 0 64 64" fill="none" className="absolute size-[62%]">
        <polygon
          points="32,7 54,19.5 54,44.5 32,57 10,44.5 10,19.5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
          className={ready ? 'text-primary/70' : 'text-muted-foreground/40'}
        />
      </svg>

      {/* 2 — the real reward, unreadable. */}
      {!imageFailed && (
        <img
          src={DITTO_EXPLORER_BADGE_IMAGE}
          alt=""
          aria-hidden
          data-sealed-reward-image=""
          onError={() => setImageFailed(true)}
          // Never `loading="lazy"`: the ground is the fallback, and an image
          // that arrives late is fine, but one deferred behind the fold makes
          // the sealed reward change appearance as the user scrolls to it.
          className="sealed-reward-image absolute inset-0 size-full object-cover"
          style={{
            objectPosition: SEALED_CROP_POSITION,
            // Both the resting transform and the ambient drift's keyframes read
            // this, so the two cannot disagree about where the crop sits.
            ['--sealed-crop-scale' as string]: String(SEALED_CROP_SCALE),
            transform: `scale(${SEALED_CROP_SCALE})`,
            filter: `blur(${(size * SEALED_BLUR_RATIO).toFixed(1)}px) saturate(0.55) contrast(0.88)`,
            // Fades to nothing before the frame's edge, so the crop never
            // resolves into a rectangle with corners.
            maskImage: 'radial-gradient(circle at 50% 46%, black 48%, transparent 92%)',
            WebkitMaskImage: 'radial-gradient(circle at 50% 46%, black 48%, transparent 92%)',
          }}
        />
      )}

      {/* 3 — tone what survives toward Ditto. Subtle on purpose: heavier and the
          reward stops being an object and becomes a purple gradient. */}
      <span className="absolute inset-0 bg-primary/[0.14]" />

      {/* 4 — the seal. */}
      <span
        className={cn(
          'relative flex items-center justify-center rounded-full shadow-sm ring-1',
          'bg-background/95',
          ready ? 'ring-primary/25' : 'ring-border/70',
        )}
        style={{ width: size * SEAL_PLATE_RATIO, height: size * SEAL_PLATE_RATIO }}
      >
        <DittoLogo size={Math.round(size * SEAL_LOGO_RATIO)} />
      </span>

      {/* 5 — still locked, and said with a glyph rather than a colour. */}
      <span
        className={cn(
          'absolute flex items-center justify-center rounded-full ring-1',
          'bg-background text-muted-foreground',
          ready ? 'ring-primary/30' : 'ring-border',
        )}
        style={{
          width: size * SEAL_LOCK_RATIO,
          height: size * SEAL_LOCK_RATIO,
          minWidth: 18,
          minHeight: 18,
          // Centred on the plate's rim at 45° (hence the √2/2), so the chip
          // straddles the edge instead of sitting inside the plate or floating
          // free of it.
          right: size / 2 - ((size * SEAL_PLATE_RATIO) / 2) * 0.707 - (size * SEAL_LOCK_RATIO) / 2,
          bottom: size / 2 - ((size * SEAL_PLATE_RATIO) / 2) * 0.707 - (size * SEAL_LOCK_RATIO) / 2,
        }}
      >
        <Lock className="size-[52%] min-h-3 min-w-3" aria-hidden />
      </span>
    </span>
  );
}

/**
 * The reward, once the reveal has happened — as a placeholder.
 *
 * The revealed reward is eventually a character of Ditto's own, drawn as an SVG
 * so it can be sized, themed and animated. That does not exist yet, and this
 * fills the gap **without** falling back to the sharp badge artwork: revealing
 * the reward by finally showing the picture the seal was hiding is the one thing
 * this branch of the UI must not do by accident.
 *
 * So it is the seal, opened: the same plate and mark, warmed, with no artwork
 * behind it and no padlock on it. Deliberately quiet — it is a placeholder, and
 * looking unfinished is more honest than looking like the finished thing.
 *
 * Separate from {@link SealedRewardArt} rather than a variant of it, because the
 * tests need "no sealed art in the revealed state" to be a structural fact.
 */
export function RevealedRewardArt({
  size = 112,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-revealed-reward-art=""
      style={{ width: size, height: size }}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl',
        'ring-1 ring-primary/30',
        className,
      )}
    >
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,hsl(var(--primary)/0.30),hsl(var(--primary)/0.10)_52%,transparent_76%)]" />
      <span className="absolute inset-0 bg-primary/[0.04]" />
      <span
        className="relative flex items-center justify-center rounded-full bg-background/95 shadow-sm ring-1 ring-primary/25"
        style={{ width: size * SEAL_PLATE_RATIO, height: size * SEAL_PLATE_RATIO }}
      >
        <DittoLogo size={Math.round(size * SEAL_LOGO_RATIO)} />
      </span>
    </span>
  );
}
