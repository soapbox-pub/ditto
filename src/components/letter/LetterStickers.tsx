/**
 * LetterStickers
 *
 * Renders stickers positioned on top of a letter card. Two modes:
 *
 *   editable=true  — tap a sticker to select it, revealing controls
 *   editable=false — stickers are rendered at their saved positions (read-only).
 */

import { useRef, useCallback, useState, useEffect } from 'react';
import { X, RotateCw, Maximize2 } from 'lucide-react';
import type { LetterSticker } from '@/lib/letterTypes';
import { sanitizeSvg } from '@/lib/sanitizeSvg';

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const BASE_SIZE_CQW = 14; // cqw — base sticker size at scale=1, scales with card width
/** Inward buffer (%) so sticker centers can't reach the very edge of the card. */
const EDGE_BUFFER = 5;

function isSafeUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

function StickerMedia({ sticker, sizeCqw, className }: { sticker: LetterSticker; sizeCqw: string; className?: string }) {
  if (sticker.svg) {
    return (
      <div
        style={{ width: sizeCqw, height: sizeCqw, maxWidth: 'none' }}
        className={`sticker-svg-wrap ${className ?? ''}`}
        dangerouslySetInnerHTML={{ __html: sanitizeSvg(sticker.svg) }}
      />
    );
  }
  if (!isSafeUrl(sticker.url)) return null;
  return (
    <img
      src={sticker.url}
      alt={sticker.shortcode}
      style={{ width: sizeCqw, height: sizeCqw, maxWidth: 'none' }}
      className={className}
      draggable={false}
    />
  );
}

function StaticSticker({ sticker }: { sticker: LetterSticker }) {
  const s = sticker.scale ?? 1;
  const sizeCqw = `${BASE_SIZE_CQW * s}cqw`;

  return (
    <div
      className="absolute pointer-events-none select-none"
      style={{
        left: `${sticker.x}%`,
        top: `${sticker.y}%`,
        transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg)`,
        zIndex: 30,
      }}
    >
      <StickerMedia sticker={sticker} sizeCqw={sizeCqw} className="object-contain drop-shadow-md" />
    </div>
  );
}

interface EditableStickerProps {
  sticker: LetterSticker;
  index: number;
  selected: boolean;
  onSelect: (index: number) => void;
  onUpdate: (index: number, patch: Partial<LetterSticker>) => void;
  onRemove: (index: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function EditableSticker({
  sticker,
  index,
  selected,
  onSelect,
  onUpdate,
  onRemove,
  containerRef,
}: EditableStickerProps) {
  const s = sticker.scale ?? 1;
  const sizeCqw = `${BASE_SIZE_CQW * s}cqw`;

  const dragging = useRef(false);
  const hasMoved = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const toPercent = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: sticker.x, y: sticker.y };
    return {
      x: Math.max(EDGE_BUFFER, Math.min(100 - EDGE_BUFFER, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.max(EDGE_BUFFER, Math.min(100 - EDGE_BUFFER, ((clientY - rect.top) / rect.height) * 100)),
    };
  }, [containerRef, sticker.x, sticker.y]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selected) {
      onSelect(index);
      return;
    }
    dragging.current = true;
    hasMoved.current = false;
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [selected, index, onSelect]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    e.preventDefault();
    hasMoved.current = true;
    const { x, y } = toPercent(e.clientX, e.clientY);
    onUpdate(index, { x, y });
  }, [index, onUpdate, toPercent]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    setIsDragging(false);
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* */ }
  }, []);

  const rotateRef = useRef<{ startAngle: number; startRotation: number } | null>(null);

  const centerOfSticker = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { cx: 0, cy: 0 };
    return {
      cx: rect.left + (sticker.x / 100) * rect.width,
      cy: rect.top + (sticker.y / 100) * rect.height,
    };
  }, [containerRef, sticker.x, sticker.y]);

  const handleRotateDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const { cx, cy } = centerOfSticker();
    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
    rotateRef.current = { startAngle, startRotation: sticker.rotation };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [centerOfSticker, sticker.rotation]);

  const handleRotateMove = useCallback((e: React.PointerEvent) => {
    if (!rotateRef.current) return;
    e.preventDefault();
    const { cx, cy } = centerOfSticker();
    const currentAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
    const delta = currentAngle - rotateRef.current.startAngle;
    let newRotation = rotateRef.current.startRotation + delta;
    while (newRotation > 180) newRotation -= 360;
    while (newRotation < -180) newRotation += 360;
    onUpdate(index, { rotation: Math.round(newRotation) });
  }, [centerOfSticker, index, onUpdate]);

  const handleRotateUp = useCallback((e: React.PointerEvent) => {
    rotateRef.current = null;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* */ }
  }, []);

  const resizeRef = useRef<{ startDist: number; startScale: number } | null>(null);

  const handleResizeDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const { cx, cy } = centerOfSticker();
    const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
    resizeRef.current = { startDist: dist, startScale: s };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [centerOfSticker, s]);

  const handleResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    e.preventDefault();
    const { cx, cy } = centerOfSticker();
    const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
    const ratio = dist / resizeRef.current.startDist;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, resizeRef.current.startScale * ratio));
    onUpdate(index, { scale: Math.round(newScale * 100) / 100 });
  }, [centerOfSticker, index, onUpdate]);

  const handleResizeUp = useCallback((e: React.PointerEvent) => {
    resizeRef.current = null;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* */ }
  }, []);

  return (
    <div
      className={`absolute select-none pointer-events-auto ${isDragging ? 'cursor-grabbing' : selected ? 'cursor-grab' : 'cursor-pointer'}`}
      style={{
        left: `${sticker.x}%`,
        top: `${sticker.y}%`,
        transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg)`,
        zIndex: selected ? 50 : 30,
        transition: isDragging ? 'none' : 'filter 0.15s ease-out',
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {selected && (
        <div
          className="absolute border-2 border-primary border-dashed rounded-lg pointer-events-none"
          style={{ inset: -8 }}
        />
      )}

      <StickerMedia sticker={sticker} sizeCqw={sizeCqw} className="object-contain drop-shadow-lg" />

      {selected && (
        <>
          <button
            type="button"
            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onRemove(index); }}
            className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md active:scale-90 transition-transform"
            style={{ transform: `rotate(${-sticker.rotation}deg)` }}
          >
            <X className="w-3.5 h-3.5" strokeWidth={3} />
          </button>

          <div
            className="absolute -bottom-3 -right-3 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md cursor-alias active:scale-90 transition-transform"
            style={{ transform: `rotate(${-sticker.rotation}deg)`, touchAction: 'none' }}
            onPointerDown={handleRotateDown}
            onPointerMove={handleRotateMove}
            onPointerUp={handleRotateUp}
          >
            <RotateCw className="w-3.5 h-3.5" strokeWidth={2.5} />
          </div>

          <div
            className="absolute -bottom-3 -left-3 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md cursor-nwse-resize active:scale-90 transition-transform"
            style={{ transform: `rotate(${-sticker.rotation}deg)`, touchAction: 'none' }}
            onPointerDown={handleResizeDown}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeUp}
          >
            <Maximize2 className="w-3.5 h-3.5" strokeWidth={2.5} />
          </div>
        </>
      )}
    </div>
  );
}

