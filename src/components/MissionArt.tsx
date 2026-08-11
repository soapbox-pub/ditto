import { useState } from 'react';
import { Lock } from 'lucide-react';

import { DittoLogo } from '@/components/DittoLogo';
import { DITTO_EXPLORER_BADGE_IMAGE } from '@/lib/badgeClaim';
import { prefersReducedMotion } from '@/lib/reducedMotion';
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
 *  - {@link ExplorerRewardArt} — the reward itself, in whichever of its two
 *    states it is in: sealed (cropped and blurred past recognition behind a
 *    Ditto seal) or revealed (the badge, untreated). One component and one
 *    `<img>`, because the reveal has to be the *same object* becoming visible.
 *
 * ### When the badge may be shown
 *
 * One rule, and the structural tests pin it:
 *
 *  - **Before `revealedAt`** — the artwork may only appear inside the sealed
 *    treatment: cropped, blurred, desaturated, behind the mark and the padlock.
 *    A sharp badge anywhere before the reveal is a spoiler and a bug.
 *  - **From `revealedAt` onwards** — the badge is the reward, shown plainly, in
 *    the ceremony and on `/missions`, forever.
 *
 * `revealedAt` is persisted, so which of those applies survives reload, remount,
 * a skipped animation, and a ceremony closed halfway through.
 *
 * This is spoiler prevention, not secrecy. The badge definition is a public
 * kind 30009 event and the image URL is in the DOM; anyone who wants to look can
 * look. The point is that nobody sees it *by accident*, on the way to earning it.
 */

/**
 * The Ditto Explorer journey's own mark.
 *
 * Ditto's real planet, with a path around it and a traveller on the way.
 *
 * The previous version hand-drew an ellipse and two circles as an *approximation*
 * of the ringed planet, deliberately kept unlike the logo. That caution was
 * aimed at the wrong thing: what must not be shown early is the **reward**, and
 * the app's own mark is not the reward. Meanwhile the approximation had all the
 * usual costs of a lookalike — it drifted from the real proportions, and it
 * meant the journey's identity was a drawing of Ditto rather than Ditto.
 *
 * So it now uses `logo.svg`, the same asset `DittoLogo` renders, as a mask
 * filled with the theme's primary colour. That keeps it crisp at every size,
 * correct in both themes, and identical to the mark everywhere else in the app.
 * Masked rather than composed with `DittoLogo` itself so this stays a pure
 * presentational span: `DittoLogo` reads the current user and app config, and
 * this renders in surfaces (and tests) that have neither.
 *
 * It still says *a journey*, not *a prize*: the orbit and the traveller are the
 * mark's own, and nothing here borrows the badge's artwork or its silhouette.
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
      {/* The path travelled, behind the planet. */}
      <svg viewBox="0 0 48 48" fill="none" className="absolute size-[86%] text-primary">
        <ellipse
          cx="24"
          cy="24"
          rx="20"
          ry="8.5"
          stroke="currentColor"
          strokeOpacity="0.38"
          strokeWidth="1.75"
          strokeDasharray="2.5 3.5"
          strokeLinecap="round"
          transform="rotate(-24 24 24)"
        />
        {/* The traveller, out on the orbit. */}
        <circle cx="41.5" cy="15.5" r="2.5" fill="currentColor" />
      </svg>

      {/* Ditto itself. */}
      <span
        data-explorer-journey-planet=""
        className="relative block size-[52%] bg-primary"
        style={{
          maskImage: 'url(/logo.svg)',
          maskSize: 'contain',
          maskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskImage: 'url(/logo.svg)',
          WebkitMaskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
        }}
      />
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
 * The reveal's own timing, on the artwork itself.
 *
 * Long enough to read as an object being uncovered rather than a state flipping,
 * short enough that nobody is waiting. The easing decelerates hard at the end so
 * the badge arrives and stays rather than drifting into place.
 */
const REVEAL_MS = 900;
const REVEAL_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** How long the seal itself takes to get out of the way, and when the mark goes. */
const SEAL_EXIT_MS = 320;
const SEAL_LOGO_DELAY_MS = 80;

/**
 * The sealed edge fade, and its absence.
 *
 * Sealed, the artwork dissolves before the frame's edge so the crop never reads
 * as a rectangular photograph sitting underneath. Revealed, the mask opens to
 * the whole frame: a vignetted badge would look like it was still behind
 * something. Both are `radial-gradient`s of the same shape so the transition
 * between them is continuous.
 */
const SEALED_MASK = 'radial-gradient(circle at 50% 46%, black 48%, transparent 92%)';
const REVEALED_MASK = 'radial-gradient(circle at 50% 50%, black 100%, transparent 100%)';

