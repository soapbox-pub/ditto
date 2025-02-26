export interface Point {
  x: number;
  y: number;
}

export interface Dimensions {
  w: number;
  h: number;
}

type Rectangle = Point & Dimensions;

/** Check if the two rectangles intersect by at least `threshold` percent. */
export function areIntersecting(rect1: Rectangle, rect2: Rectangle, threshold = 0.5): boolean {
  const r1cx = rect1.x + rect1.w / 2;
  const r2cx = rect2.x + rect2.w / 2;

  const r1cy = rect1.y + rect1.h / 2;
  const r2cy = rect2.y + rect2.h / 2;

  const dist = Math.sqrt((r2cx - r1cx) ** 2 + (r2cy - r1cy) ** 2);

  const e1 = Math.sqrt(rect1.h ** 2 + rect1.w ** 2) / 2;
  const e2 = Math.sqrt(rect2.h ** 2 + rect2.w ** 2) / 2;

  return dist <= (e1 + e2) * threshold;
}
