// src/blobbi/house/items/RoomItemsLayer.tsx

/**
 * RoomItemsLayer — Renders placed items in a room using layer-based z-ordering.
 *
 * ── Rendering model ──────────────────────────────────────────────────
 *
 * Wall items (wallBack, wallDecor) are rendered as flat absolutely-
 * positioned elements over the full room viewport. Their coordinates
 * map into the wall area (top 60%).
 *
 * Floor items (backFloor, frontFloor) are rendered inside a perspective-
 * transformed container that matches the floor scene geometry from
 * RoomSceneLayer. This makes floor items visually belong to the same
 * receding floor plane — they foreshorten and scale naturally instead
 * of feeling pasted on top.
 *
 * Overlay items render flat over the full viewport (above everything).
 *
 * ── Layer z-stack (back to front) ────────────────────────────────────
 *
 *   z  1:  wallBack    — behind wall texture
 *   z  2:  wallDecor   — on wall surface (posters, shelves)
 *   z  4:  backFloor   — floor behind Blobbi (rugs)
 *   z  5:  (Blobbi hero — not rendered here)
 *   z  6:  frontFloor  — floor in front of Blobbi (plants, tables)
 *   z  8:  overlay     — floating above everything
 *
 * ── Edit mode ────────────────────────────────────────────────────────
 *
 * When `editMode` is true and editor callbacks are provided, items
 * become interactive:
 *   - Tap to select
 *   - Long-press (~2s) + drag to move
 *   - Position changes are reported via onDragEnd
 *   - Selected items get a visual highlight ring
 *
 * Outside edit mode, items are fully passive (pointer-events-none).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { HouseItem, HouseItemLayer, HouseItemPlane, HouseItemPosition } from '../lib/house-types';
import {
  WALL_PERCENT,
  FLOOR_PERSPECTIVE,
  FLOOR_TILT,
  FLOOR_OVERFLOW,
} from '@/blobbi/rooms/scene/components/RoomSceneLayer';
import { getCatalogItem } from './item-catalog';
import { toScreenPosition, toScreenSize } from './item-coordinates';
import {
  wallPixelDeltaToNormalized,
  floorPixelDeltaToNormalized,
  clampNormalized,
} from './item-coordinates';
import { BuiltinItemVisual } from './BuiltinItemVisual';

// ─── Layer Configuration ──────────────────────────────────────────────────────

const FLOOR_PERCENT = 100 - WALL_PERCENT;

const LAYER_Z: Record<HouseItemLayer, number> = {
  wallBack: 1,
  wallDecor: 2,
  backFloor: 4,
  blobbi: 5,
  frontFloor: 6,
  overlay: 8,
};

/** Wall layers: rendered flat over the full room viewport. */
const WALL_LAYERS: HouseItemLayer[] = ['wallBack', 'wallDecor'];

/** Floor layers: rendered inside a perspective-transformed container. */
const FLOOR_LAYERS: HouseItemLayer[] = ['backFloor', 'frontFloor'];

// ─── Edit Mode Types ──────────────────────────────────────────────────────────

