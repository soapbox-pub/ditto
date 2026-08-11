/**
 * Shared-element travel: how far, how long, and on what curve.
 *
 * Two features move one object between two places on screen — the first-arrival
 * card flying into its persistent surface, and the reward ceremony carrying the
 * sealed reward to the middle of the stage and back. They are unrelated
 * lifecycles and must stay that way, but they are the *same movement*, and the
 * numbers below were tuned by eye against the rest of the app.
 *
 * They live here rather than in either feature because the second consumer would
 * otherwise import the first one's hook for two pure functions, which reads as a
 * dependency the ceremony does not have. Restating them instead would let the two
 * drift, which is worse.
 *
 * Deliberately **not** a transition framework. Two functions and their constants;
 * each caller owns its own measurement, its own frames, and its own fallbacks.
 */

/**
 * How long the card takes to fly, derived from how far it actually has to go.
 *
 * A fixed duration made the short mobile hop (~220px into the Home teaser) feel
 * sluggish at the same speed that suited the long desktop diagonal (~570px into
 * the sidebar). Derived from the measured distance rather than the viewport
 * width, so it is right for whatever geometry the page happens to have.
 */
export const TRAVEL_MIN_MS = 620;
const TRAVEL_MAX_MS = 900;
const TRAVEL_MS_PER_PX = 0.35;

export function travelDurationFor(distance: number): number {
  return Math.round(
    Math.min(TRAVEL_MAX_MS, Math.max(TRAVEL_MIN_MS, 520 + distance * TRAVEL_MS_PER_PX)),
  );
}

/**
 * The travel curve, as a CSS-style cubic bezier.
 *
 * Two earlier attempts, both wrong in opposite directions. An expo ease-out
 * covered most of the distance in the first third, so the card appeared to snap
 * into place and then wait. A symmetric `easeInOutCubic` fixed that but read as
 * mechanical — the card was being dragged at a constant, even pace rather than
 * finding its place.
 *
 * This one accelerates gently, then decelerates over a long tail: the card
 * leaves the centre without a jolt and eases into its destination. No
 * overshoot — a bounce here would look like the card missing and correcting,
 * which is the opposite of "these are the same object".
 */
const TRAVEL_CURVE = [0.34, 0.02, 0.15, 1] as const;

/**
 * Evaluate a cubic bezier easing at `t`.
 *
 * Newton–Raphson to invert x(t), falling back to bisection if the derivative is
 * too flat to converge — the standard approach, and the reason this is written
 * out rather than approximated with a polynomial: expressing the curve in the
 * same terms as CSS makes it tunable by eye against the rest of the app.
 */
function cubicBezier(x1: number, y1: number, x2: number, y2: number, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  const curve = (a: number, b: number, u: number) => {
    const c = 3 * a;
    const bb = 3 * (b - a) - c;
    const aa = 1 - c - bb;
    return ((aa * u + bb) * u + c) * u;
  };
  const slope = (a: number, b: number, u: number) => {
    const c = 3 * a;
    const bb = 3 * (b - a) - c;
    const aa = 1 - c - bb;
    return (3 * aa * u + 2 * bb) * u + c;
  };

  let u = t;
  for (let i = 0; i < 6; i++) {
    const dx = curve(x1, x2, u) - t;
    if (Math.abs(dx) < 1e-5) return curve(y1, y2, u);
    const d = slope(x1, x2, u);
    if (Math.abs(d) < 1e-6) break;
    u -= dx / d;
  }

  let lo = 0;
  let hi = 1;
  u = t;
  while (lo < hi) {
    const x = curve(x1, x2, u);
    if (Math.abs(x - t) < 1e-5) break;
    if (x < t) lo = u;
    else hi = u;
    u = (hi - lo) / 2 + lo;
    if (hi - lo < 1e-6) break;
  }
  return curve(y1, y2, u);
}

/** The travel easing. Exported so the timing can be asserted in tests. */
export function easeTravel(t: number): number {
  return cubicBezier(TRAVEL_CURVE[0], TRAVEL_CURVE[1], TRAVEL_CURVE[2], TRAVEL_CURVE[3], t);
}
