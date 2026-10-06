/**
 * Drive a RoomScene (the three.js diorama) from React.
 *
 * Loads three on demand, then mirrors props into the scene. `status` is
 * 'loading' until the scene exists, and 'unavailable' when WebGL can't be had
 * (Lockdown Mode, lost context), so the caller can show the Blobbi alone. A
 * lost context is retried a few times, on a fresh canvas.
 * The returned ref gives imperative access for picking, dragging and anchors.
 */

import { useEffect, useRef, useState } from 'react';

import type { FurniturePlacement } from '../lib/room-furniture-schema';
import type { RoomLayout } from '../lib/room-layout-schema';
import { isOfficialFurnitureId, resolveFurniture } from '../lib/furniture-registry';
import type { RoomScene, SceneGeometry, SceneItem } from '../lib/room-scene/RoomScene';
import type { FurnitureModel } from './useFurnitureModels';

type RoomSceneStatus = 'loading' | 'ready' | 'unavailable';

interface UseRoomSceneOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  frontCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  geometry: SceneGeometry | null;
  layout: RoomLayout | undefined;
  /** Changes when the room changes, so the room folds in again. */
  roomKey: string;
  placements: FurniturePlacement[] | undefined;
  models: Map<number, FurnitureModel>;
  /** Keep the object stable between renders. */
  blobbi: { visible: boolean; isEgg: boolean; tiles: number; sleeping: boolean };
  /** Visiting Blobbis. Keep the array stable between renders. */
  guests: { id: string; isEgg: boolean; tiles: number; spawn?: { x: number; z: number } }[];
  onMeet?: (id: string) => void;
  editing: boolean;
  selected: number | null;
  /** Called after every rendered frame. */
  onFrame: () => void;
  onInvalidChange?: (invalid: Set<number>) => void;
}

/** Lost contexts recovered from before giving up on the room. */
const MAX_LOSSES = 3;
const RETRY_MS = 2000;
const RECOVERED_MS = 10_000;

let hasWebgl: boolean | undefined;

/** Checked once: browsers cap live WebGL contexts, so the probe's is released right away. */
function webglAvailable(): boolean {
  if (hasWebgl === undefined) {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      hasWebgl = !!gl;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      hasWebgl = false;
    }
  }
  return hasWebgl;
}

