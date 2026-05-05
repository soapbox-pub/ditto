/**
 * RoomFurnitureLayer — Renders resolved furniture placements in three z-layers.
 *
 * Receives a flat array of FurniturePlacement items and internally splits them
 * into back (z-[3]), floor (z-[8]), and front (z-[12]) layers. Each item is
 * rendered as an absolutely positioned <img> using percentage-based sizing.
 *
 * Coordinate model:
 * - x: horizontal center of the item (0 = left, 1 = right)
 * - y: bottom edge of the item (0 = top, 1 = bottom)
 *
 * Unknown/unresolvable furniture IDs are silently skipped.
 *
 * When `isEditing` is false (default), all layers are pointer-events-none.
 * When `isEditing` is true, individual items become tappable/draggable (the
 * layer containers remain pointer-events-none so higher-z layers don't block
 * clicks on items in lower layers). A background click div handles deselect.
 *
 * The `activeLayer` prop controls visual emphasis: items not in the active layer
 * render at reduced opacity but remain fully clickable.
 */

import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';

import type { FurniturePlacement, FurnitureLayer } from '../lib/room-furniture-schema';
import { resolveFurniture, getFurnitureAsset } from '../lib/furniture-registry';
import { useFurnitureDrag } from '../hooks/useFurnitureDrag';

// ─── Layer z-index mapping ────────────────────────────────────────────────────

const LAYER_Z: Record<FurnitureLayer, string> = {
  back: 'z-[3]',
  floor: 'z-[8]',
  front: 'z-[12]',
};

// ─── Ground shadow config per item ───────────────────────────────────────────
// Explicit ID-based rules. Can later move to FurnitureDefinition metadata.

interface ShadowConfig { widthPct: string; heightPct: string; alpha: number }

/** IDs that should never cast a ground shadow (wall-mounted, flat/rug). */
const NO_SHADOW_IDS = new Set([
  'official:picture-frame',
  'official:picture-frame-gold',
  'official:picture-frame-square',
  'official:picture-frame-oval',
  'official:shelf-wall',
  'official:clock-wall',
  'official:rug-round',
]);

/** IDs with wide ground shadows (tables, beds, sofas). */
const WIDE_SHADOW_IDS = new Set([
  'official:table-side',
  'official:bed-single',
]);

function getFurnitureShadowConfig(id: string): ShadowConfig | null {
  if (NO_SHADOW_IDS.has(id)) return null;
  if (WIDE_SHADOW_IDS.has(id)) return { widthPct: '105%', heightPct: '13%', alpha: 0.30 };
  // Narrow floor items (plants, lamps, chairs)
  return { widthPct: '95%', heightPct: '14%', alpha: 0.26 };
}

const DRAG_ALPHA_BOOST = 0.10;

// ─── Frame overlay helper ─────────────────────────────────────────────────────

/** Derive the transparent-center overlay asset path from a frame's base asset. */
function getFrameOverlayAsset(baseAsset: string): string {
  return baseAsset.replace('.svg', '-overlay.svg');
}

// ─── Component ────────────────────────────────────────────────────────────────

interface RoomFurnitureLayerProps {
  placements: FurniturePlacement[] | undefined;
  /** When true, items become interactive (tappable/draggable). */
  isEditing?: boolean;
  /** Index of the currently selected item in the placements array. */
  selectedIndex?: number | null;
  /** Called when an item is tapped in editing mode. */
  onSelectItem?: (index: number) => void;
  /** Called when a selected item is dragged to a new position. */
  onMoveItem?: (index: number, x: number, y: number) => void;
  /** Ref to the room shell container — needed for drag coordinate normalization. */
  containerRef?: React.RefObject<HTMLDivElement | null>;
  /** Active layer for visual emphasis. Items not in this layer are dimmed. */
  activeLayer?: FurnitureLayer;
  /** Called when empty room space is clicked in editing mode (deselect). */
  onBackgroundClick?: () => void;
}