export interface RoomItemsEditCallbacks {
  /** The instanceId of the selected item, or null. */
  selectedItemId: string | null;
  /** Called when the user taps an item to select it. */
  onSelect: (instanceId: string) => void;
  /** Called when a drag finishes with the new normalized position. */
  onDragEnd: (instanceId: string, position: HouseItemPosition) => void;
  /** Whether a position save is in flight (dims the UI). */
  isSaving: boolean;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface RoomItemsLayerProps {
  /** The items to render (from house.layout.rooms[roomId].items). */
  items: HouseItem[];
  /** If true + edit callbacks provided, items become interactive. */
  editMode?: boolean;
  /** Edit-mode callbacks. Required when editMode is true. */
  edit?: RoomItemsEditCallbacks;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RoomItemsLayer({ items, editMode = false, edit }: RoomItemsLayerProps) {
  if (items.length === 0) return null;

  const isEditing = editMode && !!edit;

  // Group visible items by layer
  const byLayer = new Map<HouseItemLayer, HouseItem[]>();
  for (const item of items) {
    if (!item.visible) continue;
    if (item.layer === 'blobbi') continue;
    const list = byLayer.get(item.layer);
    if (list) list.push(item);
    else byLayer.set(item.layer, [item]);
  }

  return (
    <>
      {/* ── Wall layers: flat, positioned over full room viewport ── */}
      {WALL_LAYERS.map((layerId) => {
        const layerItems = byLayer.get(layerId);
        if (!layerItems || layerItems.length === 0) return null;
        return (
          <div
            key={layerId}
            className={`absolute inset-0 ${isEditing ? '' : 'pointer-events-none'}`}
            style={{ zIndex: LAYER_Z[layerId] }}
          >
            {layerItems.map((item) => (
              <RoomItem
                key={item.instanceId}
                item={item}
                isEditing={isEditing}
                isSelected={edit?.selectedItemId === item.instanceId}
                onSelect={edit?.onSelect}
                onDragEnd={edit?.onDragEnd}
              />
            ))}
          </div>
        );
      })}

      {/* ── Floor layers: inside perspective-transformed container ── */}
      {FLOOR_LAYERS.map((layerId) => {
        const layerItems = byLayer.get(layerId);
        if (!layerItems || layerItems.length === 0) return null;
        return (
          <FloorItemLayer
            key={layerId}
            layerId={layerId}
            items={layerItems}
            isEditing={isEditing}
            edit={edit}
          />
        );
      })}

      {/* ── Overlay: flat, above everything ── */}
      {(() => {
        const overlayItems = byLayer.get('overlay');
        if (!overlayItems || overlayItems.length === 0) return null;
        return (
          <div
            className={`absolute inset-0 ${isEditing ? '' : 'pointer-events-none'}`}
            style={{ zIndex: LAYER_Z.overlay }}
          >
            {overlayItems.map((item) => (
              <RoomItem
                key={item.instanceId}
                item={item}
                isEditing={isEditing}
                isSelected={edit?.selectedItemId === item.instanceId}
                onSelect={edit?.onSelect}
                onDragEnd={edit?.onDragEnd}
              />
            ))}
          </div>
        );
      })()}
    </>
  );
}

// ─── Floor Item Layer ─────────────────────────────────────────────────────────

/**
 * A floor item layer that replicates the floor scene's perspective geometry.
 *
 * Structure (matches RoomSceneLayer's floor area):
 *   outer div  — covers the floor zone, applies perspective
 *   inner div  — tilted plane (rotateX), items positioned inside
 *
 * Items use floor-local coordinates (0..1000 → 0%..100% of the tilted surface).
 */
function FloorItemLayer({
  layerId,
  items,
  isEditing,
  edit,
}: {
  layerId: HouseItemLayer;
  items: HouseItem[];
  isEditing: boolean;
  edit?: RoomItemsEditCallbacks;
}) {
  return (
    <div
      className={`absolute inset-x-0 ${isEditing ? '' : 'pointer-events-none'}`}
      style={{
        top: `${WALL_PERCENT}%`,
        height: `${FLOOR_PERCENT}%`,
        perspective: FLOOR_PERSPECTIVE,
        perspectiveOrigin: '50% 0%',
        zIndex: LAYER_Z[layerId],
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          transformOrigin: 'top center',
          transform: FLOOR_TILT,
          height: FLOOR_OVERFLOW,
        }}
      >
        {items.map((item) => (
          <RoomItem
            key={item.instanceId}
            item={item}
            isEditing={isEditing}
            isSelected={edit?.selectedItemId === item.instanceId}
            onSelect={edit?.onSelect}
            onDragEnd={edit?.onDragEnd}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Long-Press Threshold ─────────────────────────────────────────────────────

/** How long (ms) the user must hold before drag activates. */
const LONG_PRESS_MS = 1200;

/** Max px movement during hold allowed before cancelling the hold. */
const HOLD_MOVE_TOLERANCE = 8;

// ─── Single Item Renderer ─────────────────────────────────────────────────────

interface RoomItemProps {
  item: HouseItem;
  isEditing: boolean;
  isSelected?: boolean;
  onSelect?: (instanceId: string) => void;
  onDragEnd?: (instanceId: string, position: HouseItemPosition) => void;
}

function RoomItem({ item, isEditing, isSelected, onSelect, onDragEnd }: RoomItemProps) {
  const catalog = getCatalogItem(item.id);
  if (!catalog) return null;

  const pos = toScreenPosition(item.position, item.plane);
  const size = toScreenSize(catalog.width, catalog.height, item.plane);

  const transforms: string[] = ['translate(-50%, -50%)'];
  if (item.scale !== 1) transforms.push(`scale(${item.scale})`);
  if (item.rotation !== 0) transforms.push(`rotate(${item.rotation}deg)`);

  // ── Non-edit mode: passive rendering ──
  if (!isEditing) {
    return (
      <div
        className="absolute"
        style={{
          left: pos.left,
          top: pos.top,
          width: size.width,
          height: size.height,
          transform: transforms.join(' '),
        }}
        data-item-id={item.instanceId}
      >
        {item.kind === 'builtin' && <BuiltinItemVisual id={item.id} />}
      </div>
    );
  }

  // ── Edit mode: interactive item ──
  return (
    <EditableRoomItem
      item={item}
      pos={pos}
      size={size}
      transforms={transforms}
      isSelected={isSelected || false}
      onSelect={onSelect}
      onDragEnd={onDragEnd}
    />
  );
}

// ─── Editable Room Item (interactive) ─────────────────────────────────────────

interface EditableRoomItemProps {
  item: HouseItem;
  pos: { left: string; top: string };
  size: { width: string; height: string };
  transforms: string[];
  isSelected: boolean;
  onSelect?: (instanceId: string) => void;
  onDragEnd?: (instanceId: string, position: HouseItemPosition) => void;
}

function EditableRoomItem({
  item,
  pos,
  size,
  transforms,
  isSelected,
  onSelect,
  onDragEnd,
}: EditableRoomItemProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const [holdProgress, setHoldProgress] = useState(0); // 0..1
  const holdAnimRef = useRef<number | null>(null);

  // ── Drag state ──
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ dx: 0, dy: 0 });
  const dragStartPointerRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (holdAnimRef.current) cancelAnimationFrame(holdAnimRef.current);
    };
  }, []);

  // ── Hold progress animation ──
  const startHoldAnimation = useCallback(() => {
    const startTime = performance.now();
    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / LONG_PRESS_MS, 1);
      setHoldProgress(progress);
      if (progress < 1) {
        holdAnimRef.current = requestAnimationFrame(animate);
      }
    };
    holdAnimRef.current = requestAnimationFrame(animate);
  }, []);

