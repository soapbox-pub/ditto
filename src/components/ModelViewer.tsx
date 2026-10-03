import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { FormattedMessage } from 'react-intl';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { fetchDecryptedFile, type FileEncryption } from '@/lib/encryptedFile';
import type { ModelFormat } from '@/lib/mediaUrls';
import { parseModel, stageModel } from '@/lib/modelRenderer';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

interface ModelViewerProps {
  url: string;
  format: ModelFormat;
  /** Present when `url` serves ciphertext. */
  encryption?: FileEncryption;
}

/**
 * Largest model downloaded. The size comes from the poster, so the viewer
 * enforces it while reading rather than trusting it; parsing much more than
 * this can take a phone's tab down.
 */
const MAX_MODEL_BYTES = 200 * 1024 * 1024;

/**
 * Fetch a model's bytes, decrypting when needed. `onProgress` gets the
 * fraction downloaded when the server says how much is coming.
 */
async function fetchModel(
  url: string,
  encryption: FileEncryption | undefined,
  signal: AbortSignal,
  onProgress: (fraction: number) => void,
): Promise<ArrayBuffer> {
  if (encryption) {
    const { bytes } = await fetchDecryptedFile(url, encryption, { signal, maxBytes: MAX_MODEL_BYTES });
    return bytes.slice().buffer;
  }
  const res = await fetch(url, { signal });
  if (!res.ok || !res.body) throw new Error(`Failed to fetch model: ${res.status}`);

  const total = Number(res.headers.get('content-length')) || 0;
  if (total > MAX_MODEL_BYTES) throw new Error('Model too large');

  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_MODEL_BYTES) {
      await reader.cancel();
      throw new Error('Model too large');
    }
    chunks.push(value);
    if (total) onProgress(Math.min(1, received / total));
  }

  const data = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return data.buffer;
}

/** Seconds per full turn of the idle spin. */
const AUTO_ROTATE_PERIOD_S = 40;

/** Seconds for the idle spin to come up to speed after the model returns home. */
const SPIN_FADE_IN_S = 2;

/** Time constant of a flick's slowdown, in seconds: long, so it coasts. */
const COAST_DECAY_S = 1.8;

/** Fastest a flick sends the model, in radians per second. */
const MAX_FLICK_SPEED = 6 * Math.PI;

/** How long the model is left alone before it goes home and spins again. */
const IDLE_RETURN_MS = 5_000;

/**
 * Interactive 3D view of a model attachment: drag or flick to turn it, pinch
 * or scroll to zoom, double-tap to put it back. Turns slowly on its own, and
 * goes back to that a few seconds after it's let go. Loaded on demand — it
 * pulls in three.js — and only after the viewer asks for it, since models can
 * be large.
 */
