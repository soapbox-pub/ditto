import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import type { ModelFormat } from '@/lib/mediaUrls';

/**
 * three.js scene setup shared by the upload-time preview renderer and the
 * interactive viewer. Imported only on demand: three is several hundred KB
 * and nothing else in the app needs it.
 */

/** Surface for formats that carry geometry but no material (STL, PLY, bare OBJ). */
const DEFAULT_MATERIAL_COLOR = 0x94a3b8;

/** Formats whose files are conventionally Z-up (3D printing), unlike three's Y-up. */
const Z_UP_FORMATS = new Set<ModelFormat>(['stl', '3mf']);

function defaultMaterial(geometry: THREE.BufferGeometry): THREE.Material {
  return new THREE.MeshStandardMaterial({
    color: geometry.hasAttribute('color') ? 0xffffff : DEFAULT_MATERIAL_COLOR,
    vertexColors: geometry.hasAttribute('color'),
    roughness: 0.6,
    metalness: 0.1,
    flatShading: !geometry.hasAttribute('normal'),
  });
}

/**
 * Loader manager that keeps a model self-contained. A file can name buffers
 * and textures at any URL, and the loaders would fetch them as given, past
 * `sanitizeUrl` and `isLocalNetworkUrl`: a model could log the IP of whoever
 * opens it, or make their browser probe the local network. Only resources
 * carried in the file itself (data: URIs, and the blob: URLs loaders make
 * from embedded images) load; anything else becomes an empty data: URI, which
 * fails without touching the network, so the model renders without it or not
 * at all.
 */
function selfContainedManager(): THREE.LoadingManager {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => (/^(data|blob):/i.test(url) ? url : 'data:,'));
  return manager;
}

/** Parse a model file into a scene object. Outside resources it names are not loaded. */
export async function parseModel(data: ArrayBuffer, format: ModelFormat): Promise<THREE.Object3D> {
  const manager = selfContainedManager();
  switch (format) {
    case 'glb':
    case 'gltf': {
      const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.parseAsync(data, '');
      return gltf.scene;
    }
    case 'stl': {
      const geometry = new STLLoader().parse(data);
      return new THREE.Mesh(geometry, defaultMaterial(geometry));
    }
    case 'ply': {
      const geometry = new PLYLoader().parse(data);
      if (!geometry.hasAttribute('normal') && geometry.index) geometry.computeVertexNormals();
      // A PLY with no faces is a point cloud.
      if (!geometry.index) {
        return new THREE.Points(geometry, new THREE.PointsMaterial({
          size: 0.01,
          sizeAttenuation: true,
          vertexColors: geometry.hasAttribute('color'),
          color: geometry.hasAttribute('color') ? 0xffffff : DEFAULT_MATERIAL_COLOR,
        }));
      }
      return new THREE.Mesh(geometry, defaultMaterial(geometry));
    }
    case 'obj': {
      const group = new OBJLoader().parse(new TextDecoder().decode(data));
      // OBJ without an .mtl gets three's flat default; give it a lit surface.
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) child.material = defaultMaterial(child.geometry);
      });
      return group;
    }
    case '3mf':
      return new ThreeMFLoader(manager).parse(data);
    case 'fbx':
      return new FBXLoader(manager).parse(data, '');
    case 'dae': {
      const collada = new ColladaLoader(manager).parse(new TextDecoder().decode(data), '');
      if (!collada) throw new Error('Unreadable Collada file');
      return collada.scene;
    }
  }
}

/** A ready-to-render scene with the model centred and a camera framing it. */
export interface ModelStage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Holds the model, centred on its origin; turn this to turn the model. */
  pivot: THREE.Group;
  /** The model's bounding-sphere radius, for camera limits. */
  radius: number;
  dispose: () => void;
}

/** Light a model, centre it at the origin, and frame it from a three-quarter view. */
export function stageModel(model: THREE.Object3D, format: ModelFormat | undefined, renderer: THREE.WebGLRenderer, aspect: number): ModelStage {
  const scene = new THREE.Scene();

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envMap = pmrem.fromScene(room, 0.04).texture;
  scene.environment = envMap;
  room.dispose();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(3, 5, 4);
  scene.add(key);

  if (format && Z_UP_FORMATS.has(format)) model.rotation.x = -Math.PI / 2;

  // Centre on the origin; models arrive in arbitrary units and offsets.
  const pivot = new THREE.Group();
  pivot.add(model);
  scene.add(pivot);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Number.isFinite(sphere.radius) && sphere.radius > 0 ? sphere.radius : 1;
  model.position.sub(sphere.center);

  // Point clouds sized in model units, not the default 0.01. A model can ask
  // for bigger points with `userData.pointsPerRadius`.
  model.traverse((child) => {
    if (child instanceof THREE.Points && child.material instanceof THREE.PointsMaterial) {
      child.material.size = radius / (child.userData.pointsPerRadius ?? 200);
    }
  });

  const fov = 35;
  const camera = new THREE.PerspectiveCamera(fov, aspect, radius / 100, radius * 100);
  const distance = radius / Math.sin(THREE.MathUtils.degToRad(fov / 2)) * 1.05;
  camera.position.copy(new THREE.Vector3(1, 0.7, 1.2).normalize().multiplyScalar(distance));
  camera.lookAt(0, 0, 0);

  return {
    scene,
    camera,
    pivot,
    radius,
    dispose: () => {
      envMap.dispose();
      pmrem.dispose();
      disposeObject(scene);
    },
  };
}

/** Free every geometry, material and texture under an object. */
function disposeObject(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.Line) {
      child.geometry.dispose();
      const materials: THREE.Material[] = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) value.dispose();
        }
        material.dispose();
      }
    }
  });
}

/**
 * Render a still of a model file, for the imeta `image` preview. Resolves
 * `undefined` when the file can't be parsed or WebGL isn't available.
 */
export async function renderModelPreview(
  data: ArrayBuffer,
  format: ModelFormat,
  width = 1200,
  height = 900,
): Promise<Blob | undefined> {
  try {
    return await renderStill(await parseModel(data, format), format, width, height);
  } catch {
    return undefined;
  }
}

/**
 * Render a still of a scene object as a PNG, framed the way the interactive
 * viewer opens. Resolves `undefined` when WebGL isn't available.
 */
export async function renderStill(
  model: THREE.Object3D,
  format: ModelFormat | undefined,
  width: number,
  height: number,
): Promise<Blob | undefined> {
  let renderer: THREE.WebGLRenderer | undefined;
  let stage: ModelStage | undefined;
  try {
    const canvas = document.createElement('canvas');
    // Transparent, so the still sits on whatever the card behind it is, as the live viewer does.
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    stage = stageModel(model, format, renderer, width / height);
    renderer.render(stage.scene, stage.camera);

    return await new Promise<Blob | undefined>((resolve) => {
      canvas.toBlob((blob) => resolve(blob ?? undefined), 'image/png');
    });
  } catch {
    return undefined;
  } finally {
    stage?.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}