/**
 * The Ditto Explorer reward, sealed or revealed — one object, two states.
 *
 * **One component and one `<img>` on purpose.** The reveal has to feel like the
 * thing that was hidden becoming visible, not like a blurred picture being
 * swapped for a sharp one. So the badge artwork is mounted once and the seal is
 * *removed from it*: the crop pulls back, the blur clears, the colour returns,
 * the Ditto wash fades, and the mark and padlock in front of it get out of the
 * way. Two components crossfading would have been easier and would have thrown
 * away the only idea the ceremony has.
 *
 * ### Sealed
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
 *     purple, so without it the mark disappears into its own background.
 *  5. **Lock** — a chip on the plate's edge. Never colour alone: there is a
 *     padlock glyph here, and the word "Locked" beside it in `MissionReward`.
 *
 * ### Revealed
 *
 * Everything the seal added is gone: no crop, no blur, no desaturation, no wash,
 * no plate, no mark, no padlock. What is left is the badge, at its own scale and
 * its own colours, which is the whole point of the journey.
 *
 * `revealed` is driven by persisted state (`badgeClaim.revealedAt`), never by a
 * local flag, so a reload lands on the revealed object without replaying
 * anything. `instant` skips the transition for the cases where animating would
 * be wrong: a skipped reveal, and a mount that is already revealed.
 *
 * Decorative throughout: `aria-hidden` on the root, `alt=""` on the image. The
 * reward's state is carried by real text beside it, so none of it depends on
 * this rendering, on filters being supported, or on the image arriving at all.
 */