export default function ModelViewer({ url, format, encryption }: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [progress, setProgress] = useState<number>();

  useEffect(() => {
    const container = containerRef.current;
    const safe = sanitizeUrl(url);
    if (!container || !safe) {
      setStatus('error');
      return;
    }

    const abort = new AbortController();
    let disposed = false;
    let cleanup: (() => void) | undefined;
    setStatus('loading');
    setProgress(undefined);

    (async () => {
      const data = await fetchModel(safe, encryption, abort.signal, (fraction) => {
        if (!disposed) setProgress(fraction);
      });
      const model = await parseModel(data, format);
      if (disposed) return;

      const width = container.clientWidth || 400;
      const height = container.clientHeight || 300;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.domElement.className = 'block size-full touch-none';
      container.appendChild(renderer.domElement);

      const stage = stageModel(model, format, renderer, width / height);
      const canvas = renderer.domElement;

      // Zoom only: orbit controls pin the world's up axis, so once a model is
      // tipped toward the viewer a sideways drag spins it in place instead of
      // swinging it round. Turning is done below, on the model itself.
      const controls = new OrbitControls(stage.camera, canvas);
      controls.enableRotate = false;
      controls.enablePan = false;
      controls.enableDamping = true;
      controls.minDistance = stage.radius * 0.2;
      controls.maxDistance = stage.radius * 20;

      // A drag turns the model itself, as if turning it in your hand: sideways
      // about the true vertical, so an upright model stays upright, and up and
      // down about the screen's horizontal. Because it's the model that turns,
      // not the camera, a model tipped toward the viewer swings sideways on a
      // sideways drag rather than spinning in place.
      //
      // Not the screen's vertical: the camera looks down from slightly above,
      // so that axis leans back, and turning about it tilts an upright model.
      // The screen's horizontal has no such lean, since the camera never rolls.
      const worldUp = new THREE.Vector3(0, 1, 0);
      const screenRight = new THREE.Vector3();
      const turn = new THREE.Quaternion();
      const rotateBy = (dx: number, dy: number) => {
        stage.camera.updateMatrixWorld();
        screenRight.setFromMatrixColumn(stage.camera.matrixWorld, 0);
        stage.pivot.quaternion
          .premultiply(turn.setFromAxisAngle(worldUp, dx))
          .premultiply(turn.setFromAxisAngle(screenRight, dy))
          .normalize();
      };

      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      // `spin`: the idle turntable it opens with. `free`: in the viewer's
      // hands, or coasting from a flick. `returning`: easing back home after
      // being left alone, to spin again.
      let mode: 'spin' | 'free' | 'returning' = 'spin';
      // The idle spin fades in on its return rather than lurching to speed.
      let spinLevel = 1;
      // Radians per second, carried on after a flick and decaying slowly.
      const velocity = { x: 0, y: 0, at: 0 };
      let lastActivity = performance.now();
      const pointers = new Map<number, { x: number; y: number }>();

      // Each drag turns about one axis only, picked from its first few pixels.
      // No drag is perfectly straight, and turning about both axes at once
      // tips the model a little every time, until it's hopelessly askew.
      // Locked, a sideways drag keeps an upright model exactly upright, and an
      // up-down drag is exactly undone by dragging back.
      const drag = { startX: 0, startY: 0, axis: undefined as 'x' | 'y' | undefined };

      const homeCamera = stage.camera.position.clone();
      const homeTurn = new THREE.Quaternion();
      const lastTap = { at: -Infinity, x: 0, y: 0 };
      const goHome = () => {
        velocity.x = velocity.y = 0;
        mode = 'returning';
      };
      const takeHold = () => {
        mode = 'free';
        lastActivity = performance.now();
      };

      const onPointerDown = (e: PointerEvent) => {
        takeHold();
        velocity.x = velocity.y = 0;
        velocity.at = e.timeStamp;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        canvas.setPointerCapture(e.pointerId);
        drag.startX = e.clientX;
        drag.startY = e.clientY;
        drag.axis = undefined;
      };
      const onPointerMove = (e: PointerEvent) => {
        const last = pointers.get(e.pointerId);
        if (!last) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        lastActivity = performance.now();
        // Two fingers are a pinch, which the zoom controls handle.
        if (pointers.size !== 1) return;
        if (!drag.axis) {
          const ox = e.clientX - drag.startX;
          const oy = e.clientY - drag.startY;
          if (Math.hypot(ox, oy) < 8) return;
          drag.axis = Math.abs(ox) >= Math.abs(oy) ? 'x' : 'y';
        }
        // Half a turn per width dragged: enough to flip a model over in one
        // swipe, slow enough to aim.
        const radiansPerPixel = Math.PI / (canvas.clientWidth || 400);
        const dx = drag.axis === 'x' ? (e.clientX - last.x) * radiansPerPixel : 0;
        const dy = drag.axis === 'y' ? (e.clientY - last.y) * radiansPerPixel : 0;
        rotateBy(dx, dy);

        // Track the drag's speed, smoothed over the last few events, so a
        // flick carries on at the speed it left the finger.
        const dt = Math.max(0.004, (e.timeStamp - velocity.at) / 1000);
        velocity.x = velocity.x * 0.3 + (dx / dt) * 0.7;
        velocity.y = velocity.y * 0.3 + (dy / dt) * 0.7;
        velocity.at = e.timeStamp;
      };
      const onPointerUp = (e: PointerEvent) => {
        pointers.delete(e.pointerId);
        lastActivity = performance.now();
        // Only a release while still moving flings the model; not one after a
        // pause, and not a finger lifted mid-pinch.
        if (pointers.size > 0 || e.timeStamp - velocity.at > 80) {
          velocity.x = velocity.y = 0;
        } else {
          const speed = Math.hypot(velocity.x, velocity.y);
          if (speed > MAX_FLICK_SPEED) {
            velocity.x *= MAX_FLICK_SPEED / speed;
            velocity.y *= MAX_FLICK_SPEED / speed;
          }
        }

        // A tap is a release that never became a drag; two in quick
        // succession send the model home.
        if (e.type !== 'pointerup' || drag.axis || pointers.size > 0) return;
        if (e.timeStamp - lastTap.at < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
          goHome();
          lastTap.at = -Infinity;
        } else {
          Object.assign(lastTap, { at: e.timeStamp, x: e.clientX, y: e.clientY });
        }
      };
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointercancel', onPointerUp);
      // Zooming counts as handling it too.
      controls.addEventListener('start', takeHold);
      // Not `takeHold`: the controls end on every release, a double-tap's
      // included, which would cancel the trip home it just started.
      controls.addEventListener('end', () => { lastActivity = performance.now(); });

      const clock = new THREE.Clock();

      renderer.setAnimationLoop(() => {
        // Clamped so a frame after the tab was hidden doesn't jump.
        const delta = Math.min(clock.getDelta(), 0.1);

        if (mode === 'returning') {
          // Ease home, the same speed at any frame rate.
          const t = 1 - Math.exp(-delta * 3);
          stage.pivot.quaternion.slerp(homeTurn, t);
          stage.camera.position.lerp(homeCamera, t);
          if (stage.pivot.quaternion.angleTo(homeTurn) < 1e-3 && stage.camera.position.distanceTo(homeCamera) < stage.radius * 1e-3) {
            stage.pivot.quaternion.copy(homeTurn);
            stage.camera.position.copy(homeCamera);
            mode = 'spin';
            spinLevel = 0;
          }
        } else if (mode === 'spin') {
          if (!reduceMotion) {
            spinLevel = Math.min(1, spinLevel + delta / SPIN_FADE_IN_S);
            stage.pivot.rotateOnWorldAxis(worldUp, (spinLevel * delta * 2 * Math.PI) / AUTO_ROTATE_PERIOD_S);
          }
        } else if (pointers.size === 0) {
          // Coast, slowing gradually.
          if (velocity.x || velocity.y) {
            rotateBy(velocity.x * delta, velocity.y * delta);
            const decay = Math.exp(-delta / COAST_DECAY_S);
            velocity.x *= decay;
            velocity.y *= decay;
            if (Math.hypot(velocity.x, velocity.y) < 0.01) velocity.x = velocity.y = 0;
          }
          // Left alone, and no longer spinning faster than the idle spin: go home.
          const idle = performance.now() - lastActivity > IDLE_RETURN_MS;
          if (idle && Math.hypot(velocity.x, velocity.y) < (2 * Math.PI) / AUTO_ROTATE_PERIOD_S * 2) goHome();
        }

        controls.update();
        renderer.render(stage.scene, stage.camera);
      });

      const resize = new ResizeObserver(() => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (!w || !h) return;
        stage.camera.aspect = w / h;
        stage.camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      });
      resize.observe(container);

      cleanup = () => {
        resize.disconnect();
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerUp);
        renderer.setAnimationLoop(null);
        controls.dispose();
        stage.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
      setStatus('ready');
    })().catch(() => {
      if (!disposed) setStatus('error');
    });

    return () => {
      disposed = true;
      abort.abort();
      cleanup?.();
    };
  }, [url, format, encryption]);

  return (
    <div
      ref={containerRef}
      className="relative aspect-[4/3] w-full bg-gradient-to-b from-muted/40 to-muted"
      onClick={(e) => e.stopPropagation()}
    >
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" role="status">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          {progress !== undefined && progress < 1 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              <FormattedMessage
                id="modelViewer.progress"
                defaultMessage="{percent, number, ::percent}"
                values={{ percent: progress }}
              />
            </span>
          )}
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted-foreground">
          <FormattedMessage id="modelViewer.error" defaultMessage="This model couldn't be displayed." />
        </div>
      )}
    </div>
  );
}
