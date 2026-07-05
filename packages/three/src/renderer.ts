import * as THREE from 'three';
import { createWorldHeightSampler } from '@map-engine/core';
import type { MapLayerId, MapWorld } from '@map-engine/core';
import { buildTerrainGroup } from './terrainMesh';
import { buildWaterMesh } from './waterMesh';
import { buildRoadsMesh } from './roadMesh';
import { buildBuildingsGroup, type BuildingsBuildResult } from './buildingsMesh';
import { buildTreesGroup } from './treesMesh';
import { buildLandmarksGroup } from './landmarksGroup';
import { createEmitter } from './events';
import { createCameraRig } from './cameraRig';
import {
  buildPickableIndex,
  createHighlights,
  createPicker,
  type Highlights,
  type MapObjectHit,
  type PickableInfo,
} from './interaction';

export type CameraMode = 'orbit' | 'fly' | 'walk';
export type EnvironmentMode = 'day' | 'golden-hour' | 'night';

export type MapEngineEvents = {
  'object:hover': { objectId: string | null };
  'object:selected': { objectId: string; objectType: 'building' | 'landmark' };
  'object:cleared': Record<string, never>;
  'camera:changed': { position: { x: number; y: number; z: number }; mode: CameraMode };
  'world:loaded': { worldId: string };
};

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
  pickObject(pointer: { x: number; y: number }): MapObjectHit | null;
  focusObject(objectId: string): Promise<void>;
  setSelected(objectId: string | null): void;
  getSelected(): string | null;
  setHovered(objectId: string | null): void;
  goHome(): void;
  on<K extends keyof MapEngineEvents>(
    event: K,
    handler: (payload: MapEngineEvents[K]) => void,
  ): () => void;
  onFrame(cb: (dt: number) => void): () => void;
  dispose(): void;
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
      obj.geometry.dispose();
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of materials) {
        for (const value of Object.values(m)) {
          if (value instanceof THREE.Texture) value.dispose();
        }
        m.dispose();
      }
    }
  });
}

