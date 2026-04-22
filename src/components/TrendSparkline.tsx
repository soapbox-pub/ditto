import { useMemo } from 'react';

const SPARK_W = 50;
const SPARK_H = 28;
const SPARK_MARGIN = 2;
const SPARK_DIVISOR = 0.25;

/** Maps an array of values to {x, y} SVG coordinates, filling the full chart area. */
function dataToPoints(data: number[]): { x: number; y: number }[] {
  const len = data.length;
  if (len === 0) return [];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const vfactor = (SPARK_H - SPARK_MARGIN * 2) / ((max - min) || 2);
  const hfactor = (SPARK_W - SPARK_MARGIN * 2) / ((len > 1 ? len - 1 : 1));
  return data.map((d, i) => ({
    x: i * hfactor + SPARK_MARGIN,
    y: (max === min ? 1 : (max - d)) * vfactor + SPARK_MARGIN,
  }));
}

/** Builds a smooth cubic-bezier SVG path string from {x,y} points. */
function pointsToCurvePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  const cmds: (string | number)[] = [];
  let prev: { x: number; y: number } | undefined;
  for (const p of points) {
    if (!prev) {
      cmds.push(p.x, p.y);
    } else {
      const len = (p.x - prev.x) * SPARK_DIVISOR;
      cmds.push('C', prev.x + len, prev.y, p.x - len, p.y, p.x, p.y);
    }
    prev = p;
  }
  return 'M' + cmds.join(' ');
}

/** Small sparkline SVG using a smooth cubic-bezier curve. */
export function TrendSparkline({ data }: { data: number[] }) {
  const d = useMemo(() => pointsToCurvePath(dataToPoints(data)), [data]);

  if (!d) return null;

  return (
    <svg width={SPARK_W} height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} className="text-primary/60">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