interface LetterStickersProps {
  stickers: LetterSticker[];
  editable?: boolean;
  onUpdate?: (index: number, patch: Partial<LetterSticker>) => void;
  onRemove?: (index: number) => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

export function LetterStickers({
  stickers,
  editable = false,
  onUpdate,
  onRemove,
  containerRef,
}: LetterStickersProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!editable || selectedIndex === null) return;
    const container = containerRef?.current;
    if (!container) return;

    const handleDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-sticker]')) return;
      setSelectedIndex(null);
    };

    container.addEventListener('pointerdown', handleDown);
    return () => container.removeEventListener('pointerdown', handleDown);
  }, [editable, selectedIndex, containerRef]);

  useEffect(() => {
    if (selectedIndex !== null && selectedIndex >= stickers.length) {
      setSelectedIndex(null);
    }
  }, [stickers.length, selectedIndex]);

  if (stickers.length === 0) return null;

  return (
    <>
      {stickers.map((sticker, i) =>
        editable && onUpdate && onRemove && containerRef ? (
          <div key={`${sticker.shortcode}-${i}`} data-sticker>
            <EditableSticker
              sticker={sticker}
              index={i}
              selected={selectedIndex === i}
              onSelect={setSelectedIndex}
              onUpdate={onUpdate}
              onRemove={(idx) => {
                onRemove(idx);
                setSelectedIndex(null);
              }}
              containerRef={containerRef}
            />
          </div>
        ) : (
          <StaticSticker key={`${sticker.shortcode}-${i}`} sticker={sticker} />
        ),
      )}
    </>
  );
}
