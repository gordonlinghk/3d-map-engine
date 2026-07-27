import type { BuildingInfo, MapObject, MapWorld, Vec3 } from '@map-engine/core';
import type {
  AiController,
  FactionDefinition,
  GameSimulation,
  RoadGraphIndex,
  SiteDefinition,
} from '@map-engine/game';
import { buildGraphIndex, createAiController, createGameSimulation, nearestNode } from '@map-engine/game';
import type { GameView, ThreeMapRenderer } from '@map-engine/three';
import { createGameView } from '@map-engine/three';

/**
 * Opt-in game-layer demo — fully inert unless `?game=1` is present, so it
 * cannot affect the default demo or the existing e2e suite.
 *
 * C8 adds capturable sites, faction resources and (behind `?ai=1`) an AI
 * opponent on top of the C1/C7 unit-movement-and-combat sandbox. This module
 * derives sites/factions from the *demo's* knowledge of the world (historical
 * vs procedural/OSM) — `@map-engine/game` itself never learns about
 * historical or procedural worlds.
 */

export type GameDemoHandles = {
  sim: GameSimulation;
  view: GameView;
  ais: AiController[];
  /** Removes the click handler, the HUD element + its stylesheet, the AI frame hook and the view. */
  dispose(): void;
};

/**
 * The HUD's placement has to dodge every zone `@map-engine/ui`'s `AtlasUI`
 * occupies (all absolutely positioned in the same stacking context, so simple
 * z-index alone cannot rescue an overlapping rect): the always-mountable left
 * side panel (`.atlas-side`, x 14–314, full height, z 20/27 mobile), the top
 * search bar (z 30), the top-right toolbar (z 26), the bottom-right minimap +
 * HUD (z 20, minimap hidden <900px), and the bottom-center hints bar (z 15,
 * hidden <900px). Above 900px this sits in the gap between the hints bar and
 * the minimap/toolbar column. Below 900px the side panel starts *closed*
 * (`AtlasUI` calls `setPanelOpen(false)` on boot when `innerWidth < 900`), the
 * hints bar and minimap are hidden outright, and the bottom-right column is
 * just the FPS badge + compass (`.atlas-hud`, ~40px wide) — leaving the whole
 * bottom-left corner free, so this sits there instead, at the same 14px inset
 * the side panel itself uses. Its z-index still clears the side panel's mobile
 * z 27 (the HUD has its own background) so if the user manually reopens the
 * panel the HUD stays readable on top rather than being buried under it.
 * Verified against real rendered rects at 1440x900, 1920x1080 and 390x844 —
 * see e2e/game.spec.ts.
 */
const HUD_STYLE = `
.game-hud-panel {
  position: absolute;
  right: 196px;
  bottom: 10px;
  padding: 6px 10px;
  font: 12px/1.6 "SF Mono", ui-monospace, Menlo, monospace;
  color: #e8edf5;
  background: rgba(10, 14, 20, 0.55);
  border-radius: 6px;
  white-space: pre;
  pointer-events: none;
  z-index: 18;
  max-width: 220px;
}
@media (max-width: 900px) {
  .game-hud-panel {
    left: 14px;
    right: auto;
    bottom: 14px;
    top: auto;
    max-width: 170px;
    z-index: 28;
  }
}
`;

const FACTION_COLORS: Record<string, string> = { red: '#c0392b', blue: '#2d7dd2' };

/** Historical worlds' city-hall building ids all start with this prefix. */
const CITY_ID_PREFIX = 'city:';
/** The district id `historicalToWorld` assigns to a city with no faction. */
const NEUTRAL_DISTRICT_ID = 'd:hist';

/**
 * Sites for a historical world (buildings whose id starts with `'city:'`):
 * one per city, owner derived from its district id (`'d:hist'` = neutral).
 * Returns `null` when the world has no such buildings, so the caller falls
 * back to the procedural/OSM three-site layout.
 */
