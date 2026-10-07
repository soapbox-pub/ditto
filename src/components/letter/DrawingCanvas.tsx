/**
 * DrawingCanvas
 *
 * Freehand SVG drawing tool for creating hand-drawn stickers.
 * Produces a tightly-cropped, point-simplified SVG string on confirm.
 */

import { useRef, useState, useCallback } from 'react';
import { Undo2, Check, X, Eraser } from 'lucide-react';
import { type Stroke, pointsToPath, strokesToSvg } from '@/lib/svgDrawing';

const CANVAS_SIZE = 300;

const COLORS = [
  '#1a1a1a', '#e53e3e', '#dd6b20', '#d69e2e',
  '#38a169', '#3182ce', '#805ad5', '#d53f8c', '#f7f7f7',
];

const BRUSH_SIZES = [
  { value: 3, label: 'S' },
  { value: 6, label: 'M' },
  { value: 10, label: 'L' },
  { value: 16, label: 'XL' },
];

function pointerToSvg(e: React.PointerEvent<SVGSVGElement>, svg: SVGSVGElement): [number, number] {
  const rect = svg.getBoundingClientRect();
  return [
    ((e.clientX - rect.left) / rect.width) * CANVAS_SIZE,
    ((e.clientY - rect.top) / rect.height) * CANVAS_SIZE,
  ];
}

interface DrawingCanvasProps {
  onConfirm: (svg: string) => void;
  onCancel: () => void;
}

export function DrawingCanvas({ onConfirm, onCancel }: DrawingCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [activeStroke, setActiveStroke] = useState<Stroke | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [brushSize, setBrushSize] = useState(BRUSH_SIZES[1].value);

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setActiveStroke({ points: [pointerToSvg(e, svgRef.current)], color, width: brushSize });
  }, [color, brushSize]);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!activeStroke || !svgRef.current) return;
    e.preventDefault();
    const pt = pointerToSvg(e, svgRef.current);
    setActiveStroke((prev) => prev ? { ...prev, points: [...prev.points, pt] } : prev);
  }, [activeStroke]);

  const handlePointerUp = useCallback(() => {
    if (!activeStroke) return;
    setStrokes((prev) => [...prev, activeStroke]);
    setActiveStroke(null);
  }, [activeStroke]);

  const handleConfirm = useCallback(() => {
    const svg = strokesToSvg(strokes);
    if (svg) onConfirm(svg);
  }, [strokes, onConfirm]);

  const allStrokes = activeStroke ? [...strokes, activeStroke] : strokes;
  const hasStrokes = strokes.length > 0;

  const actionBtn = 'p-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed';

  return (
    <div className="flex flex-col gap-3">
      <div className="relative mx-auto w-full max-w-[300px]">
        <div className="relative rounded-2xl overflow-hidden border-2 border-dashed border-border bg-white" style={{ aspectRatio: '1' }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
            className="absolute inset-0 w-full h-full cursor-crosshair"
            style={{ touchAction: 'none' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <defs>
              <pattern id="drawing-grid" width="30" height="30" patternUnits="userSpaceOnUse">
                <circle cx="15" cy="15" r="0.5" fill="#d4d4d4" />
              </pattern>
            </defs>
            <rect width={CANVAS_SIZE} height={CANVAS_SIZE} fill="url(#drawing-grid)" />
            {allStrokes.map((s, i) => (
              <path
                key={i}
                d={pointsToPath(s.points)}
                fill="none"
                stroke={s.color}
                strokeWidth={s.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={s === activeStroke ? 0.8 : 1}
              />
            ))}
          </svg>
        </div>
      </div>

      {/* Colors */}
      <div className="flex items-center justify-center gap-1.5">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={`w-7 h-7 rounded-full transition-all border-2 ${color === c ? 'border-primary scale-110 shadow-md' : 'border-transparent hover:scale-105'}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      {/* Brush sizes */}
      <div className="flex items-center justify-center gap-2">
        {BRUSH_SIZES.map((b) => (
          <button
            key={b.value}
            type="button"
            onClick={() => setBrushSize(b.value)}
            className={`flex items-center justify-center rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${brushSize === b.value ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
          >
            <span className="rounded-full inline-block mr-1.5" style={{ width: Math.max(4, b.value), height: Math.max(4, b.value), backgroundColor: brushSize === b.value ? 'currentColor' : color }} />
            {b.label}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-center gap-2">
        <button type="button" onClick={onCancel} className={actionBtn} title="Cancel">
          <X className="w-5 h-5" strokeWidth={2.5} />
        </button>
        <button type="button" onClick={() => { setStrokes([]); setActiveStroke(null); }} disabled={!hasStrokes} className={actionBtn} title="Clear all">
          <Eraser className="w-5 h-5" strokeWidth={2.5} />
        </button>
        <button type="button" onClick={() => setStrokes((p) => p.slice(0, -1))} disabled={!hasStrokes} className={actionBtn} title="Undo">
          <Undo2 className="w-5 h-5" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!hasStrokes}
          className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          <Check className="w-4 h-4" strokeWidth={3} />
          done
        </button>
      </div>
    </div>
  );
}