export function createThreeMapRenderer(options: ThreeMapRendererOptions): ThreeMapRenderer {
  const { container } = options;

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
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
  camera.position.set(300, 250, 300);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x687a8c, 0.9);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(400, 600, 200);
  scene.add(hemi, sun);

  const emitter = createEmitter<MapEngineEvents>();
  const rig = createCameraRig(camera, renderer.domElement);
  rig.onChange((mode) => {
    emitter.emit('camera:changed', {
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      mode,
    });
  });

  const layerGroups = new Map<MapLayerId, THREE.Object3D>();
  let worldRoot: THREE.Group | null = null;
  let currentWorld: MapWorld | null = null;
  let buildingsResult: BuildingsBuildResult | null = null;
  let landmarksGroup: THREE.Group | null = null;
  let pickables = new Map<string, PickableInfo>();
  let highlights: Highlights | null = null;
  let hoveredId: string | null = null;
  let selectedId: string | null = null;

  const picker = createPicker(camera, renderer.domElement, () => ({
    buildings: buildingsResult,
    landmarks: landmarksGroup,
    terrain: layerGroups.get('terrain') ?? null,
  }));

  const applyEnvironment = (mode: EnvironmentMode): void => {
    // Full golden-hour/night treatment lands in Phase 7.
    if (mode === 'day') {
      scene.background = new THREE.Color('#cfe3f5');
      scene.fog = new THREE.Fog(0xcfe3f5, 800, 3600);
      hemi.intensity = 0.9;
      sun.intensity = 1.6;
    }
    buildingsResult?.setNightMode(mode === 'night');
  };
  applyEnvironment('day');

  const homeView = (): void => {
    if (!currentWorld) return;
    const half = (currentWorld.config.chunksX * currentWorld.config.chunkSize) / 2;
    rig.goHome(
      new THREE.Vector3(half * 0.9, half * 0.7, half * 0.9),
      new THREE.Vector3(0, 0, 0),
    );
  };

  // --- Selection state -------------------------------------------------------
  const setHovered = (objectId: string | null): void => {
    if (objectId === hoveredId) return;
    hoveredId = objectId;
    highlights?.setHover(objectId ? (pickables.get(objectId) ?? null) : null);
    renderer.domElement.style.cursor = objectId ? 'pointer' : '';
    emitter.emit('object:hover', { objectId });
  };

  const setSelected = (objectId: string | null): void => {
    if (objectId === selectedId) return;
    selectedId = objectId;
    const info = objectId ? pickables.get(objectId) : null;
    highlights?.setSelected(info ?? null);
    if (objectId && info) {
      emitter.emit('object:selected', { objectId, objectType: info.type });
    } else {
      emitter.emit('object:cleared', {});
    }
  };

  const focusObject = async (objectId: string): Promise<void> => {
    const info = pickables.get(objectId);
    if (!info) return;
    const point = info.position.clone();
    point.y += Math.min(info.height * 0.4, 30);
    await rig.focusOn(point, Math.max(info.radius, info.height * 0.3));
  };

  // --- Pointer interaction -----------------------------------------------------
  let pointerDownPos: { x: number; y: number } | null = null;
  let lastHoverCheck = 0;
  let lastPointer: { x: number; y: number } | null = null;

  const onPointerDown = (e: PointerEvent): void => {
    pointerDownPos = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent): void => {
    if (!pointerDownPos) return;
    const moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
    pointerDownPos = null;
    if (moved > 5 || e.button !== 0) return;
    // Treat as a click: select or clear.
    const hit = picker.pick(e.clientX, e.clientY);
    setSelected(hit ? hit.objectId : null);
  };
  const onDblClick = (e: MouseEvent): void => {
    const hit = picker.pick(e.clientX, e.clientY);
    if (hit) {
      setSelected(hit.objectId);
      void focusObject(hit.objectId);
      return;
    }
    const ground = picker.pickGround(e.clientX, e.clientY);
    if (ground) void rig.focusOn(ground, 40);
  };
  const onPointerMoveHover = (e: PointerEvent): void => {
    lastPointer = { x: e.clientX, y: e.clientY };
  };
  const onKeyDownEsc = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') setSelected(null);
  };

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('dblclick', onDblClick);
  renderer.domElement.addEventListener('pointermove', onPointerMoveHover);
  window.addEventListener('keydown', onKeyDownEsc);

  // --- Frame loop ---------------------------------------------------------------
  const frameCallbacks = new Set<(dt: number) => void>();
  let rafId = 0;
  let lastTime = performance.now();
  const loop = (): void => {
    rafId = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    rig.update(dt);

    // Throttled hover picking (skip while pointer-locked in walk mode).
    if (
      lastPointer &&
      now - lastHoverCheck > 90 &&
      document.pointerLockElement !== renderer.domElement
    ) {
      lastHoverCheck = now;
      const hit = picker.pick(lastPointer.x, lastPointer.y);
      setHovered(hit ? hit.objectId : null);
    }

    highlights?.tick(now / 1000);
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
      setSelected(null);
      setHovered(null);
      if (worldRoot) {
        scene.remove(worldRoot);
        disposeObject(worldRoot);
        layerGroups.clear();
      }
      highlights?.dispose();

      currentWorld = world;
      worldRoot = new THREE.Group();
      worldRoot.name = 'world';

      const terrain = buildTerrainGroup(world);
      const water = buildWaterMesh(world);
      const roads = buildRoadsMesh(world);
      buildingsResult = buildBuildingsGroup(world);
      const trees = buildTreesGroup(world);
      landmarksGroup = buildLandmarksGroup(world);

      layerGroups.set('terrain', terrain);
      layerGroups.set('water', water);
      layerGroups.set('roads', roads);
      layerGroups.set('buildings', buildingsResult.group);
      layerGroups.set('trees', trees);
      layerGroups.set('landmarks', landmarksGroup);
      worldRoot.add(terrain, water, roads, buildingsResult.group, trees, landmarksGroup);
      scene.add(worldRoot);

      pickables = buildPickableIndex(world, landmarksGroup);
      highlights = createHighlights(scene);
      rig.setTerrain(createWorldHeightSampler(world), world.config.waterLevel);
      homeView();
      emitter.emit('world:loaded', { worldId: world.id });
    },

    setCameraMode(mode: CameraMode): void {
      rig.setMode(mode);
    },

    getCameraMode(): CameraMode {
      return rig.getMode();
    },

    setEnvironment(mode: EnvironmentMode): void {
      applyEnvironment(mode);
    },

    setLayerVisibility(layer: MapLayerId, visible: boolean): void {
      const group = layerGroups.get(layer);
      if (group) group.visible = visible;
    },

    pickObject(pointer: { x: number; y: number }): MapObjectHit | null {
      return picker.pick(pointer.x, pointer.y);
    },

    focusObject,
    setSelected,
    getSelected: () => selectedId,
    setHovered,

    goHome(): void {
      homeView();
    },

    on(event, handler) {
      return emitter.on(event, handler);
    },

    onFrame(cb: (dt: number) => void): () => void {
      frameCallbacks.add(cb);
      return () => frameCallbacks.delete(cb);
    },

    dispose(): void {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDownEsc);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('dblclick', onDblClick);
      renderer.domElement.removeEventListener('pointermove', onPointerMoveHover);
      rig.dispose();
      highlights?.dispose();
      if (worldRoot) disposeObject(worldRoot);
      renderer.dispose();
      renderer.domElement.remove();
      frameCallbacks.clear();
      emitter.clear();
    },
  };
}