function deriveHistoricalSites(world: MapWorld): SiteDefinition[] | null {
  const isCityHall = (o: MapObject): o is Extract<MapObject, { objectType: 'building' }> =>
    o.objectType === 'building' && o.id.startsWith(CITY_ID_PREFIX);
  const cityHalls = Object.values(world.objects).filter(isCityHall);
  if (cityHalls.length === 0) return null;

  return cityHalls.map((obj) => {
    const building: BuildingInfo = obj.building;
    const ownerFactionId =
      building.districtId === NEUTRAL_DISTRICT_ID
        ? undefined
        : building.districtId.replace(/^d:/, '');
    return {
      id: building.id,
      position: { x: building.position.x, y: building.position.z },
      ...(ownerFactionId !== undefined ? { ownerFactionId } : {}),
      captureRadius: 6,
      captureTime: 3,
      income: 5,
    };
  });
}

/**
 * Sites for a procedural/OSM world: `site:red` at the BFS start node,
 * `site:blue` at the farthest spawn pick, and `site:neutral` at the reachable
 * node nearest the start that lies farther than `captureRadius` from every
 * spawn pick (so taking it requires actually marching a unit there) — falling
 * back to the nearest reachable node that isn't a spawn pick, for a graph too
 * small to have a clean far-away candidate.
 */
function deriveProceduralSites(
  index: RoadGraphIndex,
  startNode: string,
  chosenNodeIds: string[],
  remainder: string[],
): SiteDefinition[] {
  const captureRadius = 10;
  const posOf = (id: string): Vec3 | undefined => index.nodeById.get(id);
  const startPos = posOf(startNode) ?? { x: 0, y: 0, z: 0 };

  // Farthest of the actual spawn picks from the start node.
  let blueNodeId = chosenNodeIds[0]!;
  let blueBestD = -Infinity;
  for (const id of chosenNodeIds) {
    const p = posOf(id);
    if (!p) continue;
    const d = (p.x - startPos.x) ** 2 + (p.z - startPos.z) ** 2;
    if (d > blueBestD) {
      blueBestD = d;
      blueNodeId = id;
    }
  }
  const bluePos = posOf(blueNodeId) ?? startPos;

  const fartherThanEveryPick = (id: string): boolean => {
    const p = posOf(id);
    if (!p) return false;
    return chosenNodeIds.every((pickId) => {
      const pickPos = posOf(pickId);
      return !pickPos || Math.hypot(p.x - pickPos.x, p.z - pickPos.z) > captureRadius;
    });
  };
  // remainder is already sorted nearest→farthest from the start node.
  let neutralNodeId: string | undefined =
    remainder.find(fartherThanEveryPick) ?? remainder.find((id) => !chosenNodeIds.includes(id));
  // Last-resort safety net for a pathologically tiny graph where every
  // reachable node besides the start is already a spawn pick.
  neutralNodeId ??= remainder[remainder.length - 1];
  const neutralPos = (neutralNodeId !== undefined ? posOf(neutralNodeId) : undefined) ?? startPos;

  return [
    {
      id: 'site:red',
      position: { x: startPos.x, y: startPos.z },
      ownerFactionId: 'red',
      captureRadius,
      captureTime: 3,
      income: 5,
    },
    {
      id: 'site:blue',
      position: { x: bluePos.x, y: bluePos.z },
      ownerFactionId: 'blue',
      captureRadius,
      captureTime: 3,
      income: 5,
    },
    {
      id: 'site:neutral',
      position: { x: neutralPos.x, y: neutralPos.z },
      captureRadius,
      captureTime: 3,
      income: 5,
    },
  ];
}

const DEMO_FACTIONS: FactionDefinition[] = [
  { id: 'red', resources: 0, income: 1 },
  { id: 'blue', resources: 60, income: 1 },
];

