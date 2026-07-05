import * as THREE from 'three';
import {
  addBuildingToWorld,
  emptyOverlay,
  moveFootprint,
  removeBuildingFromWorld,
  replaceBuildingInWorld,
  rotateFootprint,
} from '@map-engine/core';
import type { BuildingInfo, EditOverlay, MapWorld } from '@map-engine/core';
import type { ThreeMapRenderer } from './renderer';

type Command = { label: string; apply(): void; revert(): void };

export type EditorState = {
  enabled: boolean;
  addMode: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** Bumped on every change so UIs can re-render. */
  tick: number;
};

export type BuildingEditor = {
  setEnabled(v: boolean): void;
  getState(): EditorState;
  onChange(cb: () => void): () => void;
  getBuilding(id: string): BuildingInfo | null;
  setFloors(id: string, floors: number): void;
  rename(id: string, name: string, description?: string): void;
  rotate(id: string, degrees: number): void;
  deleteBuilding(id: string): void;
  setAddMode(v: boolean): void;
  undo(): void;
  redo(): void;
  getOverlay(): EditOverlay;
  dispose(): void;
};

const HISTORY_CAP = 100;

export function createBuildingEditor(
  renderer: ThreeMapRenderer,
  world: MapWorld,
  options: { initialOverlay?: EditOverlay; onOverlayChange?: (overlay: EditOverlay) => void } = {},
): BuildingEditor {
  const state: EditorState = { enabled: false, addMode: false, canUndo: false, canRedo: false, tick: 0 };
  const listeners = new Set<() => void>();
  const history: Command[] = [];
  let historyIndex = -1;

  // Overlay bookkeeping (seeded from persisted edits).
  const modifiedIds = new Set<string>(options.initialOverlay?.modified.map((b) => b.id));
  const addedIds = new Set<string>(options.initialOverlay?.added.map((b) => b.id));
  const deletedIds = new Set<string>(options.initialOverlay?.deleted);
  let userCounter = addedIds.size;

  const buildingOf = (id: string): BuildingInfo | null => {
    const obj = world.objects[id];
    return obj?.objectType === 'building' ? obj.building : null;
  };

  const getOverlay = (): EditOverlay => {
    const overlay = emptyOverlay();
    for (const id of deletedIds) {
      if (!addedIds.has(id)) overlay.deleted.push(id);
    }
    for (const id of addedIds) {
      const b = buildingOf(id);
      if (b) overlay.added.push(structuredClone(b));
    }
    for (const id of modifiedIds) {
      if (addedIds.has(id) || deletedIds.has(id)) continue;
      const b = buildingOf(id);
      if (b) overlay.modified.push(structuredClone(b));
    }
    return overlay;
  };

  const notify = (): void => {
    state.canUndo = historyIndex >= 0;
    state.canRedo = historyIndex < history.length - 1;
    state.tick += 1;
    listeners.forEach((cb) => cb());
    options.onOverlayChange?.(getOverlay());
  };

  const commit = (command: Command): void => {
    command.apply();
    history.splice(historyIndex + 1);
    history.push(command);
    if (history.length > HISTORY_CAP) history.shift();
    historyIndex = history.length - 1;
    renderer.refreshBuildings();
    notify();
  };

  /** Snapshot-swap command for any mutation of an existing building. */
  const mutateCommand = (label: string, id: string, mutate: (b: BuildingInfo) => void): Command => {
    const before = structuredClone(buildingOf(id)!);
    const after = structuredClone(before);
    mutate(after);
    return {
      label,
      apply() {
        replaceBuildingInWorld(world, structuredClone(after));
        modifiedIds.add(id);
      },
      revert() {
        replaceBuildingInWorld(world, structuredClone(before));
        // Stays in modifiedIds — the snapshot equals the original again, harmless.
      },
    };
  };

  // --- Drag-to-move + add-mode pointer handling --------------------------------
  const ghostMat = new THREE.MeshLambertMaterial({
    color: '#7ec5ff',
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const ghostGeo = new THREE.BoxGeometry(1, 1, 1);
  ghostGeo.translate(0, 0.5, 0);
  const ghost = new THREE.Mesh(ghostGeo, ghostMat);
  ghost.visible = false;
  ghost.renderOrder = 20;
  renderer.scene.add(ghost);

  let dragging: { id: string; start: BuildingInfo } | null = null;

  const footprintSize = (b: BuildingInfo): { w: number; d: number } => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of b.footprint) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    return { w: maxX - minX, d: maxY - minY };
  };

  const showGhost = (b: BuildingInfo, x: number, y: number, z: number): void => {
    const { w, d } = footprintSize(b);
    ghost.scale.set(w, b.height, d);
    ghost.position.set(x, y, z);
    ghost.visible = true;
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (!state.enabled || state.addMode || e.button !== 0) return;
    const hit = renderer.pickObject({ x: e.clientX, y: e.clientY });
    if (!hit || hit.objectId !== renderer.getSelected()) return;
    const b = buildingOf(hit.objectId);
    if (!b) return;
    dragging = { id: b.id, start: structuredClone(b) };
    renderer.setEditorDragging(true);
    showGhost(b, b.position.x, b.position.y, b.position.z);
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (!dragging) return;
    const g = renderer.pickGround({ x: e.clientX, y: e.clientY });
    if (g) showGhost(dragging.start, g.x, g.y, g.z);
  };

  const onPointerUp = (e: PointerEvent): void => {
    if (state.enabled && state.addMode && e.button === 0) {
      const g = renderer.pickGround({ x: e.clientX, y: e.clientY });
      if (g) {
        userCounter += 1;
        const id = `bldg:user:${userCounter}`;
        const building: BuildingInfo = {
          id,
          name: `New Building ${userCounter}`,
          type: 'company',
          description: 'Placed in the editor.',
          districtId: world.districts[0]?.id ?? 'd:user',
          position: { x: g.x, y: g.y, z: g.z },
          footprint: [
            { x: g.x - 7, y: g.z - 7 },
            { x: g.x + 7, y: g.z - 7 },
            { x: g.x + 7, y: g.z + 7 },
            { x: g.x - 7, y: g.z + 7 },
          ],
          height: 8 * 3.1,
          floors: 8,
          tags: ['Custom'],
          source: 'user-defined',
        };
        commit({
          label: 'add building',
          apply() {
            addBuildingToWorld(world, structuredClone(building));
            addedIds.add(id);
            deletedIds.delete(id);
          },
          revert() {
            removeBuildingFromWorld(world, id);
            addedIds.delete(id);
          },
        });
        state.addMode = false;
        renderer.setSelected(id);
        notify();
      }
      return;
    }

    if (!dragging) return;
    const g = renderer.pickGround({ x: e.clientX, y: e.clientY });
    const drag = dragging;
    dragging = null;
    ghost.visible = false;
    renderer.setEditorDragging(false);
    if (!g) return;
    const dist = Math.hypot(g.x - drag.start.position.x, g.z - drag.start.position.z);
    if (dist < 1) return; // click, not a drag
    commit(
      mutateCommand('move building', drag.id, (b) => {
        b.footprint = moveFootprint(b, g.x, g.z);
        b.position = { x: g.x, y: g.y, z: g.z };
      }),
    );
  };

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  return {
    setEnabled(v: boolean): void {
      state.enabled = v;
      if (!v) {
        state.addMode = false;
        dragging = null;
        ghost.visible = false;
        renderer.setEditorDragging(false);
      }
      notify();
    },

    getState: () => ({ ...state }),

    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    getBuilding: (id) => buildingOf(id),

    setFloors(id, floors) {
      const clamped = Math.max(1, Math.min(80, Math.round(floors)));
      commit(
        mutateCommand('set floors', id, (b) => {
          b.floors = clamped;
          b.height = clamped * 3.1;
        }),
      );
    },

    rename(id, name, description) {
      commit(
        mutateCommand('rename', id, (b) => {
          b.name = name;
          if (description !== undefined) b.description = description;
        }),
      );
    },

    rotate(id, degrees) {
      commit(
        mutateCommand('rotate', id, (b) => {
          b.footprint = rotateFootprint(b, (degrees * Math.PI) / 180);
        }),
      );
    },

    deleteBuilding(id) {
      const snapshot = structuredClone(buildingOf(id));
      if (!snapshot) return;
      const wasAdded = addedIds.has(id);
      renderer.setSelected(null);
      commit({
        label: 'delete building',
        apply() {
          removeBuildingFromWorld(world, id);
          deletedIds.add(id);
          if (wasAdded) addedIds.delete(id);
        },
        revert() {
          addBuildingToWorld(world, structuredClone(snapshot));
          deletedIds.delete(id);
          if (wasAdded) addedIds.add(id);
        },
      });
    },

    setAddMode(v) {
      state.addMode = v;
      notify();
    },

    undo() {
      if (historyIndex < 0) return;
      history[historyIndex]!.revert();
      historyIndex -= 1;
      renderer.refreshBuildings();
      notify();
    },

    redo() {
      if (historyIndex >= history.length - 1) return;
      historyIndex += 1;
      history[historyIndex]!.apply();
      renderer.refreshBuildings();
      notify();
    },

    getOverlay,

    dispose() {
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.scene.remove(ghost);
      ghost.geometry.dispose();
      ghostMat.dispose();
      listeners.clear();
    },
  };
}
