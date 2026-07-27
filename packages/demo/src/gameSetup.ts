import type { MapWorld, Vec3 } from '@map-engine/core';
import type {
  AiController,
  FactionDefinition,
  GameSimulation,
  SiteDefinition,
  UnitId,
} from '@map-engine/game';
import { createAiController, createGameSimulation, nearestNode } from '@map-engine/game';
import type { GameView, ThreeMapRenderer } from '@map-engine/three';
import { createGameView } from '@map-engine/three';
import type { Scenario } from './game/scenario';
import { JINGZHOU_219, scenarioBuildingId } from './game/scenario';

/**
 * Scenario-driven game controller for the demo.
 *
 * C9 attaches the game layer to the **Three Kingdoms historical map only**: a
 * fixed `Scenario` (`JINGZHOU_219`) names the cities, factions, colors, unit
 * stats and win/lose copy, and this module turns that into a
 * `@map-engine/game` simulation plus a `@map-engine/three` view. On procedural
 * or OSM worlds `?game=1` is completely inert — `setupGameDemo` returns null
 * and nothing is created (the C8 procedural sandbox, its BFS spawn picks and
 * its DOM HUD are gone).
 *
 * The controller is UI-agnostic: it owns simulation + view + input and exposes
 * a small observable snapshot (`getState`/`subscribe`) plus screen-space city
 * labels, so the React layer can render a lobby, a status bar and an end
 * overlay without knowing anything about Three.js or `@map-engine/game`.
 *
 * Lifecycle: `setupGameDemo` only ever produces a **lobby** — no simulation, no
 * view, no listeners. `start(factionId)` builds everything; `dispose()` undoes
 * whatever exists in whichever phase it runs, so it is safe under React
 * StrictMode's mount/unmount/mount.
 */

export type GamePhase = 'lobby' | 'playing' | 'won' | 'lost';

export type FactionStatus = {
  id: string;
  name: string;
  color: string;
  /** Sites currently owned. */
  cityCount: number;
  resources: number;
  unitCount: number;
  isPlayer: boolean;
};

export type GameSelection =
  | {
      kind: 'unit';
      id: UnitId;
      factionId: string | null;
      hp: number;
      maxHp: number;
      isPlayerUnit: boolean;
    }
  | {
      kind: 'site';
      id: string;
      cityId: string;
      name: string;
      owner: string | null;
      isPlayerOwned: boolean;
    }
  | null;

export type GameUiState = {
  phase: GamePhase;
  /** null in the lobby. */
  playerFactionId: string | null;
  /**
   * Scenario faction order. In the lobby these are scenario-derived
   * (`cityCount` = declared cities, `resources` = starting stock, no units).
   */
  factions: FactionStatus[];
  totalSites: number;
  trainCost: number;
  /** phase 'playing' && the selection is an owned site && player can afford it. */
  canTrain: boolean;
  selection: GameSelection;
  /** Bumped (new object, seq+1) on every successful move command — the UI renders a ground ping. World coords. */
  lastCommand: { x: number; z: number; seq: number } | null;
  /** Monotonic; bumped whenever any of the above changed. */
  version: number;
};

export type CityLabel = {
  cityId: string;
  name: string;
  /** Owner's scenario color, or the neutral grey when the owner is not a scenario faction. */
  ownerColor: string;
  x: number;
  y: number;
  /** On-screen and in front of the camera. */
  visible: boolean;
};

export type GameController = {
  scenario: Scenario;
  /** Stable snapshot reference until `version` bumps. */
  getState(): GameUiState;
  /** Called (sync or next frame) after `version` bumps; NOT every frame. */
  subscribe(cb: () => void): () => void;
  /** Fresh screen-space projections of the scenario's cities. Call from the UI's own rAF; do not cache. */
  getCityLabels(): CityLabel[];
  /**
   * lobby → playing. Creates sim + view + AIs, spawns starting units, focuses
   * the camera on the scenario region. No-op unless the phase is 'lobby' and
   * the id names a scenario faction.
   */
  start(playerFactionId: string): void;
  /** `trainUnit` at the selected own site. False (no state change) when `canTrain` is false. */
  train(): boolean;
  clearSelection(): void;
  dispose(): void;
};