export function setupGameDemo(
  renderer: ThreeMapRenderer,
  world: MapWorld,
  params: URLSearchParams,
): GameDemoHandles | null {
  if (params.get('game') !== '1') return null;

  const index = buildGraphIndex(world.roadGraph);
  const startNode = nearestNode(index, 0, 0);
  if (!startNode) return null;

  // BFS over the road graph from the world-center node to find every node it
  // can reach — units are only spawned within this connected component so
  // every unit can always route to every other.
  const reachable = new Set<string>([startNode]);
  const queue: string[] = [startNode];
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    for (const edge of index.adjacency.get(cur) ?? []) {
      if (!reachable.has(edge.to)) {
        reachable.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  const startPos = index.nodeById.get(startNode);
  const remainder = [...reachable]
    .filter((id) => id !== startNode)
    .sort((a, b) => {
      const pa = index.nodeById.get(a);
      const pb = index.nodeById.get(b);
      const da = pa && startPos ? (pa.x - startPos.x) ** 2 + (pa.z - startPos.z) ** 2 : 0;
      const db = pb && startPos ? (pb.x - startPos.x) ** 2 + (pb.z - startPos.z) ** 2 : 0;
      return da - db;
    });
  // Pick up to 6 well-separated nodes: the start node plus up to 5 more
  // spread evenly across the nearest→farthest ordering of the rest of the
  // component, so routes between units are visibly long.
  const extraSlots = Math.min(5, remainder.length);
  const picks: (string | undefined)[] = [startNode];
  for (let i = 0; i < extraSlots; i++) {
    const idx = extraSlots === 1 ? 0 : Math.round((i * (remainder.length - 1)) / (extraSlots - 1));
    picks.push(remainder[idx]);
  }
  const chosenNodeIds = [...new Set(picks)].filter((id): id is string => !!id);

  if (chosenNodeIds.length < 2) return null;

  const sites = deriveHistoricalSites(world) ?? deriveProceduralSites(index, startNode, chosenNodeIds, remainder);

  const sim = createGameSimulation(world, { sites, factions: DEMO_FACTIONS });

  // FROZEN invariant: the first two spawned units (insertion order) must
  // share a faction — e2e commands unit 0 onto unit 1 and expects it to
  // arrive rather than start fighting. Assigning the first 3 picks to 'red'
  // and the rest to 'blue' preserves this even when the graph yields fewer
  // than 6 nodes.
  chosenNodeIds.forEach((nodeId, i) =>
    sim.spawnUnit({
      atNode: nodeId,
      kind: 'soldier',
      speed: 30,
      factionId: i < 3 ? 'red' : 'blue',
    }),
  );

  const ais: AiController[] = [];
  if (params.get('ai') === '1') {
    ais.push(createAiController(sim, { factionId: 'blue', train: { cost: 50 } }));
  }

  const hudStyle = document.createElement('style');
  hudStyle.textContent = HUD_STYLE;
  document.head.appendChild(hudStyle);

  const hud = document.createElement('div');
  hud.dataset.testid = 'game-hud';
  hud.className = 'game-hud-panel';
  (renderer.domElement.parentElement ?? document.body).appendChild(hud);

  // Only touch the DOM when the rendered string actually changed — the HUD's
  // content changes about once a second, but this runs every frame.
  let lastHudText: string | undefined;
  const refreshHud = (): void => {
    const sitesNow = sim.listSites();
    const text = sim
      .listFactions()
      .map((f) => {
        const owned = sitesNow.filter((s) => s.ownerFactionId === f.id).length;
        return `${f.id}: ${Math.round(f.resources)} res · ${owned} site${owned === 1 ? '' : 's'}`;
      })
      .join('\n');
    if (text !== lastHudText) {
      hud.textContent = text;
      lastHudText = text;
    }
  };
  refreshHud();

  // AI frame hook — registered BEFORE createGameView below, so its callback
  // (which also drives the cheap HUD refresh) runs before the view's own
  // onFrame hook, which is the one that calls `sim.tick(dt)`. renderer.onFrame
  // stores callbacks in a Set and the frame loop iterates it in registration
  // order, so this ordering is guaranteed, giving the AI's commands a chance
  // to take effect in the same tick they were issued.
  const offAiFrame = renderer.onFrame((dt) => {
    for (const ai of ais) ai.update(dt);
    refreshHud();
  });

  const view = createGameView(renderer, sim, { factionColors: FACTION_COLORS });

  const onGameClick = (e: MouseEvent): void => {
    const pointer = { x: e.clientX, y: e.clientY };
    const hitUnit = view.pickUnit(pointer);
    if (hitUnit) {
      view.selectUnit(hitUnit);
      return;
    }
    const selected = view.getSelectedUnit();
    if (!selected) return;
    const point = renderer.pickGround(pointer);
    if (point) sim.moveUnitTo(selected, { x: point.x, y: point.z });
  };
  renderer.domElement.addEventListener('click', onGameClick);

  return {
    sim,
    view,
    ais,
    dispose(): void {
      renderer.domElement.removeEventListener('click', onGameClick);
      offAiFrame();
      hud.remove();
      hudStyle.remove();
      view.dispose();
    },
  };
}