export function useRoomScene(options: UseRoomSceneOptions) {
  const {
    canvasRef, frontCanvasRef, geometry, layout, roomKey, placements, models,
    blobbi, guests, editing, selected, onFrame, onInvalidChange, onMeet,
  } = options;
  const sceneRef = useRef<RoomScene | null>(null);
  const [status, setStatus] = useState<RoomSceneStatus>(() => (webglAvailable() ? 'loading' : 'unavailable'));
  /** Contexts lost in a row; the room comes back on a fresh canvas a few times. */
  const losses = useRef(0);

  // Latest callbacks, read by the scene without re-subscribing
  const callbacks = useRef({ onFrame, onInvalidChange, onMeet });
  useEffect(() => {
    callbacks.current = { onFrame, onInvalidChange, onMeet };
  });

  // Create the scene once three has loaded
  useEffect(() => {
    if (status === 'unavailable') return;
    const canvas = canvasRef.current;
    const front = frontCanvasRef.current;
    if (!canvas || !front) return;
    let cancelled = false;
    let scene: RoomScene | null = null;
    let recovered: ReturnType<typeof setTimeout> | undefined;

    const onLost = (e: Event) => {
      e.preventDefault();
      losses.current++;
      setStatus('unavailable');
    };
    canvas.addEventListener('webglcontextlost', onLost);

    import('../lib/room-scene/RoomScene')
      .then(({ RoomScene }) => {
        if (cancelled) return;
        scene = new RoomScene(canvas, front);
        scene.onFrame = () => callbacks.current.onFrame();
        scene.onInvalidChange = (invalid) => callbacks.current.onInvalidChange?.(invalid);
        scene.onMeet = (id) => callbacks.current.onMeet?.(id);
        sceneRef.current = scene;
        setStatus('ready');
        // Drawn fine for a while: forget earlier losses
        recovered = setTimeout(() => { losses.current = 0; }, RECOVERED_MS);
      })
      .catch(() => {
        if (cancelled) return;
        // Counts as a loss too, so a GPU that stays gone stops the retries
        losses.current++;
        setStatus('unavailable');
      });

    return () => {
      cancelled = true;
      clearTimeout(recovered);
      canvas.removeEventListener('webglcontextlost', onLost);
      scene?.dispose();
      sceneRef.current = null;
    };
  // The scene lives as long as its canvases
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status === 'unavailable']);

  // iOS drops WebGL contexts in the background: try again on a fresh canvas
  // when the page is shown, or shortly, if it never left
  useEffect(() => {
    if (status !== 'unavailable' || !losses.current || losses.current > MAX_LOSSES) return;
    const retry = () => {
      if (document.visibilityState === 'visible') setStatus('loading');
    };
    const timer = setTimeout(retry, RETRY_MS);
    document.addEventListener('visibilitychange', retry);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', retry);
    };
  }, [status]);

  const ready = status === 'ready';

  // Moving to a screen of another pixel density redraws at its resolution
  const [dpr, setDpr] = useState(() => window.devicePixelRatio);
  useEffect(() => {
    const query = matchMedia(`(resolution: ${dpr}dppx)`);
    const onChange = () => setDpr(window.devicePixelRatio);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [dpr]);

  useEffect(() => {
    if (ready && geometry) sceneRef.current?.setGeometry(geometry);
  }, [ready, geometry, dpr]);

  useEffect(() => {
    if (ready && layout) sceneRef.current?.setLayout(layout);
  }, [ready, layout]);

  // Fold the room in on the first show and on room changes, not on edits
  const shownRoom = useRef<string | null>(null);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!ready || !scene) return;
    const items: SceneItem[] = [];
    // Keyed by the piece and how many of it came before, not by position in
    // the list, so removing one doesn't rebuild everything after it
    const seen = new Map<string, number>();
    (placements ?? []).forEach((placement, index) => {
      const model = models.get(index);
      const def = resolveFurniture(placement.id);
      // Stand-ins for objects that didn't load only show while decorating, to be put away
      if (!model || !def || (model.missing && !editing)) return;
      const nth = seen.get(placement.id) ?? 0;
      seen.set(placement.id, nth + 1);
      items.push({
        index,
        key: `${placement.id}|${nth}`,
        node: model.node,
        extras: model.extras,
        official: isOfficialFurnitureId(placement.id),
        mount: def.mount,
        small: def.small,
        surface: def.surface,
        interaction: def.interaction,
        placement,
      });
    });
    const animate = shownRoom.current !== roomKey;
    shownRoom.current = roomKey;
    scene.setItems(items, animate);
  }, [ready, placements, models, roomKey, editing]);

  useEffect(() => {
    if (ready) sceneRef.current?.setBlobbi(blobbi);
  }, [ready, blobbi]);

  useEffect(() => {
    if (ready) sceneRef.current?.setGuests(guests);
  }, [ready, guests]);

  useEffect(() => {
    if (ready) sceneRef.current?.setEditing(editing, selected);
  }, [ready, editing, selected]);

  // Pointer parallax (fine pointers only)
  useEffect(() => {
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    if (!ready || !scene || !canvas) return;
    if (editing || !matchMedia('(pointer: fine)').matches) {
      scene.setParallax(0, 0);
      return;
    }
    const target = canvas.parentElement ?? canvas;
    // Measured on enter, not per move: layout reads on every pointermove add up
    let rect = target.getBoundingClientRect();
    const onEnter = () => { rect = target.getBoundingClientRect(); };
    const onMove = (e: PointerEvent) => {
      scene.setParallax(((e.clientX - rect.left) / rect.width) * 2 - 1, ((e.clientY - rect.top) / rect.height) * 2 - 1);
    };
    const onLeave = () => scene.setParallax(0, 0);
    target.addEventListener('pointerenter', onEnter);
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerleave', onLeave);
    return () => {
      target.removeEventListener('pointerenter', onEnter);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerleave', onLeave);
      scene.setParallax(0, 0);
    };
  }, [ready, editing, canvasRef]);

  return { status, sceneRef };
}