export function ExplorerRewardArt({
  size = 112,
  ready = false,
  revealed = false,
  instant = false,
  className,
}: {
  /**
   * Rendered edge length in px. A number rather than a size class because the
   * blur is derived from it — see {@link SEALED_BLUR_RATIO}.
   */
  size?: number;
  /** The journey is finished and the reward can be claimed. Still sealed. */
  ready?: boolean;
  /** The reveal has crossed its irreversible point. Show the badge. */
  revealed?: boolean;
  /** Apply the revealed treatment with no transition. */
  instant?: boolean;
  className?: string;
}) {
  // Local and deliberately not persisted: a failed image is a fact about this
  // page load, not about the user. A remount is free to try again.
  const [imageFailed, setImageFailed] = useState(false);
  const reduced = prefersReducedMotion();

  /**
   * How the seal comes off, and why there are two ways.
   *
   * **Full motion** animates `filter` and `transform` on the badge itself, so
   * the crop pulls back and the blur clears as one movement on the object the
   * user has been watching. Measured at 4× CPU throttle on a 390px viewport:
   * median 16.7ms per frame, nothing over 32ms. It is smooth, so it is what
   * ships.
   *
   * **Reduced motion** must not do that: a 3× scale collapsing to 1 is exactly
   * the kind of movement the setting exists to remove, and an animating blur
   * radius is uncomfortable in its own right. So the badge simply *is* revealed,
   * with no transition, and a copy of the sealed treatment dissolves off the top
   * of it. Same before, same after, no motion in between.
   */
  const crossfade = reduced && revealed && !instant;

  const revealTransition = instant || reduced
    ? undefined
    : `filter ${REVEAL_MS}ms ${REVEAL_EASING}, transform ${REVEAL_MS}ms ${REVEAL_EASING}, ` +
      `-webkit-mask-image ${REVEAL_MS}ms linear, mask-image ${REVEAL_MS}ms linear`;

  const sealFade = instant ? undefined : `opacity ${SEAL_EXIT_MS}ms ease-out, transform ${SEAL_EXIT_MS}ms ease-out`;

  /** The sealed treatment, as inline style. Shared by the badge and its ghost. */
  const sealedImageStyle = {
    objectPosition: SEALED_CROP_POSITION,
    ['--sealed-crop-scale' as string]: String(SEALED_CROP_SCALE),
    transform: `scale(${SEALED_CROP_SCALE})`,
    filter: `blur(${(size * SEALED_BLUR_RATIO).toFixed(1)}px) saturate(0.55) contrast(0.88)`,
    maskImage: SEALED_MASK,
    WebkitMaskImage: SEALED_MASK,
  };

  return (
    <span
      aria-hidden
      data-explorer-reward-art=""
      {...(revealed ? { 'data-revealed-reward-art': '' } : { 'data-sealed-reward-art': '' })}
      style={{ width: size, height: size }}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl',
        'transition-[box-shadow,background-color] duration-500',
        // Revealed, the frame goes too. A ring around the badge would read as
        // "the badge, in a card" when the point is that the container is gone.
        revealed ? 'ring-0' : ready ? 'ring-1 ring-primary/30' : 'ring-1 ring-border',
        className,
      )}
    >
      {/* 1 — ground. Also the whole picture when the artwork never arrives. */}
      <span
        className={cn(
          'absolute inset-0 transition-opacity duration-500',
          revealed && 'opacity-0',
          ready
            ? 'bg-[radial-gradient(circle_at_50%_38%,hsl(var(--primary)/0.30),hsl(var(--primary)/0.10)_52%,transparent_76%)]'
            : 'bg-[radial-gradient(circle_at_50%_38%,hsl(var(--primary)/0.16),hsl(var(--primary)/0.05)_52%,transparent_76%)]',
        )}
      />
      <span
        className={cn(
          'absolute inset-0 transition-opacity duration-500',
          revealed ? 'opacity-0' : ready ? 'bg-primary/[0.04]' : 'bg-muted/40',
        )}
      />
      <svg
        viewBox="0 0 64 64"
        fill="none"
        className={cn(
          'absolute size-[62%] transition-opacity duration-300',
          revealed && 'opacity-0',
        )}
      >
        <polygon
          points="32,7 54,19.5 54,44.5 32,57 10,44.5 10,19.5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
          className={ready ? 'text-primary/70' : 'text-muted-foreground/40'}
        />
      </svg>

      {/* 2 — the reward. The same element throughout: sealed, then unsealed. */}
      {!imageFailed && (
        <img
          src={DITTO_EXPLORER_BADGE_IMAGE}
          alt=""
          aria-hidden
          {...(revealed
            ? { 'data-explorer-badge-image': '' }
            : { 'data-sealed-reward-image': '' })}
          onError={() => setImageFailed(true)}
          // Never `loading="lazy"`: the ground is the fallback, and an image
          // that arrives late is fine, but one deferred behind the fold makes
          // the sealed reward change appearance as the user scrolls to it.
          className={cn(
            'absolute inset-0 size-full',
            // The drift is an *animation* on transform, and an animation beats a
            // transition on the same property — so it has to go before the crop
            // can pull back. It is only there to keep a sealed object alive.
            !revealed && 'sealed-reward-image',
            revealed ? 'object-contain' : 'object-cover',
          )}
          style={{
            objectPosition: revealed ? 'center' : SEALED_CROP_POSITION,
            // Both the resting transform and the ambient drift's keyframes read
            // this, so the two cannot disagree about where the crop sits.
            ['--sealed-crop-scale' as string]: String(SEALED_CROP_SCALE),
            transform: `scale(${revealed ? 1 : SEALED_CROP_SCALE})`,
            filter: revealed
              ? 'blur(0px) saturate(1) contrast(1)'
              : `blur(${(size * SEALED_BLUR_RATIO).toFixed(1)}px) saturate(0.55) contrast(0.88)`,
            // Fades to nothing before the frame's edge while sealed, so the crop
            // never resolves into a rectangle with corners. Opens out to the
            // full frame on reveal so the badge is not vignetted.
            maskImage: revealed ? REVEALED_MASK : SEALED_MASK,
            WebkitMaskImage: revealed ? REVEALED_MASK : SEALED_MASK,
            transition: revealTransition,
          }}
        />
      )}

      {/* Reduced motion's crossfade: the seal, dissolving off the badge that is
          already revealed underneath. Opacity only, and mounted only for the
          moment it takes to go. */}
      {crossfade && !imageFailed && (
        <img
          src={DITTO_EXPLORER_BADGE_IMAGE}
          alt=""
          aria-hidden
          data-sealed-reward-ghost=""
          className="reward-seal-dissolve pointer-events-none absolute inset-0 size-full object-cover"
          style={sealedImageStyle}
        />
      )}

      {/* 3 — tone what survives toward Ditto. Subtle on purpose: heavier and the
          reward stops being an object and becomes a purple gradient. */}
      <span
        className={cn(
          'absolute inset-0 bg-primary/[0.14] transition-opacity duration-700',
          revealed && 'opacity-0',
        )}
      />

      {/* 4 — the seal. It does not slide off in a direction: a direction would
          imply somewhere it went. It gets out of the way. */}
      <span
        className={cn(
          'relative flex items-center justify-center rounded-full shadow-sm ring-1',
          'bg-background/95',
          ready ? 'ring-primary/25' : 'ring-border/70',
          revealed && 'pointer-events-none opacity-0',
        )}
        style={{
          width: size * SEAL_PLATE_RATIO,
          height: size * SEAL_PLATE_RATIO,
          transform: revealed ? 'scale(1.35)' : 'scale(1)',
          transition: sealFade,
          transitionDelay: instant || !revealed ? undefined : `${SEAL_LOGO_DELAY_MS}ms`,
        }}
      >
        <DittoLogo size={Math.round(size * SEAL_LOGO_RATIO)} />
      </span>

      {/* 5 — still locked, and said with a glyph rather than a colour. */}
      <span
        className={cn(
          'absolute flex items-center justify-center rounded-full ring-1',
          'bg-background text-muted-foreground',
          ready ? 'ring-primary/30' : 'ring-border',
          revealed && 'pointer-events-none opacity-0',
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
          transform: revealed ? 'scale(0.6)' : 'scale(1)',
          transition: sealFade,
        }}
      >
        <Lock className="size-[52%] min-h-3 min-w-3" aria-hidden />
      </span>
    </span>
  );
}