export function RoomFurnitureLayer({
  placements,
  isEditing = false,
  selectedIndex,
  onSelectItem,
  onMoveItem,
  containerRef,
  activeLayer,
  onBackgroundClick,
}: RoomFurnitureLayerProps) {
  const handleBgClick = useCallback((e: React.MouseEvent) => {
    // Only deselect on direct click, not when a drag cycle ended
    if (e.target === e.currentTarget) {
      onBackgroundClick?.();
    }
  }, [onBackgroundClick]);

  if (!placements || placements.length === 0) {
    // Still render the background click target when editing (room may be empty)
    if (isEditing && onBackgroundClick) {
      return (
        <div
          className="absolute inset-0 z-[2] pointer-events-auto"
          onClick={handleBgClick}
          aria-hidden
        />
      );
    }
    return null;
  }

  // Build a flat index so grouped rendering preserves the original array index
  const indexed: { placement: FurniturePlacement; originalIndex: number }[] = placements.map(
    (placement, i) => ({ placement, originalIndex: i }),
  );

  // Group by layer
  const grouped: Record<FurnitureLayer, typeof indexed> = {
    back: [],
    floor: [],
    front: [],
  };

  for (const item of indexed) {
    grouped[item.placement.layer].push(item);
  }

  return (
    <>
      {/* Background click target — behind all items, captures empty-space clicks */}
      {isEditing && onBackgroundClick && (
        <div
          className="absolute inset-0 z-[2] pointer-events-auto"
          onClick={handleBgClick}
          aria-hidden
        />
      )}
      {(['back', 'floor', 'front'] as const).map((layer) => {
        const items = grouped[layer];
        if (items.length === 0) return null;
        return (
          <div
            key={layer}
            className={cn(
              'absolute inset-0 pointer-events-none',
              LAYER_Z[layer],
            )}
            aria-hidden={!isEditing}
          >
            {items.map(({ placement, originalIndex }) => (
              <FurnitureItem
                key={`${placement.id}-${originalIndex}`}
                placement={placement}
                index={originalIndex}
                isEditing={isEditing}
                isSelected={selectedIndex === originalIndex}
                isDimmed={!!activeLayer && placement.layer !== activeLayer}
                onSelect={onSelectItem}
                onMove={onMoveItem}
                containerRef={containerRef}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

// ─── Single Item ──────────────────────────────────────────────────────────────

interface FurnitureItemProps {
  placement: FurniturePlacement;
  index: number;
  isEditing: boolean;
  isSelected: boolean;
  /** Whether this item should appear visually dimmed (not in the active layer). */
  isDimmed: boolean;
  onSelect?: (index: number) => void;
  onMove?: (index: number, x: number, y: number) => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

function FurnitureItem({
  placement,
  index,
  isEditing,
  isSelected,
  isDimmed,
  onSelect,
  onMove,
  containerRef,
}: FurnitureItemProps) {
  const { isDragging, isHolding, startHold, shouldSuppressClick } = useFurnitureDrag({
    containerRef: containerRef ?? { current: null },
    onMove: (x, y) => onMove?.(index, x, y),
  });

  const def = resolveFurniture(placement.id);
  if (!def) return null;

  const asset = getFurnitureAsset(def, placement.variant);
  const scale = placement.scale ?? 1;
  const widthPct = def.baseWidth * scale * 100;
  const flip = placement.flip ? ' scaleX(-1)' : '';

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isEditing) return;
    e.stopPropagation();
    if (isSelected) {
      // Start hold-to-drag on already-selected item
      startHold(e, placement.x, placement.y);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!isEditing) return;
    e.stopPropagation();
    // Suppress click after a hold/drag cycle
    if (shouldSuppressClick()) return;
    // Select on tap
    onSelect?.(index);
  };

  const shadowCfg = getFurnitureShadowConfig(placement.id);

  return (
    <div
      className={cn(
        'absolute select-none',
        isEditing && 'cursor-pointer touch-none pointer-events-auto',
        isDimmed && !isSelected && 'opacity-40',
      )}
      style={{
        left: `${placement.x * 100}%`,
        top: `${placement.y * 100}%`,
        width: `${widthPct}%`,
        aspectRatio: `${def.aspectRatio}`,
        transform: `translateX(-50%) translateY(-100%)${flip}`,
        transition: 'opacity 150ms ease',
      }}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
    >
      {/* Ground shadow — radial-gradient ellipse anchored at item base */}
      {shadowCfg && (
        <div
          className="absolute pointer-events-none"
          aria-hidden
          style={{
            left: '50%',
            bottom: 0,
            width: isDragging ? `calc(${shadowCfg.widthPct} + 10%)` : shadowCfg.widthPct,
            height: shadowCfg.heightPct,
            transform: 'translateX(-50%) translateY(45%)',
            borderRadius: '50%',
            background: `radial-gradient(ellipse at center, rgba(0,0,0,${isDragging ? shadowCfg.alpha + DRAG_ALPHA_BOOST : shadowCfg.alpha}) 0%, rgba(0,0,0,${(isDragging ? shadowCfg.alpha + DRAG_ALPHA_BOOST : shadowCfg.alpha) * 0.5}) 40%, transparent 70%)`,
            transition: 'width 150ms ease, background 150ms ease',
          }}
        />
      )}
      {def.isFrame && placement.content?.imageUrl ? (
        <FrameWithImage
          key={placement.content.imageUrl}
          imageUrl={placement.content.imageUrl}
          overlayAsset={getFrameOverlayAsset(asset)}
          fallbackAsset={asset}
          imageInset={def.frameImageInset}
          imageRadius={def.frameImageRadius}
          isSelected={isSelected}
          isDragging={isDragging}
          isHolding={isHolding}
        />
      ) : (
        <img
          src={asset}
          alt=""
          draggable={false}
          className={cn(
            'w-full h-full object-contain',
            isSelected && 'ring-2 ring-primary ring-offset-1 rounded-sm',
            isDragging && 'opacity-80 scale-105 transition-transform duration-100',
            isHolding && 'scale-[1.02] transition-transform duration-100',
          )}
        />
      )}
      {/* Hold progress bar — shown during long-press */}
      {isHolding && (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-muted/60 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full"
            style={{ animation: 'furniture-hold-fill 500ms linear forwards' }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Frame with Custom Image ──────────────────────────────────────────────────

interface FrameWithImageProps {
  imageUrl: string;
  overlayAsset: string;
  fallbackAsset: string;
  imageInset?: string;
  imageRadius?: string;
  isSelected: boolean;
  isDragging: boolean;
  isHolding: boolean;
}

function FrameWithImage({
  imageUrl,
  overlayAsset,
  fallbackAsset,
  imageInset,
  imageRadius,
  isSelected,
  isDragging,
  isHolding,
}: FrameWithImageProps) {
  const [imgError, setImgError] = useState(false);

  const imageClassName = cn(
    'relative w-full h-full',
    isSelected && 'ring-2 ring-primary ring-offset-1 rounded-sm',
    isDragging && 'opacity-80 scale-105 transition-transform duration-100',
    isHolding && 'scale-[1.02] transition-transform duration-100',
  );

  // On broken image, fall back to the normal full-frame SVG
  if (imgError) {
    return (
      <img
        src={fallbackAsset}
        alt=""
        draggable={false}
        className={cn(
          'w-full h-full object-contain',
          isSelected && 'ring-2 ring-primary ring-offset-1 rounded-sm',
          isDragging && 'opacity-80 scale-105 transition-transform duration-100',
          isHolding && 'scale-[1.02] transition-transform duration-100',
        )}
      />
    );
  }

  return (
    <div className={imageClassName}>
      {/* Custom image — wrapper positioned to fill the frame's inner opening */}
      <div
        className="absolute overflow-hidden"
        style={{
          inset: imageInset ?? '12% 15% 12% 15%',
          borderRadius: imageRadius,
        }}
      >
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      </div>
      {/* Frame overlay on top */}
      <img
        src={overlayAsset}
        alt=""
        draggable={false}
        className="absolute inset-0 w-full h-full object-contain"
      />
    </div>
  );
}
