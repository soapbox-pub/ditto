import { EASE_EMPHASIZED } from '@/lib/motion';

/**
 * Where the image that opened the lightbox was on screen, so the lightbox
 * can grow its picture out of the tapped thumbnail instead of fading in.
 *
 * The lightbox is opened from many places (galleries, collages, profile
 * media), each with its own open state, so rather than thread the origin
 * through all of them this records the last tapped image and the lightbox
 * claims it if it opens right after.
 */

export interface LightboxOrigin {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Corner radius of the thumbnail's frame, which clips it. */
  radius: number;
}

/** The lightbox must open within this long (ms) of the tap to grow from it. */
const CLAIM_WINDOW_MS = 500;

let last: { origin: LightboxOrigin; at: number } | undefined;

/** The frame's corner radius: the image's own, or the nearest clipping ancestor's. */
function frameRadius(el: Element): number {
  let node: Element | null = el;
  for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
    const radius = parseFloat(getComputedStyle(node).borderTopLeftRadius);
    if (radius > 0) return radius;
  }
  return 0;
}

function onClickCapture(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target : null;
  const img = target?.closest('img') ?? target?.closest('button, a')?.querySelector('img');
  if (!img) {
    last = undefined;
    return;
  }
  const rect = img.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  last = {
    origin: { left: rect.left, top: rect.top, width: rect.width, height: rect.height, radius: frameRadius(img) },
    at: performance.now(),
  };
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', onClickCapture, true);
}

/** The image tapped just now, if any. Each tap can be claimed once. */
export function takeLightboxOrigin(): LightboxOrigin | undefined {
  const claimed = last && performance.now() - last.at <= CLAIM_WINDOW_MS ? last.origin : undefined;
  last = undefined;
  return claimed;
}

/**
 * Grow `img` (laid out at its final place) out of `origin`: scaled to cover
 * the thumbnail, clipped to its frame, then expanding to full size.
 */
export function growFromOrigin(img: HTMLElement, origin: LightboxOrigin): void {
  // The picture is the thumbnail lifting off the page, so it's opaque from the
  // first frame: skip any fade-in. Set before measuring, which starts transitions.
  img.style.transition = 'none';
  const final = img.getBoundingClientRect();
  if (final.width === 0 || final.height === 0) {
    img.style.transition = '';
    return;
  }
  const scale = Math.max(origin.width / final.width, origin.height / final.height);
  const dx = origin.left + origin.width / 2 - (final.left + final.width / 2);
  const dy = origin.top + origin.height / 2 - (final.top + final.height / 2);
  // Insets in the image's own (unscaled) pixels that crop it to the thumbnail.
  const insetX = Math.max(0, (final.width - origin.width / scale) / 2);
  const insetY = Math.max(0, (final.height - origin.height / scale) / 2);
  const radius = origin.radius / scale;
  const animation = img.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, clipPath: `inset(${insetY}px ${insetX}px round ${radius}px)` },
      { transform: 'none', clipPath: 'inset(0px 0px round 0px)' },
    ],
    { duration: 320, easing: EASE_EMPHASIZED },
  );
  const restore = () => { img.style.transition = ''; };
  animation.finished.then(restore, restore);
}