/** Site/label color when the owner is not one of the scenario's factions. */
const NEUTRAL_COLOR = '#9aa0a6';

/** Historical worlds' ids: `hist:{dataset}` / `hist:{dataset}:{era}`. */
const HISTORICAL_ID_PREFIX = 'hist:';

/** Camera framing of the whole scenario region — see step 7 of `start`. */
const FOCUS_RADIUS_SCALE = 1.4;
const FOCUS_RADIUS_PADDING = 40;

/** One scenario city resolved against the loaded world. */
type CityEntry = {
  cityId: string;
  /** Building id = site id. */
  buildingId: string;
  /** The building's display name — carries the era's name overrides (e.g. 鄂). */
  name: string;
  position: Vec3;
  /** The faction that owns it at scenario start. */
  initialOwner: string;
};

/** The internal, minimal selection; the public `GameSelection` is derived from live sim state. */
type SelectionRef = { kind: 'unit'; id: UnitId } | { kind: 'site'; id: string } | null;

/**
 * True when this URL asks for the game on a historical map — the App uses it to
 * swap `AtlasUI` for the game UI. Deliberately independent of `setupGameDemo`'s
 * own gate (which inspects the loaded world) so the UI can decide before the
 * world has finished booting.
 */
export function isGameModeUrl(params: URLSearchParams): boolean {
  return params.get('game') === '1' && params.get('map') === 'three-kingdoms';
}

/**
 * Resolve the scenario's cities against the loaded world. A city whose building
 * is missing is skipped with a warning rather than throwing — a scenario must
 * never be able to break the map.
 */
function resolveCities(scenario: Scenario, world: MapWorld): CityEntry[] {
  const entries: CityEntry[] = [];
  for (const faction of scenario.factions) {
    for (const cityId of faction.cities) {
      const buildingId = scenarioBuildingId(scenario, cityId);
      const obj = world.objects[buildingId];
      if (!obj || obj.objectType !== 'building') {
        console.warn(
          `[game] scenario "${scenario.id}": no building "${buildingId}" in world "${world.id}" — city skipped`,
        );
        continue;
      }
      const building = obj.building;
      entries.push({
        cityId,
        buildingId,
        name: building.name,
        position: { ...building.position },
        initialOwner: faction.id,
      });
    }
  }
  return entries;
}