  const stopHoldAnimation = useCallback(() => {
    if (holdAnimRef.current) {
      cancelAnimationFrame(holdAnimRef.current);
      holdAnimRef.current = null;
    }
    setHoldProgress(0);
  }, []);

  // ── Resolve the reference container for coordinate conversion ──
  const getContainerRef = useCallback((): HTMLElement | null => {
    const el = elRef.current;
    if (!el) return null;

    if (item.plane === 'wall') {
      // Wall items: the layer div is positioned over the full room viewport.
      // The room viewport is the parent with position:relative (the flex container).
      // Walk up: item → layer div → room container
      return el.parentElement?.parentElement ?? null;
    }

    // Floor items: positioned inside the tilted inner div.
    // Walk up: item → tilted inner div
    return el.parentElement ?? null;
  }, [item.plane]);

  // ── Convert a pixel delta to normalized delta ──
  const pixelDeltaToNormalized = useCallback((dxPx: number, dyPx: number): { dx: number; dy: number } => {
    const container = getContainerRef();
    if (!container) return { dx: 0, dy: 0 };

    const rect = container.getBoundingClientRect();

    if (item.plane === 'wall') {
      return wallPixelDeltaToNormalized(dxPx, dyPx, rect.width, rect.height);
    }
    return floorPixelDeltaToNormalized(dxPx, dyPx, rect.width, rect.height);
  }, [item.plane, getContainerRef]);

