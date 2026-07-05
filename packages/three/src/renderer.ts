import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { MapLayerId, MapWorld } from '@map-engine/core';
import { buildTerrainGroup } from './terrainMesh';
import { buildWaterMesh } from './waterMesh';
import { buildRoadsMesh } from './roadMesh';

export type CameraMode = 'orbit' | 'fly' | 'walk';
export type EnvironmentMode = 'day' | 'golden-hour' | 'night';

export type ThreeMapRendererOptions = {
  container: HTMLElement;
};

export interface ThreeMapRenderer {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly domElement: HTMLCanvasElement;
  loadWorld(world: MapWorld): Promise<void>;
  setCameraMode(mode: CameraMode): void;
  getCameraMode(): CameraMode;
  setEnvironment(mode: EnvironmentMode): void;
  setLayerVisibility(layer: MapLayerId, visible: boolean): void;
  goHome(): void;
  onFrame(cb: (dt: number) => void): () => void;
  dispose(): void;
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of materials) m.dispose();
    }
  });
}

export function createThreeMapRenderer(options: ThreeMapRendererOptions): ThreeMapRenderer {
  const { container } = options;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    55,
    container.clientWidth / container.clientHeight,
    0.5,
    6000,
  );

  const hemi = new THREE.HemisphereLight(0xffffff, 0x687a8c, 0.9);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(400, 600, 200);
  scene.add(hemi, sun);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;

  const layerGroups = new Map<MapLayerId, THREE.Object3D>();
  let worldRoot: THREE.Group | null = null;
  let currentWorld: MapWorld | null = null;
  let cameraMode: CameraMode = 'orbit';

  const applyEnvironment = (mode: EnvironmentMode): void => {
    // Full day/golden-hour/night treatment lands in Phase 7; default is day.
    if (mode === 'day') {
      scene.background = new THREE.Color('#cfe3f5');
      scene.fog = new THREE.Fog(0xcfe3f5, 800, 3600);
      hemi.intensity = 0.9;
      sun.intensity = 1.6;
    }
  };
  applyEnvironment('day');

  const homeView = (): void => {
    if (!currentWorld) {
      camera.position.set(300, 250, 300);
      controls.target.set(0, 0, 0);
      return;
    }
    const half = (currentWorld.config.chunksX * currentWorld.config.chunkSize) / 2;
    camera.position.set(half * 0.9, half * 0.75, half * 0.9);
    controls.target.set(0, 0, 0);
    controls.update();
  };

  const frameCallbacks = new Set<(dt: number) => void>();
  let rafId = 0;
  let lastTime = performance.now();
  const loop = (): void => {
    rafId = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    controls.update();
    for (const cb of frameCallbacks) cb(dt);
    renderer.render(scene, camera);
  };
  loop();

  const onResize = (): void => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  window.addEventListener('resize', onResize);

  return {
    scene,
    camera,
    domElement: renderer.domElement,

    async loadWorld(world: MapWorld): Promise<void> {
      if (worldRoot) {
        scene.remove(worldRoot);
        disposeObject(worldRoot);
        layerGroups.clear();
      }
      currentWorld = world;
      worldRoot = new THREE.Group();
      worldRoot.name = 'world';

      const terrain = buildTerrainGroup(world);
      const water = buildWaterMesh(world);
      const roads = buildRoadsMesh(world);
      layerGroups.set('terrain', terrain);
      layerGroups.set('water', water);
      layerGroups.set('roads', roads);
      worldRoot.add(terrain, water, roads);
      scene.add(worldRoot);
      homeView();
    },

    setCameraMode(mode: CameraMode): void {
      // Fly/Walk arrive in Phase 5; orbit is the only mode for now.
      cameraMode = mode;
    },

    getCameraMode(): CameraMode {
      return cameraMode;
    },

    setEnvironment(mode: EnvironmentMode): void {
      applyEnvironment(mode);
    },

    setLayerVisibility(layer: MapLayerId, visible: boolean): void {
      const group = layerGroups.get(layer);
      if (group) group.visible = visible;
    },

    goHome(): void {
      homeView();
    },

    onFrame(cb: (dt: number) => void): () => void {
      frameCallbacks.add(cb);
      return () => frameCallbacks.delete(cb);
    },

    dispose(): void {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      if (worldRoot) disposeObject(worldRoot);
      renderer.dispose();
      renderer.domElement.remove();
      frameCallbacks.clear();
    },
  };
}
