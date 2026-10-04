import * as THREE from 'three';

import type { SnoNode } from '@/hooks/useSnoTree';
import { renderStill } from '@/lib/modelRenderer';
import { TICKS_PER_UNIT, type SnoObject } from '@/lib/sno';

/**
 * Turns a resolved Simple Nostr Object into three.js objects. Imported only
 * on demand, with three.
 */

/** Placements drawn at most; past this a tree is cut short rather than taking the tab down. */
const MAX_INSTANCES = 10_000;

/** The reference placeholder for a part that can't be drawn: a wireframe unit cube (§1.10). */
const PLACEHOLDER_COLOR = 0x94a3b8;

/** Point size as a fraction of the whole model's radius; set by `stageModel`. */
const POINTS_PER_RADIUS = 80;

/** sRGB palette colors into three's linear working space, three floats per vertex. */
function linearColors(colors: [number, number, number][]): Float32Array {
  const out = new Float32Array(colors.length * 3);
  const color = new THREE.Color();
  colors.forEach(([r, g, b], i) => {
    color.setRGB(r, g, b, THREE.SRGBColorSpace);
    out[i * 3] = color.r;
    out[i * 3 + 1] = color.g;
    out[i * 3 + 2] = color.b;
  });
  return out;
}

/** The drawables for one object's own geometry, in its model units. */
function buildOwnGeometry(object: SnoObject): THREE.Object3D[] {
  const vertexCount = object.colors.length;
  if (!vertexCount) return [];

  const positions = new Float32Array(object.positions.length);
  for (let i = 0; i < positions.length; i++) positions[i] = object.positions[i] / TICKS_PER_UNIT;
  const colors = linearColors(object.colors);
  const drawables: THREE.Object3D[] = [];
  const hasFaces = object.faces.length > 0;

  if (object.mode === 'solid' && hasFaces) {
    // Unindexed, so every face has corners of its own: a face color fills the
    // whole triangle with a hard seam at its edges (§1.4a), and normals come
    // out flat, from each face's winding (§4).
    const faceColors = object.faceColorIndices ? linearColors(object.faceColorIndices.map((i) => object.palette[i])) : undefined;
    const triPositions = new Float32Array(object.faces.length * 9);
    const triColors = new Float32Array(object.faces.length * 9);
    object.faces.forEach((face, f) => {
      face.forEach((v, corner) => {
        const o = f * 9 + corner * 3;
        triPositions.set(positions.subarray(v * 3, v * 3 + 3), o);
        triColors.set(faceColors ? faceColors.subarray(f * 3, f * 3 + 3) : colors.subarray(v * 3, v * 3 + 3), o);
      });
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(triPositions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(triColors, 3));
    geometry.computeVertexNormals();
    // Lit, so faces read as faces rather than a flat silhouette (§4 allows
    // it), but untouched by tone mapping and scaled so the face nearest the
    // stage's key light lands at about its palette color: a neon palette
    // stays neon instead of washing out to pastel. Both sides, never culled:
    // objects are often open shells (§1.4).
    drawables.push(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      color: new THREE.Color(0.55, 0.55, 0.55),
      toneMapped: false,
    })));
    return drawables;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  if (object.mode === 'lines') {
    const material = new THREE.LineBasicMaterial({ vertexColors: true });
    if (hasFaces) {
      // Each edge once, deduplicated on vertex indices, never on floats (§1.2).
      const seen = new Set<number>();
      const edges: number[] = [];
      for (const [a, b, c] of object.faces) {
        for (const [u, v] of [[a, b], [b, c], [c, a]]) {
          const key = Math.min(u, v) * vertexCount + Math.max(u, v);
          if (seen.has(key)) continue;
          seen.add(key);
          edges.push(u, v);
        }
      }
      geometry.setIndex(edges);
      drawables.push(new THREE.LineSegments(geometry, material));
    } else {
      drawables.push(new THREE.Line(geometry, material));
    }
  }

  // Points mode, plus the vertices of a line drawing so it stays visible
  // when small, and a solid with nothing to fill.
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ vertexColors: true, sizeAttenuation: true }));
  points.userData.pointsPerRadius = POINTS_PER_RADIUS;
  drawables.push(points);
  return drawables;
}

function placeholder(): THREE.Object3D {
  const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: PLACEHOLDER_COLOR }));
}

/**
 * Build a resolved object and everything it places as one scene object, in
 * the root's model units. An object placed many times is built once and its
 * geometry shared between its placements.
 */
export function buildSnoObject(root: SnoNode): THREE.Object3D {
  const built = new Map<SnoObject, THREE.Object3D[]>();
  let instances = 0;

  const build = (node: SnoNode): THREE.Group => {
    const group = new THREE.Group();
    let own = built.get(node.object);
    if (!own) {
      own = buildOwnGeometry(node.object);
      built.set(node.object, own);
      for (const drawable of own) group.add(drawable);
    } else {
      // `clone` shares geometry and material.
      for (const drawable of own) group.add(drawable.clone());
    }

    for (const { part, node: child } of node.parts) {
      if (++instances > MAX_INSTANCES) break;
      const placed = child ? build(child) : placeholder();
      placed.position.set(part.offset[0], part.offset[1], part.offset[2]).divideScalar(TICKS_PER_UNIT);
      // About the parent's X, then Y, then Z: extrinsic XYZ is three's intrinsic ZYX.
      placed.rotation.set(
        THREE.MathUtils.degToRad(part.rotation[0]),
        THREE.MathUtils.degToRad(part.rotation[1]),
        THREE.MathUtils.degToRad(part.rotation[2]),
        'ZYX',
      );
      if (child) placed.scale.setScalar(2 ** (child.object.unit + part.step - node.object.unit));
      group.add(placed);
    }
    return group;
  };

  return build(root);
}

/** A still of a resolved object as a data: URL, or `undefined` without WebGL. */
export async function renderSnoPreview(root: SnoNode, width: number, height: number): Promise<string | undefined> {
  const blob = await renderStill(buildSnoObject(root), undefined, width, height);
  if (!blob) return undefined;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : undefined);
    reader.onerror = () => resolve(undefined);
    reader.readAsDataURL(blob);
  });
}