export function setupGameDemo(
  renderer: ThreeMapRenderer,
  world: MapWorld,
  params: URLSearchParams,
): GameController | null {
  // The game layer exists only on the historical maps. Procedural/OSM worlds
  // get nothing at all, not even a lobby.
  if (params.get('game') !== '1') return null;
  if (!world.id.startsWith(HISTORICAL_ID_PREFIX)) return null;

  const scenario = JINGZHOU_219;
  const cities = resolveCities(scenario, world);
  const cityById = new Map(cities.map((c) => [c.buildingId, c]));
  const colorOf = new Map(scenario.factions.map((f) => [f.id, f.color]));

  // --- Mutable controller state ------------------------------------------------
  let disposed = false;
  let phase: GamePhase = 'lobby';
  let playerFactionId: string | null = null;
  let sim: GameSimulation | null = null;
  let view: GameView | null = null;
  let ais: AiController[] = [];
  let selectionRef: SelectionRef = null;
  let lastCommand: { x: number; z: number; seq: number } | null = null;

  const subscribers = new Set<() => void>();
  const teardown: Array<() => void> = [];

  // --- Snapshot ----------------------------------------------------------------

  const lobbyFactions = (): FactionStatus[] =>
    scenario.factions.map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color,
      cityCount: f.cities.length,
      resources: Math.round(f.resources),
      unitCount: 0,
      isPlayer: false,
    }));

  const liveFactions = (s: GameSimulation): FactionStatus[] => {
    const sites = s.listSites();
    const units = s.listUnits();
    return scenario.factions.map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color,
      cityCount: sites.filter((site) => site.ownerFactionId === f.id).length,
      resources: Math.round(s.getFaction(f.id)?.resources ?? 0),
      unitCount: units.filter((u) => u.factionId === f.id).length,
      isPlayer: f.id === playerFactionId,
    }));
  };

  /**
   * Resolve `selectionRef` against live simulation state, dropping a selection
   * whose subject no longer exists (a selected unit can die at any tick; sites
   * never disappear).
   */
  const resolveSelection = (): GameSelection => {
    if (!sim || !selectionRef) return null;
    if (selectionRef.kind === 'unit') {
      const unit = sim.getUnit(selectionRef.id);
      if (!unit) {
        selectionRef = null;
        view?.selectUnit(null);
        return null;
      }
      return {
        kind: 'unit',
        id: unit.id,
        factionId: unit.factionId,
        hp: unit.hp,
        maxHp: unit.maxHp,
        isPlayerUnit: unit.factionId !== null && unit.factionId === playerFactionId,
      };
    }
    const site = sim.getSite(selectionRef.id);
    if (!site) {
      selectionRef = null;
      return null;
    }
    const city = cityById.get(site.id);
    return {
      kind: 'site',
      id: site.id,
      cityId: city?.cityId ?? site.id,
      name: site.name,
      owner: site.ownerFactionId,
      isPlayerOwned: site.ownerFactionId !== null && site.ownerFactionId === playerFactionId,
    };
  };

  const buildState = (version: number): GameUiState => {
    const factions = sim ? liveFactions(sim) : lobbyFactions();
    const selection = resolveSelection();
    const player = playerFactionId;
    const canTrain =
      phase === 'playing' &&
      player !== null &&
      selection !== null &&
      selection.kind === 'site' &&
      selection.isPlayerOwned &&
      (factions.find((f) => f.id === player)?.resources ?? 0) >= scenario.trainCost;
    return {
      phase,
      playerFactionId: player,
      factions,
      totalSites: cities.length,
      trainCost: scenario.trainCost,
      canTrain,
      selection,
      lastCommand,
      version,
    };
  };

  /**
   * Everything the UI can observe, flattened into one comparable string. The
   * post-tick frame hook recomputes it every frame but only replaces the
   * snapshot (and notifies) when it actually moved — subscribers must not be
   * woken 60 times a second for a game whose numbers change about once.
   */
  const fingerprint = (s: GameUiState): string => {
    const f = s.factions
      .map((x) => `${x.id}:${x.cityCount}:${x.resources}:${x.unitCount}:${x.isPlayer ? 1 : 0}`)
      .join(',');
    const sel = s.selection
      ? s.selection.kind === 'unit'
        ? `u:${s.selection.id}:${Math.round(s.selection.hp)}:${s.selection.maxHp}:${s.selection.isPlayerUnit ? 1 : 0}`
        : `s:${s.selection.id}:${s.selection.owner ?? '-'}:${s.selection.isPlayerOwned ? 1 : 0}`
      : '-';
    return `${s.phase}|${s.playerFactionId ?? '-'}|${f}|${sel}|${s.canTrain ? 1 : 0}|${s.lastCommand?.seq ?? 0}`;
  };

  let state = buildState(0);
  let lastFingerprint = fingerprint(state);

  const refresh = (): void => {
    const next = buildState(state.version + 1);
    const fp = fingerprint(next);
    if (fp === lastFingerprint) return;
    lastFingerprint = fp;
    state = next;
    for (const cb of [...subscribers]) cb();
  };

  // --- start() -----------------------------------------------------------------

  const start = (factionId: string): void => {
    if (disposed || phase !== 'lobby') return;
    if (!scenario.factions.some((f) => f.id === factionId)) return;

    // 1. Sites — the scenario's cities only, never the world's other ~43.
    const sites: SiteDefinition[] = cities.map((c) => ({
      id: c.buildingId,
      name: c.name,
      position: { x: c.position.x, y: c.position.z },
      ownerFactionId: c.initialOwner,
      ...scenario.siteDefaults,
    }));

    // 2. Simulation.
    const factions: FactionDefinition[] = scenario.factions.map((f) => ({
      id: f.id,
      resources: f.resources,
      income: f.income,
    }));
    const simulation = createGameSimulation(world, { sites, factions });
    sim = simulation;
    playerFactionId = factionId;
    phase = 'playing';

    // 3. Starting units, in scenario faction order then city order, at the road
    // node nearest each owned city (falling back to the raw city position for a
    // world with no road graph at all).
    for (const faction of scenario.factions) {
      for (const cityId of faction.cities) {
        const city = cities.find((c) => c.cityId === cityId);
        if (!city) continue;
        const node = nearestNode(simulation.index, city.position.x, city.position.z);
        for (let i = 0; i < faction.unitsPerCity; i++) {
          simulation.spawnUnit({
            ...scenario.unitStats,
            kind: 'soldier',
            factionId: faction.id,
            ...(node !== null
              ? { atNode: node }
              : { position: { x: city.position.x, y: city.position.z } }),
          });
        }
      }
    }

    // 4. AI frame hook — registered BEFORE createGameView below, so it runs
    // before the view's own onFrame hook, which is the one that calls
    // `sim.tick(dt)`. renderer.onFrame stores callbacks in a Set and the frame
    // loop iterates it in registration order, so this ordering is guaranteed,
    // giving the AI's commands a chance to take effect in the same tick they
    // were issued. Once the game has ended the AIs stop deciding, while the
    // simulation keeps ticking so the world stays alive behind the overlay.
    ais = scenario.factions
      .filter((f) => f.id !== factionId)
      .map((f) =>
        createAiController(simulation, {
          factionId: f.id,
          train: { cost: scenario.trainCost, unit: { ...scenario.unitStats, kind: 'soldier' } },
        }),
      );
    const offAiFrame = renderer.onFrame((dt) => {
      if (phase !== 'playing') return;
      for (const ai of ais) ai.update(dt);
    });
    teardown.push(offAiFrame);

    // 5. View (its own onFrame hook ticks the simulation).
    const gameView = createGameView(renderer, simulation, {
      factionColors: Object.fromEntries(colorOf),
      healthBars: true,
    });
    view = gameView;
    teardown.push(() => gameView.dispose());

    // 6. Post-tick bookkeeping — registered AFTER createGameView, so it observes
    // the state the tick just produced.
    const offSyncFrame = renderer.onFrame(() => {
      endCheck();
      refresh();
    });
    teardown.push(offSyncFrame);

    // Interaction.
    renderer.domElement.addEventListener('click', onClick);
    renderer.domElement.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    teardown.push(() => {
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
    });

    // e2e and manual debugging reach the live objects through `__mapEngine`;
    // this is the only place that knows they now exist.
    const me = (window as unknown as Record<string, unknown>).__mapEngine as
      | Record<string, unknown>
      | undefined;
    if (me) {
      me.game = simulation;
      me.gameView = gameView;
      me.gameAis = ais;
    }
    teardown.push(() => {
      if (!me) return;
      // Only retract our own references — a controller created after us (React
      // StrictMode remount) may already have replaced them.
      if (me.game === simulation) delete me.game;
      if (me.gameView === gameView) delete me.gameView;
      if (me.gameAis === ais) delete me.gameAis;
    });

    // 7. Frame the whole scenario region.
    if (cities.length > 0) {
      const cx = cities.reduce((sum, c) => sum + c.position.x, 0) / cities.length;
      const cz = cities.reduce((sum, c) => sum + c.position.z, 0) / cities.length;
      const spread = cities.reduce(
        (max, c) => Math.max(max, Math.hypot(c.position.x - cx, c.position.z - cz)),
        0,
      );
      void renderer.focusPoint({ x: cx, z: cz }, spread * FOCUS_RADIUS_SCALE + FOCUS_RADIUS_PADDING);
    }

    refresh();
  };

  /**
   * Victory when the player holds every scenario site; defeat when it holds no
   * site and no unit. Both are terminal — once set, the phase never changes
   * again (the early return also freezes the AI hook above).
   */
  function endCheck(): void {
    if (phase !== 'playing' || !sim || playerFactionId === null) return;
    const owned = sim.listSites().filter((s) => s.ownerFactionId === playerFactionId).length;
    if (owned === cities.length && cities.length > 0) {
      phase = 'won';
      return;
    }
    if (owned === 0 && sim.listUnits().every((u) => u.factionId !== playerFactionId)) {
      phase = 'lost';
    }
  }

  // --- Input -------------------------------------------------------------------

  function selectUnit(id: UnitId): void {
    selectionRef = { kind: 'unit', id };
    view?.selectUnit(id);
  }

  function selectSite(id: string): void {
    selectionRef = { kind: 'site', id };
    // A site selection is not a unit selection: drop the view's unit ring.
    view?.selectUnit(null);
  }

  function clearSelection(): void {
    selectionRef = null;
    view?.selectUnit(null);
    refresh();
  }

  function onClick(e: MouseEvent): void {
    if (!sim || !view) return;
    const pointer = { x: e.clientX, y: e.clientY };

    const hitUnit = view.pickUnit(pointer);
    if (hitUnit !== null) {
      selectUnit(hitUnit);
      refresh();
      return;
    }
    const hitSite = view.pickSite(pointer);
    if (hitSite !== null) {
      selectSite(hitSite);
      refresh();
      return;
    }

    // Empty ground: a move order, but only for the player's own units — an
    // enemy unit or a site selection never commands anything.
    if (!selectionRef || selectionRef.kind !== 'unit') return;
    const unit = sim.getUnit(selectionRef.id);
    if (!unit || unit.factionId === null || unit.factionId !== playerFactionId) return;
    const point = renderer.pickGround(pointer);
    if (!point) return;
    if (!sim.moveUnitTo(unit.id, { x: point.x, y: point.z })) return;
    lastCommand = { x: point.x, z: point.z, seq: (lastCommand?.seq ?? 0) + 1 };
    refresh();
  }

  function onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    clearSelection();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' || e.code === 'Escape') clearSelection();
  }

  // --- Public surface ----------------------------------------------------------

  return {
    scenario,

    getState: () => state,

    subscribe(cb: () => void): () => void {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },

    getCityLabels(): CityLabel[] {
      return cities.map((c) => {
        const owner = sim?.getSite(c.buildingId)?.ownerFactionId ?? c.initialOwner;
        const p = renderer.projectToScreen(c.position);
        return {
          cityId: c.cityId,
          name: c.name,
          ownerColor: (owner !== null ? colorOf.get(owner) : undefined) ?? NEUTRAL_COLOR,
          x: p.x,
          y: p.y,
          visible: p.visible,
        };
      });
    },

    start,

    train(): boolean {
      if (!state.canTrain || !sim || playerFactionId === null) return false;
      if (!selectionRef || selectionRef.kind !== 'site') return false;
      const unit = sim.trainUnit(playerFactionId, {
        siteId: selectionRef.id,
        cost: scenario.trainCost,
        unit: { ...scenario.unitStats, kind: 'soldier' },
      });
      refresh();
      return unit !== null;
    },

    clearSelection,

    dispose(): void {
      if (disposed) return;
      disposed = true;
      // Reverse order: listeners and frame hooks before the view they read.
      for (const off of teardown.splice(0).reverse()) off();
      subscribers.clear();
      ais = [];
      view = null;
      sim = null;
    },
  };
}
