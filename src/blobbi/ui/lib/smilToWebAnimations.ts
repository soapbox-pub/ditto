/**
 * Replace a Blobbi SVG's SMIL animations with equivalent Web Animations.
 *
 * SMIL rewrites attributes every tick and invalidates layout; the same motion
 * on CSS properties only restyles and repaints. Anything without an exact
 * equivalent stays SMIL, including everything inside `<defs>`/`<clipPath>`/
 * `<mask>` (useBlobbiEyes leaves SMIL-driven clip rects alone).
 */

/** Attribute → CSS property, for `<animate>` on the given elements. */
const ANIMATABLE: Record<string, { property: string; elements?: string[]; unit: 'px' | 'number' | 'path' | 'raw' }> = {
  opacity: { property: 'opacity', unit: 'number' },
  'fill-opacity': { property: 'fillOpacity', unit: 'number' },
  'stroke-opacity': { property: 'strokeOpacity', unit: 'number' },
  'stop-opacity': { property: 'stopOpacity', elements: ['stop'], unit: 'number' },
  'stroke-width': { property: 'strokeWidth', unit: 'px' },
  fill: { property: 'fill', unit: 'raw' },
  stroke: { property: 'stroke', unit: 'raw' },
  cx: { property: 'cx', elements: ['circle', 'ellipse'], unit: 'px' },
  cy: { property: 'cy', elements: ['circle', 'ellipse'], unit: 'px' },
  r: { property: 'r', elements: ['circle'], unit: 'px' },
  rx: { property: 'rx', elements: ['ellipse', 'rect'], unit: 'px' },
  ry: { property: 'ry', elements: ['ellipse', 'rect'], unit: 'px' },
  x: { property: 'x', elements: ['rect', 'image'], unit: 'px' },
  y: { property: 'y', elements: ['rect', 'image'], unit: 'px' },
  width: { property: 'width', elements: ['rect', 'image'], unit: 'px' },
  height: { property: 'height', elements: ['rect', 'image'], unit: 'px' },
  d: { property: 'd', elements: ['path'], unit: 'path' },
};

const SKIP_ANCESTORS = 'defs, clipPath, mask, pattern, marker, symbol';

/** `"1.5s"`, `"200ms"`, `"2"` → ms; anything else (events, syncbases, lists) → null. */
function parseClock(value: string | null, fallback: number | null): number | null {
  if (value === null || value.trim() === '') return fallback;
  const m = /^\s*(-?\d*\.?\d+)\s*(ms|s|min|h)?\s*$/.exec(value);
  if (!m) return null;
  const n = parseFloat(m[1]);
  switch (m[2]) {
    case 'ms': return n;
    case 'min': return n * 60_000;
    case 'h': return n * 3_600_000;
    default: return n * 1000;
  }
}

function splitList(value: string): string[] {
  return value.split(';').map((v) => v.trim()).filter((v) => v !== '');
}

function numbers(value: string): number[] {
  return value.trim().split(/[\s,]+/).filter(Boolean).map(Number);
}

/** One SMIL `transform` value as a CSS transform with the same meaning. */
function cssTransform(type: string, value: string): string | null {
  const n = numbers(value);
  if (n.length === 0 || n.some((v) => !Number.isFinite(v))) return null;
  switch (type) {
    case 'translate':
      return `translate(${n[0]}px, ${n[1] ?? 0}px)`;
    case 'scale':
      return `scale(${n[0]}, ${n[1] ?? n[0]})`;
    case 'rotate': {
      // rotate(a cx cy) = translate(c) rotate(a) translate(-c).
      const [a, cx = 0, cy = 0] = n;
      return `translate(${cx}px, ${cy}px) rotate(${a}deg) translate(${-cx}px, ${-cy}px)`;
    }
    case 'skewX':
      return `skewX(${n[0]}deg)`;
    case 'skewY':
      return `skewY(${n[0]}deg)`;
    default:
      return null;
  }
}