  // ── Cancel long-press ──
  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pointerStartRef.current = null;
    stopHoldAnimation();
  }, [stopHoldAnimation]);

  // ── Pointer down: start long-press timer ──
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only primary button
    if (e.button !== 0) return;

    e.stopPropagation();

    // Select immediately on pointer down
    onSelect?.(item.instanceId);

    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    startHoldAnimation();

    // Start long-press timer
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      // Activate drag mode
      setIsDragging(true);
      isDraggingRef.current = true;
      dragStartPointerRef.current = { x: e.clientX, y: e.clientY };
      setDragOffset({ dx: 0, dy: 0 });

      // Capture pointer for drag tracking
      elRef.current?.setPointerCapture(e.pointerId);
    }, LONG_PRESS_MS);
  }, [item.instanceId, onSelect, startHoldAnimation]);

  // ── Pointer move: cancel hold if moved too far, or track drag ──
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // During long-press hold: check if user moved too far
    if (pointerStartRef.current && !isDraggingRef.current) {
      const dx = e.clientX - pointerStartRef.current.x;
      const dy = e.clientY - pointerStartRef.current.y;
      if (Math.abs(dx) > HOLD_MOVE_TOLERANCE || Math.abs(dy) > HOLD_MOVE_TOLERANCE) {
        cancelLongPress();
      }
      return;
    }

    // During drag: track movement
    if (isDraggingRef.current && dragStartPointerRef.current) {
      e.preventDefault();
      const dxPx = e.clientX - dragStartPointerRef.current.x;
      const dyPx = e.clientY - dragStartPointerRef.current.y;
      setDragOffset({ dx: dxPx, dy: dyPx });
    }
  }, [cancelLongPress]);

  // ── Pointer up: commit drag or just finish ──
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    cancelLongPress();

    if (isDraggingRef.current && dragStartPointerRef.current) {
      const dxPx = e.clientX - dragStartPointerRef.current.x;
      const dyPx = e.clientY - dragStartPointerRef.current.y;

      // Convert pixel delta to normalized delta
      const normDelta = pixelDeltaToNormalized(dxPx, dyPx);

      // Compute new normalized position
      const newPos = clampNormalized(
        item.position.x + normDelta.dx,
        item.position.y + normDelta.dy,
        20, // 20-unit padding from edges
      );

      // Report to parent
      onDragEnd?.(item.instanceId, newPos);

      // Release capture
      try { elRef.current?.releasePointerCapture(e.pointerId); } catch { /* ok */ }
    }

    // Reset drag state
    setIsDragging(false);
    isDraggingRef.current = false;
    dragStartPointerRef.current = null;
    setDragOffset({ dx: 0, dy: 0 });
  }, [cancelLongPress, pixelDeltaToNormalized, item.position, item.instanceId, onDragEnd]);

  // ── Pointer cancel (e.g. scroll gesture takes over) ──
  const handlePointerCancel = useCallback(() => {
    cancelLongPress();
    setIsDragging(false);
    isDraggingRef.current = false;
    dragStartPointerRef.current = null;
    setDragOffset({ dx: 0, dy: 0 });
  }, [cancelLongPress]);

  // ── Build transform with drag offset ──
  const dragTranslate = isDragging
    ? `translate(${dragOffset.dx}px, ${dragOffset.dy}px)`
    : '';

  // Selection ring + hold progress indicator
  const selectionRing = isSelected
    ? 'ring-2 ring-blue-400/70 ring-offset-1 ring-offset-transparent rounded-md'
    : '';

  // Hold progress glow — subtle radial pulse while holding
  const holdGlow = holdProgress > 0 && !isDragging
    ? {
      boxShadow: `0 0 ${8 + holdProgress * 16}px ${2 + holdProgress * 6}px rgba(96, 165, 250, ${0.15 + holdProgress * 0.45})`,
    }
    : {};

  return (
    <div
      ref={elRef}
      className={`absolute cursor-grab touch-none select-none transition-shadow duration-150 ${selectionRing} ${isDragging ? 'cursor-grabbing z-50 opacity-90' : ''}`}
      style={{
        left: pos.left,
        top: pos.top,
        width: size.width,
        height: size.height,
        transform: [dragTranslate, ...transforms].filter(Boolean).join(' '),
        willChange: isDragging ? 'transform' : undefined,
        ...holdGlow,
      }}
      data-item-id={item.instanceId}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {item.kind === 'builtin' && <BuiltinItemVisual id={item.id} />}

      {/* Hold progress ring (animated ring that fills over LONG_PRESS_MS) */}
      {holdProgress > 0 && !isDragging && (
        <div className="absolute inset-0 pointer-events-none">
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
            <rect
              x="2"
              y="2"
              width="96"
              height="96"
              rx="8"
              fill="none"
              stroke="rgba(96, 165, 250, 0.5)"
              strokeWidth="2"
              strokeDasharray={`${holdProgress * 384} 384`}
              strokeLinecap="round"
              className="transition-none"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
