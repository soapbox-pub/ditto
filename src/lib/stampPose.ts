/**
 * Pose of a seal being stamped at eased progress `p` (0 = held `drop` px above,
 * 1 = pressed down): it falls, squashes on impact while the melted wax spreads,
 * and settles. Run backwards it lifts back off.
 */
export function stampPose(p: number, drop: number) {
  const impact = Math.max(0, (p - 0.75) / 0.25);
  return {
    impact,
    y: (1 - p) * -drop,
    scaleX: impact === 0 ? 1 : impact < 0.4 ? 1 + impact / 0.4 * 0.08 : 1.08 - (impact - 0.4) / 0.6 * 0.08,
    scaleY: impact === 0 ? 1 : impact < 0.4 ? 1 - impact / 0.4 * 0.06 : 0.94 + (impact - 0.4) / 0.6 * 0.06,
    splat: impact === 0 ? 0 : impact < 0.3 ? impact / 0.3 : 1,
    shadow: { y: (1 - p) * 30 + 2, blur: (1 - p) * 24 + 4 },
  };
}