function cssValue(unit: 'px' | 'number' | 'path' | 'raw', value: string): string | number | null {
  switch (unit) {
    case 'px': {
      const v = Number(value);
      return Number.isFinite(v) ? `${v}px` : null;
    }
    case 'number': {
      const v = Number(value);
      return Number.isFinite(v) ? v : null;
    }
    case 'path':
      return /["\\]/.test(value) ? null : `path("${value.replace(/\s+/g, ' ').trim()}")`;
    case 'raw':
      return value;
  }
}

/**
 * Whether a stylesheet animates or transitions `el` — the Web Animations this
 * converter creates (one per SMIL element, so possibly several on one target)
 * don't count.
 */
function hasCssAnimation(el: Element): boolean {
  return el.getAnimations().some((a) => a instanceof CSSAnimation || a instanceof CSSTransition);
}

interface Converted {
  smil: Element;
  parent: Node;
  next: Node | null;
  animation: Animation;
}

/**
 * Convert what can be converted under `svg`. Returns an undo that cancels the
 * Web Animations and puts the SMIL elements back.
 */
export function smilToWebAnimations(svg: SVGSVGElement): () => void {
  if (typeof Element.prototype.animate !== 'function' || typeof svg.getCurrentTime !== 'function') {
    return () => {};
  }
  const converted: Converted[] = [];
  // The SVG clock's zero on the document timeline; `begin` is relative to it.
  const timelineNow = document.timeline.currentTime;
  if (typeof timelineNow !== 'number') return () => {};
  const origin = timelineNow - svg.getCurrentTime() * 1000;

  for (const smil of svg.querySelectorAll('animate, animateTransform, animateMotion')) {
    const target = smil.parentElement;
    if (!(target instanceof SVGElement) || target.closest(SKIP_ANCESTORS)) continue;
    if (smil.hasAttribute('href') || smil.hasAttribute('xlink:href')) continue;
    if (smil.hasAttribute('by') || smil.getAttribute('additive') === 'sum' || smil.getAttribute('accumulate') === 'sum') continue;
    if (smil.hasAttribute('min') || smil.hasAttribute('max') || smil.hasAttribute('end') || smil.hasAttribute('repeatDur')) continue;

    const duration = parseClock(smil.getAttribute('dur'), null);
    const delay = parseClock(smil.getAttribute('begin'), 0);
    if (duration === null || duration <= 0 || delay === null) continue;
    const repeat = smil.getAttribute('repeatCount');
    const iterations = repeat === null ? 1 : repeat === 'indefinite' ? Infinity : Number(repeat);
    if (!Number.isFinite(iterations) && iterations !== Infinity) continue;
    const fill: FillMode = smil.getAttribute('fill') === 'freeze' ? 'forwards' : 'none';

    const tag = smil.tagName;
    const isMotion = tag === 'animateMotion';
    const calcMode = smil.getAttribute('calcMode') ?? (isMotion ? 'paced' : 'linear');

    let frames: Keyframe[];
    if (isMotion) {
      // Paced motion along a path: constant speed, i.e. offset-distance 0→100%.
      const path = smil.getAttribute('path');
      if (!path || calcMode !== 'paced' || smil.hasAttribute('keyPoints') || smil.querySelector('mpath') || /["\\]/.test(path)) continue;
      const rotate = smil.getAttribute('rotate');
      const offsetRotate = rotate === 'auto' ? 'auto' : rotate === 'auto-reverse' ? 'reverse' : `${Number(rotate ?? 0)}deg`;
      if (offsetRotate.startsWith('NaN')) continue;
      const style = getComputedStyle(target);
      if (style.transformBox !== 'view-box' || hasCssAnimation(target)) continue;
      // In the keyframes so it only applies once `begin` is reached.
      const motion = {
        offsetPath: `path("${path.replace(/\s+/g, ' ').trim()}")`,
        offsetRotate,
        offsetAnchor: '0px 0px',
      };
      frames = [{ ...motion, offsetDistance: '0%' }, { ...motion, offsetDistance: '100%' }];
    } else {
      const attr = smil.getAttribute('attributeName');
      if (!attr) continue;
      const rawValues = smil.hasAttribute('values')
        ? splitList(smil.getAttribute('values')!)
        : smil.hasAttribute('from') && smil.hasAttribute('to')
          ? [smil.getAttribute('from')!, smil.getAttribute('to')!]
          : null;
      if (!rawValues || rawValues.length < 2) continue;

      let property: string;
      let values: (string | number | null)[];
      if (tag === 'animateTransform') {
        if (attr !== 'transform') continue;
        const style = getComputedStyle(target);
        if (style.transformBox !== 'view-box' || style.transformOrigin !== '0px 0px' || hasCssAnimation(target)) continue;
        const type = smil.getAttribute('type') ?? 'translate';
        property = 'transform';
        values = rawValues.map((v) => cssTransform(type, v));
      } else {
        const spec = ANIMATABLE[attr];
        if (!spec || (spec.elements && !spec.elements.includes(target.tagName))) continue;
        if (hasCssAnimation(target)) continue;
        property = spec.property;
        values = rawValues.map((v) => cssValue(spec.unit, v));
      }
      if (values.some((v) => v === null)) continue;

      const keyTimes = smil.getAttribute('keyTimes');
      const offsets = keyTimes ? numbers(keyTimes.replace(/;/g, ' ')) : values.map((_, i) => i / (values.length - 1));
      if (offsets.length !== values.length) continue;

      let easings: string[];
      if (calcMode === 'linear') {
        easings = values.map(() => 'linear');
      } else if (calcMode === 'discrete') {
        easings = values.map(() => 'steps(1, end)');
      } else if (calcMode === 'spline') {
        const splines = (smil.getAttribute('keySplines') ?? '').split(';').map((s) => numbers(s)).filter((s) => s.length === 4);
        if (splines.length !== values.length - 1) continue;
        easings = [...splines.map((s) => `cubic-bezier(${s.join(', ')})`), 'linear'];
      } else {
        continue; // paced on a non-motion value: no exact equivalent
      }
      frames = values.map((v, i) => ({ [property]: v as string | number, offset: offsets[i], easing: easings[i] }));
    }

    let animation: Animation;
    try {
      animation = target.animate(frames, { duration, delay, iterations, fill });
    } catch {
      continue;
    }
    animation.startTime = origin;
    const parent = smil.parentNode!;
    const next = smil.nextSibling;
    smil.remove();
    converted.push({ smil, parent, next, animation });
  }

  return () => {
    for (const { smil, parent, next, animation } of converted.reverse()) {
      animation.cancel();
      parent.insertBefore(smil, next);
    }
  };
}
