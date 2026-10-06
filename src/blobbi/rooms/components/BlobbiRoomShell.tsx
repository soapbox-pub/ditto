/**
 * BlobbiRoomShell — the Blobbi room screen.
 *
 * Layers, back to front: the 3D diorama canvas, DOM things standing in the
 * room (the Blobbi, poop) moved each frame to where the scene projects them,
 * a second canvas with furniture standing in front of the Blobbi, then
 * Ditto's chrome: the arc tab bar, the room switcher and stat rings, and the
 * arc dock with the per-room action bar.
 *
 * The scene frames the room in the space between whatever is marked
 * `data-room-top` and `data-room-bottom` (HUD and dock, or the decorator's
 * bars while decorating). Without WebGL there is no room: the Blobbi stands
 * alone, a little larger, in the middle.
 *
 * Owns room navigation (switcher arrows + swipe), taps in the room (walk
 * there, or use the piece of furniture tapped), and, while decorating,
 * picking and dragging furniture.
 */

import { useState, useCallback, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { Armchair, ChevronLeft, ChevronRight } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import { cn } from '@/lib/utils';
import { impactLight } from '@/lib/haptics';

import {
  type BlobbiRoomId,
  ROOM_META,
  DEFAULT_ROOM_ORDER,
  getNextRoom,
  getPreviousRoom,
} from '../lib/room-config';
import type { FurniturePlacement } from '../lib/room-furniture-schema';
import { resolveFurniture, type FurnitureInteraction } from '../lib/furniture-registry';
import type { PoopInstance } from '../lib/poop-system';
import type { RoomLayout } from '../lib/room-layout-schema';
import { ROOM_GRID, blobbiBoxTiles } from '../lib/room-geometry';
import { HUD_BUTTON_CLASS, ROOM_CONTROL_SURFACE, ROOM_DOCK_SCALE, ROOM_UI_SCALE, ROOM_GUIDE_RING_PULSE } from '../lib/room-layout';
import { ArcBackground } from '@/components/ArcBackground';
import { PoopOverlay } from './RoomPoopLayer';
import { useFurnitureModels } from '../hooks/useFurnitureModels';
import { useRoomScene } from '../hooks/useRoomScene';
import type { RoomScene, SceneGeometry, ScreenAnchor, SpotQuery } from '../lib/room-scene/RoomScene';

// ─── Types ────────────────────────────────────────────────────────────────────

/** What the decorator can ask of the room. */
export interface RoomControl {
  /** A free spot for a new item, or null if the room is full (or not 3D). */
  findSpot: (query: SpotQuery) => Pick<FurniturePlacement, 'at' | 'x' | 'y'> | null;
  /** The floor point (tiles) under a screen point, or null off the floor. */
  floorAt: (clientX: number, clientY: number) => { x: number; z: number } | null;
  /**
   * Walk the user's Blobbi up to a floor point; `onArrive` runs when it gets
   * there, or never if the room goes away first (a lost WebGL context).
   */
  approach: (x: number, z: number, onArrive: () => void) => void;
}

/** A visiting Blobbi standing in the room. */
export interface RoomGuest {
  id: string;
  /** Egg, baby or adult: sets its size in the room. */
  stage: string;
  /** Where it first appears, in tiles; beside the user's Blobbi when unset. */
  spawn?: { x: number; z: number };
  /** Its visual (a BlobbiRoomStage-like element). */
  node: React.ReactNode;
}

/** Something set down on the floor (a dropped item). */
export interface RoomFloorThing {
  key: string;
  x: number;
  z: number;
  node: React.ReactNode;
}

export interface RoomEditorBinding {
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  /** An item was dropped on a free spot. */
  onMove: (index: number, placement: FurniturePlacement) => void;
  onInvalidChange: (invalid: Set<number>) => void;
  /** Floating toolbar, anchored above the selected item. */
  toolbar?: React.ReactNode;
  /** Decorating bars (mark them data-room-top / data-room-bottom). Replace the HUD and dock. */
  overlay: React.ReactNode;
}

interface BlobbiRoomShellProps {
  roomId: BlobbiRoomId;
  onChangeRoom: (roomId: BlobbiRoomId) => void;
  /** Room-switcher arrow to pulse during the stat guide. */
  guideRoomDirection?: 'left' | 'right' | null;
  isSleeping: boolean;
  /** Egg, baby or adult: sets its size in the room. */
  blobbiStage: string;
  /** False while the Blobbi is out as the floating companion. */
  blobbiVisible: boolean;
  /** The Blobbi (BlobbiRoomStage), positioned in the room each frame. */
  stage?: React.ReactNode;
  /** "Out exploring" state, over the room. */
  hero?: React.ReactNode;
  /** Tab bar and its drop-down drawer, above the room. */
  header?: React.ReactNode;
  /** Stat rings under the room switcher. */
  statusHud?: React.ReactNode;
  /** Hide the HUD (while a drawer is open). */
  hudVisible?: boolean;
  /** Hotbar (per-room actions). */
  children: React.ReactNode;
  /** Inline activity (music/sing) above the hotbar. */
  middleSlot?: React.ReactNode;
  roomLayout?: RoomLayout;
  furniturePlacements?: FurniturePlacement[];
  /** The mess on the floor; it follows the Blobbi into every room. */
  poops: PoopInstance[];
  /** Room-level overlay (fridge). */
  roomOverlay?: React.ReactNode;
  guests?: RoomGuest[];
  /** A visiting Blobbi walked up to the user's. */
  onMeet?: (id: string) => void;
  /** A Blobbi was tapped (MAIN for the user's). */
  onBlobbiTap?: (id: string) => void;
  floorThings?: RoomFloorThing[];
  /** Tapping a piece of furniture that does something. */
  onInteract?: (interaction: FurnitureInteraction, index: number) => void;
  /** Enter decorating mode. The button is disabled without WebGL. */
  onDecorate?: () => void;
  /** Disables the decorate button, e.g. while the Blobbi is busy with something. */
  decorateDisabled?: boolean;
  /** Present while decorating. */
  editor?: RoomEditorBinding;
  controlRef?: React.MutableRefObject<RoomControl | null>;
}

// ─── Component ────────────────────────────────────────────────────────────────

/** Minimum horizontal swipe distance (px) to trigger room change */
const SWIPE_THRESHOLD = 50;
/** Movement (px) under which a press is a tap rather than a drag. */
const TAP_SLOP = 8;
/** Room widths (px) below which the room is framed for a phone. */
const PHONE_WIDTH = 500;

export function BlobbiRoomShell({
  roomId,
  onChangeRoom,
  guideRoomDirection,
  isSleeping,
  blobbiStage,
  blobbiVisible,
  stage,
  hero,
  header,
  statusHud,
  hudVisible = true,
  children,
  middleSlot,
  roomLayout,
  furniturePlacements,
  poops,
  roomOverlay,
  onInteract,
  guests,
  onMeet,
  onBlobbiTap,
  floorThings,
  editor,
  controlRef,
  onDecorate,
  decorateDisabled,
}: BlobbiRoomShellProps) {
  const intl = useIntl();
  const isEditing = !!editor;

  const goLeft = useCallback(() => onChangeRoom(getPreviousRoom(roomId)), [onChangeRoom, roomId]);
  const goRight = useCallback(() => onChangeRoom(getNextRoom(roomId)), [onChangeRoom, roomId]);
  const RoomIcon = ROOM_META[roomId].icon;

  // ─── Touch swipe between rooms ───
  const touchStartX = useRef<number | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    // Food drags start on the hotbar and must not switch rooms; nor do touches on chrome.
    if ((e.target as HTMLElement).closest?.('[data-room-drag], [data-room-header], [data-room-top], [data-room-bottom]')) return;
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (isEditing || Math.abs(dx) < SWIPE_THRESHOLD) return;
    impactLight();
    if (dx > 0) goLeft();
    else goRight();
  }, [isEditing, goLeft, goRight]);

  // ─── Framing: the stage is the space between the top and bottom chrome ───
  const shellRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<SceneGeometry | null>(null);
  const behindTopRef = useRef(0);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const measure = () => {
      const box = shell.getBoundingClientRect();
      let top = 0;
      let bottom = box.height;
      shell.querySelectorAll<HTMLElement>('[data-room-top]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.height > 0) top = Math.max(top, r.bottom - box.top);
      });
      shell.querySelectorAll<HTMLElement>('[data-room-bottom]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.height > 0) bottom = Math.min(bottom, r.top - box.top);
      });
      // On phones the resting room may reach up behind most of the HUD, to be
      // shown bigger. Remembered while decorating, which has no HUD, so the
      // camera doesn't jump as it moves between the two views.
      const header = shell.querySelector<HTMLElement>('[data-room-header]');
      if (header) {
        const headerBottom = header.getBoundingClientRect().bottom - box.top;
        behindTopRef.current = box.width < PHONE_WIDTH ? Math.round(Math.max(0, top - headerBottom) * 0.75) : 0;
      }
      const next: SceneGeometry = {
        width: Math.round(box.width),
        height: Math.round(box.height),
        stage: { left: 0, top: Math.round(top), width: Math.round(box.width), height: Math.max(80, Math.round(bottom - top)) },
        behindTop: behindTopRef.current,
      };
      setGeometry(prev => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(shell);
    shell.querySelectorAll('[data-room-top], [data-room-bottom]').forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [isEditing]);

  // ─── 3D diorama ───
  const sceneCanvasRef = useRef<HTMLCanvasElement>(null);
  const frontCanvasRef = useRef<HTMLCanvasElement>(null);
  const worldAnchorsRef = useRef<HTMLDivElement>(null);
  const uiAnchorsRef = useRef<HTMLDivElement>(null);
  const models = useFurnitureModels(furniturePlacements);
  const isEgg = blobbiStage === 'egg';
  const blobbiTiles = blobbiBoxTiles(blobbiStage);
  const blobbi = useMemo(() => ({ visible: blobbiVisible, isEgg, tiles: blobbiTiles, sleeping: isSleeping }), [blobbiVisible, isEgg, blobbiTiles, isSleeping]);
  const guestsKey = (guests ?? []).map((g) => `${g.id}:${g.stage}:${g.spawn?.x ?? ''},${g.spawn?.z ?? ''}`).join('|');
  const sceneGuests = useMemo(
    () => (guests ?? []).map(({ id, stage: s, spawn }) => ({ id, isEgg: s === 'egg', tiles: blobbiBoxTiles(s), spawn })),
    // Only the fields the scene uses
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [guestsKey],
  );
  const statusRef = useRef<'loading' | 'ready' | 'unavailable'>('loading');
  const sceneHandle = useRef<RoomScene | null>(null);

  /** Move every anchored DOM element to where its room point is on screen. */
  const updateAnchors = useCallback(() => {
    const scene = sceneHandle.current;
    const status = statusRef.current;
    const flat = status === 'unavailable' && geometry ? flatProjector(geometry, blobbiTiles) : null;
    for (const root of [worldAnchorsRef.current, uiAnchorsRef.current]) {
      root?.querySelectorAll<HTMLElement>('[data-anchor]').forEach((el) => {
        let anchor: ScreenAnchor | null = null;
        const { anchor: kind, x, z, index, actor } = el.dataset;
        if (kind === 'blobbi') anchor = scene ? scene.projectBlobbi(actor) : actor ? null : flat?.blobbi() ?? null;
        else if (kind === 'floor') anchor = scene ? scene.projectFloor(Number(x), Number(z)) : flat?.floor(Number(x), Number(z)) ?? null;
        else if (kind === 'item') anchor = scene ? scene.projectItemTop(Number(index)) : null;
        if (!anchor) {
          el.style.visibility = 'hidden';
          return;
        }
        el.style.visibility = '';
        el.style.transform = `translate3d(${anchor.x}px, ${anchor.y}px, 0)`;
        // Nearer the viewer (lower on screen) draws over what's behind
        if (kind !== 'item') el.style.zIndex = String(Math.round(anchor.y));
        el.style.setProperty('--anchor-px', String(anchor.pxPerTile));
      });
    }
  }, [geometry, blobbiTiles]);

  const { status, sceneRef } = useRoomScene({
    canvasRef: sceneCanvasRef,
    frontCanvasRef,
    geometry,
    layout: roomLayout,
    roomKey: roomId,
    placements: furniturePlacements,
    models,
    blobbi,
    guests: sceneGuests,
    onMeet,
    editing: isEditing,
    selected: editor?.selectedIndex ?? null,
    onFrame: updateAnchors,
    onInvalidChange: editor?.onInvalidChange,
  });
  statusRef.current = status;
  sceneHandle.current = status === 'ready' ? sceneRef.current : null;
  const is3d = status === 'ready';

  // Anchored elements mount and unmount with React; place them right away
  useLayoutEffect(() => {
    updateAnchors();
  });

  useEffect(() => {
    if (!controlRef) return;
    controlRef.current = is3d ? {
      findSpot: (query) => sceneRef.current?.findSpot(query) ?? null,
      floorAt: (clientX, clientY) => {
        const box = shellRef.current?.getBoundingClientRect();
        return box ? sceneRef.current?.floorAt(clientX - box.left, clientY - box.top) ?? null : null;
      },
      approach: (x, z, onArrive) => {
        const scene = sceneRef.current;
        if (scene) scene.approach(x, z, onArrive);
        else onArrive();
      },
    } : null;
    return () => { controlRef.current = null; };
  }, [is3d, controlRef, sceneRef]);

  // ─── Taps and drags in the room ───
  const press = useRef<{ id: number; x: number; y: number; t: number; item: number | null; dragging: boolean } | null>(null);

  const localPoint = (e: React.PointerEvent) => {
    const box = shellRef.current!.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const scene = sceneRef.current;
    if (!scene || !e.isPrimary) return;
    const { x, y } = localPoint(e);
    const hit = scene.pick(x, y);
    const item = hit?.kind === 'item' ? hit.index : null;
    press.current = { id: e.pointerId, x, y, t: performance.now(), item, dragging: false };
    if (editor && item !== null) {
      // Grab right away, like picking something up
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      if (editor.selectedIndex !== item) editor.onSelect(item);
    }
  }, [editor, sceneRef]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const p = press.current;
    const scene = sceneRef.current;
    if (!p || p.id !== e.pointerId || !scene || !editor || p.item === null) return;
    const { x, y } = localPoint(e);
    if (!p.dragging) {
      if (Math.hypot(x - p.x, y - p.y) < TAP_SLOP) return;
      p.dragging = scene.beginDrag(p.item, p.x, p.y);
    }
    if (p.dragging) scene.dragTo(x, y);
  }, [editor, sceneRef]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const p = press.current;
    // Another finger lifting doesn't end this press
    if (!p || p.id !== e.pointerId) return;
    press.current = null;
    const scene = sceneRef.current;
    if (!scene) return;
    if (p.dragging) {
      const result = scene.endDrag();
      if (result?.valid) {
        impactLight();
        editor?.onMove(result.index, result.placement);
      }
      return;
    }
    const { x, y } = localPoint(e);
    if (Math.hypot(x - p.x, y - p.y) >= TAP_SLOP || performance.now() - p.t > 600) return;
    if (editor) {
      if (p.item === null) editor.onSelect(null);
      return;
    }
    const hit = scene.pick(x, y);
    if (hit?.kind === 'actor') {
      scene.hop(hit.id);
      onBlobbiTap?.(hit.id);
    } else if (hit?.kind === 'item') {
      scene.poke(hit.index);
      if (scene.toggleLamp(hit.index)) impactLight();
      const interaction = furniturePlacements?.[hit.index] && resolveFurniture(furniturePlacements[hit.index].id)?.interaction;
      if (interaction) {
        impactLight();
        onInteract?.(interaction, hit.index);
      }
    } else if (hit?.kind === 'floor') {
      scene.walkTo(hit.x, hit.z);
    }
  }, [editor, sceneRef, furniturePlacements, onInteract, onBlobbiTap]);

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    if (press.current?.id !== e.pointerId) return;
    if (press.current.dragging) {
      const result = sceneRef.current?.endDrag();
      if (result?.valid) editor?.onMove(result.index, result.placement);
    }
    press.current = null;
  }, [editor, sceneRef]);

  return (
    <div
      ref={shellRef}
      className="relative flex flex-col flex-1 min-h-0 overflow-hidden select-none @container"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Backdrop the diorama floats in */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 85% 65% at 50% 48%, hsl(var(--primary) / 0.16), hsl(var(--primary) / 0.05) 60%, hsl(var(--background)) 100%)' }}
        aria-hidden
      />
      {status !== 'unavailable' && (
        <canvas ref={sceneCanvasRef} className="absolute inset-0 size-full" aria-hidden />
      )}

      {/* Taps and drags in the room */}
      {is3d && (
        <div
          className={cn('absolute inset-0 z-4 touch-none', isEditing ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer')}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          aria-hidden
        />
      )}

      {/* Things standing in the room, placed by the scene each frame */}
      <div ref={worldAnchorsRef} className="absolute inset-0 z-5 pointer-events-none" aria-hidden={!stage}>
        {stage && blobbiVisible && (
          <div
            data-anchor="blobbi"
            className={cn(
              'absolute left-0 top-0 transition-opacity duration-300',
              isEditing && 'opacity-40',
              status === 'loading' && 'invisible',
            )}
            style={{ '--blobbi-tiles': blobbiTiles } as React.CSSProperties}
          >
            {/* Re-keyed per room: the Blobbi hops in once the room has folded together */}
            <div
              key={is3d ? roomId : 'flat'}
              className={cn(is3d && 'motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-50 motion-safe:duration-500 motion-safe:delay-700 motion-safe:fill-mode-backwards')}
            >
              {stage}
            </div>
          </div>
        )}
        {is3d && !isEditing && guests?.map((g) => (
          <div
            key={g.id}
            data-anchor="blobbi"
            data-actor={g.id}
            className="absolute left-0 top-0 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-50 motion-safe:duration-300"
            style={{ '--blobbi-tiles': blobbiBoxTiles(g.stage) } as React.CSSProperties}
          >
            {g.node}
          </div>
        ))}
        {status !== 'loading' && floorThings?.map((t) => (
          <div key={t.key} data-anchor="floor" data-x={t.x} data-z={t.z} className="absolute left-0 top-0">
            {t.node}
          </div>
        ))}
        {!isEditing && status !== 'loading' && <PoopOverlay poops={poops} />}
      </div>

      {status !== 'unavailable' && (
        <canvas ref={frontCanvasRef} className="absolute inset-0 z-6 size-full pointer-events-none" aria-hidden />
      )}

      {/* Sleep dims the room; in 3D the lights dim too, so the veil is lighter */}
      <div
        className={cn(
          'absolute inset-0 z-12 pointer-events-none transition-opacity duration-700',
          isSleeping ? 'opacity-100' : 'opacity-0',
        )}
        style={{ background: `radial-gradient(ellipse at 50% 45%, rgba(10,12,40,${is3d ? 0.08 : 0.25}) 0%, rgba(10,12,40,${is3d ? 0.3 : 0.5}) 100%)` }}
        aria-hidden
      />

      {/* UI that follows the room (the decorator's item toolbar) */}
      <div ref={uiAnchorsRef} className="absolute inset-0 z-45 pointer-events-none">
        {editor?.toolbar && editor.selectedIndex !== null && (
          <div data-anchor="item" data-index={editor.selectedIndex} className="absolute left-0 top-0">
            <div className="absolute bottom-3 left-0 -translate-x-1/2 pointer-events-auto">{editor.toolbar}</div>
          </div>
        )}
      </div>

      {!isEditing && header && (
        <div data-room-header className="relative z-70 shrink-0">{header}</div>
      )}

      {/* HUD: decorate (left), room switcher, an empty slot (right) to keep it centred, then stats */}
      {!isEditing && (
        <div
          data-room-top
          inert={!hudVisible}
          className={cn(
            'relative z-30 px-3 pt-[1.1em] pb-[0.6em] pointer-events-none transition-opacity duration-200',
            ROOM_UI_SCALE,
            !hudVisible && 'opacity-0',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div className={cn('size-[2.75em] shrink-0', hudVisible && 'pointer-events-auto')}>
              {onDecorate && (
                <button
                  type="button"
                  onClick={onDecorate}
                  disabled={!is3d || decorateDisabled}
                  className={HUD_BUTTON_CLASS}
                  aria-label={status === 'unavailable'
                    ? intl.formatMessage({ id: 'blobbiRoom.decorate.unavailable', defaultMessage: 'Decorating needs 3D graphics, which this browser has turned off' })
                    : intl.formatMessage({ id: 'blobbiRoom.decorate.label', defaultMessage: 'Decorate this room' })}
                  title={status === 'unavailable'
                    ? intl.formatMessage({ id: 'blobbiRoom.decorate.unavailableTitle', defaultMessage: 'Decorating needs 3D graphics' })
                    : intl.formatMessage({ id: 'blobbiRoom.decorate.title', defaultMessage: 'Decorate' })}
                >
                  <Armchair />
                </button>
              )}
            </div>

            <div className={cn('flex items-center gap-1 p-1 rounded-full', ROOM_CONTROL_SURFACE, hudVisible && 'pointer-events-auto')}>
              <RoomNavButton direction="left" label={intl.formatMessage(ROOM_META[getPreviousRoom(roomId)].label)} onClick={goLeft} guide={guideRoomDirection === 'left'} />
              <div className="flex flex-col items-center gap-[0.25em] min-w-[6.5em] px-[0.25em]">
                <span className="flex items-center gap-[0.4em] text-[1em] font-semibold text-foreground">
                  <RoomIcon className="size-[1.1em] text-muted-foreground" aria-hidden />
                  <FormattedMessage {...ROOM_META[roomId].label} />
                </span>
                <span className="flex items-center gap-1" aria-hidden>
                  {DEFAULT_ROOM_ORDER.map((id) => (
                    <span
                      key={id}
                      className={cn('h-[0.25em] rounded-full transition-all duration-300', id === roomId ? 'w-[0.8em] bg-primary' : 'w-[0.25em] bg-foreground/25')}
                    />
                  ))}
                </span>
              </div>
              <RoomNavButton direction="right" label={intl.formatMessage(ROOM_META[getNextRoom(roomId)].label)} onClick={goRight} guide={guideRoomDirection === 'right'} />
            </div>

            {/* Spacer the size of the decorate button, so the switcher stays centred */}
            <div className="size-[2.75em] shrink-0" />
          </div>

          {statusHud && (
            <div className={cn('mt-[1.25em] flex justify-center', hudVisible && 'pointer-events-auto')}>
              {statusHud}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0" />

      {/* Dock: inline activity, then the per-room bar on Ditto's arc */}
      {!isEditing && (
        <div data-room-bottom className={cn('relative z-15 shrink-0', ROOM_DOCK_SCALE)}>
          {middleSlot}
          <div className="relative">
            <ArcBackground variant="up-subtle" />
            {children}
          </div>
        </div>
      )}

      {hero && (
        <div className="absolute inset-0 z-20 flex pointer-events-none">
          {hero}
        </div>
      )}

      {roomOverlay && (
        <div className="absolute inset-0 z-50">
          {roomOverlay}
        </div>
      )}

      {editor && (
        <div className="absolute inset-0 z-50 flex flex-col pointer-events-none">
          {editor.overlay}
        </div>
      )}

      {/* Screen-reader summary of the room */}
      <p className="sr-only" aria-live="polite"><FormattedMessage {...ROOM_META[roomId].label} /></p>
    </div>
  );
}

// ─── Room nav button ──────────────────────────────────────────────────────────

function RoomNavButton({ direction, label, onClick, guide }: {
  direction: 'left' | 'right';
  label: string;
  onClick: () => void;
  guide: boolean;
}) {
  const intl = useIntl();
  const Icon = direction === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'size-[2.4em] shrink-0 rounded-full flex items-center justify-center',
        'text-foreground/70 hover:text-foreground hover:bg-foreground/10',
        'transition-colors duration-150 active:scale-90 motion-reduce:active:scale-100',
        'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
        // A quiet tint and a few soft pulses, then it just stays tinted
        guide && ['bg-primary/10 text-primary', ROOM_GUIDE_RING_PULSE],
      )}
      aria-label={intl.formatMessage({ id: 'blobbiRoom.nav.goTo', defaultMessage: 'Go to {room}' }, { room: label })}
    >
      <Icon className="size-[1.3em]" strokeWidth={2.5} />
    </button>
  );
}

// ─── Without WebGL ────────────────────────────────────────────────────────────

/**
 * Stand-in projection with no room: the Blobbi in the middle of the stage, a
 * little larger than in the room, and floor spots spread around its feet.
 */
function flatProjector(g: SceneGeometry, tiles: number) {
  const size = Math.min(g.stage.height * 0.62, g.width * 0.72);
  const pxPerTile = size / tiles;
  const feet = { x: g.stage.left + g.stage.width / 2, y: g.stage.top + g.stage.height * 0.8 };
  const spread = Math.min(g.width * 0.42, size * 0.9) / (ROOM_GRID / 2);
  return {
    blobbi: (): ScreenAnchor => ({ ...feet, pxPerTile }),
    floor: (x: number, z: number): ScreenAnchor => ({
      x: feet.x + (x - z) * spread * 0.5,
      y: feet.y + (x + z - ROOM_GRID * 1.1) * spread * 0.12,
      pxPerTile: pxPerTile * 0.6,
    }),
  };
}
