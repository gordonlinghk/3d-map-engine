import * as THREE from 'three';
import {
  addBuildingToWorld,
  addPoiToWorld,
  emptyOverlay,
  moveFootprint,
  removeBuildingFromWorld,
  removePoiFromWorld,
  replaceBuildingInWorld,
  rotateFootprint,
} from '@map-engine/core';
import type { BuildingInfo, EditOverlay, MapWorld, PoiIcon, PoiInfo } from '@map-engine/core';
import type { ThreeMapRenderer } from './renderer';

type Command = {
  label: string;
  apply(): void;
  revert(): void;
  /** Which layer to rebuild after apply/revert. Defaults to 'buildings'. */
  refresh?: 'buildings' | 'pois';
};

export type EditorState = {
  enabled: boolean;
  addMode: boolean;
  poiMode: boolean;
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
  getPoi(id: string): PoiInfo | null;
  setPoiMode(v: boolean): void;
  renamePoi(id: string, name: string, description?: string): void;
  setPoiIcon(id: string, icon: PoiIcon): void;
  deletePoi(id: string): void;
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
  const state: EditorState = {
    enabled: false,
    addMode: false,
    poiMode: false,
    canUndo: false,
    canRedo: false,
    tick: 0,
  };
  const listeners = new Set<() => void>();
  const history: Command[] = [];
  let historyIndex = -1;

  // Overlay bookkeeping (seeded from persisted edits).
  const modifiedIds = new Set<string>(options.initialOverlay?.modified.map((b) => b.id));
  const addedIds = new Set<string>(options.initialOverlay?.added.map((b) => b.id));
  const deletedIds = new Set<string>(options.initialOverlay?.deleted);
  let userCounter = addedIds.size;

  const addedPoiIds = new Set<string>(options.initialOverlay?.addedPois.map((p) => p.id));
  const modifiedPoiIds = new Set<string>(options.initialOverlay?.modifiedPois.map((p) => p.id));
  const deletedPoiIds = new Set<string>(options.initialOverlay?.deletedPois);
  let poiCounter = addedPoiIds.size;

  const buildingOf = (id: string): BuildingInfo | null => {
    const obj = world.objects[id];
    return obj?.objectType === 'building' ? obj.building : null;
  };

  const poiOf = (id: string): PoiInfo | null => {
    const obj = world.objects[id];
    return obj?.objectType === 'poi' ? obj.poi : null;
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
    for (const id of deletedPoiIds) {
      if (!addedPoiIds.has(id)) overlay.deletedPois.push(id);
    }
    for (const id of addedPoiIds) {
      const p = poiOf(id);
      if (p) overlay.addedPois.push(structuredClone(p));
    }
    for (const id of modifiedPoiIds) {
      if (addedPoiIds.has(id) || deletedPoiIds.has(id)) continue;
      const p = poiOf(id);
      if (p) overlay.modifiedPois.push(structuredClone(p));
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

  const refreshFor = (command: Command): void => {
    if (command.refresh === 'pois') renderer.refreshPois();
    else renderer.refreshBuildings();
  };

  const commit = (command: Command): void => {
    command.apply();
    history.splice(historyIndex + 1);
    history.push(command);
    if (history.length > HISTORY_CAP) history.shift();
    historyIndex = history.length - 1;
    refreshFor(command);
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

  /** Replace a POI's data in place (position may have moved chunks). */
  const replacePoiInWorld = (p: PoiInfo): void => {
    removePoiFromWorld(world, p.id);
    addPoiToWorld(world, p);
  };

  /** Snapshot-swap command for any mutation of an existing POI. */
  const mutatePoiCommand = (label: string, id: string, mutate: (p: PoiInfo) => void): Command => {
    const before = structuredClone(poiOf(id)!);
    const after = structuredClone(before);
    mutate(after);
    return {
      label,
      refresh: 'pois',
      apply() {
        replacePoiInWorld(structuredClone(after));
        modifiedPoiIds.add(id);
      },
      revert() {
        replacePoiInWorld(structuredClone(before));
        // Stays in modifiedPoiIds — the snapshot equals the original again, harmless.
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
    if (!state.enabled || state.addMode || state.poiMode || e.button !== 0) return;
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
    if (state.enabled && state.poiMode && e.button === 0) {
      const g = renderer.pickGround({ x: e.clientX, y: e.clientY });
      if (g) {
        poiCounter += 1;
        const id = `poi:user:${poiCounter}`;
        const poi: PoiInfo = {
          id,
          name: `標註 ${poiCounter}`,
          icon: 'flag',
          position: { x: g.x, y: g.y, z: g.z },
          tags: [],
          source: 'user-defined',
        };
        commit({
          label: 'add poi',
          refresh: 'pois',
          apply() {
            addPoiToWorld(world, structuredClone(poi));
            addedPoiIds.add(id);
            deletedPoiIds.delete(id);
          },
          revert() {
            removePoiFromWorld(world, id);
            addedPoiIds.delete(id);
          },
        });
        state.poiMode = false;
        renderer.setSelected(id);
        notify();
      }
      return;
    }

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
        state.poiMode = false;
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
      if (v) state.poiMode = false;
      notify();
    },

    getPoi: (id) => poiOf(id),

    setPoiMode(v) {
      state.poiMode = v;
      if (v) state.addMode = false;
      notify();
    },

    renamePoi(id, name, description) {
      if (!poiOf(id)) return;
      commit(
        mutatePoiCommand('rename poi', id, (p) => {
          p.name = name;
          if (description !== undefined) p.description = description;
        }),
      );
    },

    setPoiIcon(id, icon) {
      if (!poiOf(id)) return;
      commit(
        mutatePoiCommand('set poi icon', id, (p) => {
          p.icon = icon;
        }),
      );
    },

    deletePoi(id) {
      const snapshot = structuredClone(poiOf(id));
      if (!snapshot) return;
      const wasAdded = addedPoiIds.has(id);
      renderer.setSelected(null);
      commit({
        label: 'delete poi',
        refresh: 'pois',
        apply() {
          removePoiFromWorld(world, id);
          deletedPoiIds.add(id);
          if (wasAdded) addedPoiIds.delete(id);
        },
        revert() {
          addPoiToWorld(world, structuredClone(snapshot));
          deletedPoiIds.delete(id);
          if (wasAdded) addedPoiIds.add(id);
        },
      });
    },

    undo() {
      if (historyIndex < 0) return;
      const command = history[historyIndex]!;
      command.revert();
      historyIndex -= 1;
      refreshFor(command);
      notify();
    },

    redo() {
      if (historyIndex >= history.length - 1) return;
      historyIndex += 1;
      const command = history[historyIndex]!;
      command.apply();
      refreshFor(command);
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
