import type { Vec3 } from '@map-engine/core';
import type { GameSimulation, Site, SpawnOptions, Unit } from './simulation';

/**
 * A deterministic AI controller that plays one faction of a `GameSimulation`.
 *
 * The policy is purely greedy — defend a threatened owned site, otherwise
 * expand to the nearest unclaimed one, and train while affordable — so it
 * needs no randomness at all: no `Math.random()`, no `Date.now()`, and
 * deliberately not even `@map-engine/core`'s seeded RNG. Every decision is a
 * pure function of the simulation's public state plus the controller's own
 * elapsed-time accumulator, which is what makes two controllers replaying the
 * same simulation from the same start produce byte-identical event streams.
 *
 * `update(dt)` must be called once per frame, with the *same* `dt` about to be
 * handed to `sim.tick`, and *before* that `tick` call: the controller reads
 * live unit/site/faction state and issues commands (`trainUnit`,
 * `moveUnitTo`) whose effects are realised by the following `tick`. It never
 * touches anything but `GameSimulation`'s public API, so several controllers
 * — one per faction — can drive the same simulation side by side, each blind
 * to the others except through the shared world. Constructing two
 * controllers for the *same* faction is caller error (they would issue
 * conflicting, redundant commands every pass); this is not detected.
 */
export type AiControllerOptions = {
  /** The faction this controller plays. */
  factionId: string;
  /**
   * Sim-seconds between decision passes. Default 1. Non-finite or `<= 0`
   * falls back to the default. At most one decision pass runs per `update`
   * call no matter how large `dt` is — a stalled game loop cannot make the
   * AI "catch up" by deciding several times in a row.
   */
  decisionInterval?: number;
  /**
   * Stop training once the faction owns this many units. Default 8. `0` is
   * meaningful ("never train"); a non-finite or negative value falls back to
   * the default instead of silently disabling training.
   */
  maxUnits?: number;
  /**
   * Training policy. Omitted → the AI never trains; it only ever commands
   * the units it already has.
   */
  train?: {
    /** Forwarded verbatim as `trainUnit`'s `cost`. */
    cost: number;
    /**
     * Forwarded verbatim as `trainUnit`'s `unit`. Position, id and faction
     * are always the controller's to set, so they are excluded here too.
     */
    unit?: Omit<SpawnOptions, 'id' | 'position' | 'atNode' | 'factionId'>;
  };
};

export interface AiController {
  readonly factionId: string;
  /**
   * Call once per frame with the SAME `dt` you are about to pass to
   * `sim.tick`, BEFORE calling `sim.tick(dt)`. A non-finite `dt` or `dt <= 0`
   * is a no-op — it does not even accumulate. Pure and deterministic: the
   * only inputs are the simulation's public state and the summed `dt` — no
   * RNG, no wall clock.
   */
  update(dt: number): void;
}

/** Non-finite or `<= 0` → the default. Mirrors `simulation.ts`'s `positiveOr`. */
const positiveOr = (v: number | undefined, fallback: number): number =>
  v === undefined || !Number.isFinite(v) || v <= 0 ? fallback : v;

/** XZ Euclidean distance, inclusive, against a site's `captureRadius`. */
const withinRadius = (pos: Vec3, site: Site): boolean => {
  const dx = pos.x - site.position.x;
  const dz = pos.z - site.position.z;
  return Math.hypot(dx, dz) <= site.captureRadius;
};

/**
 * The nearest of `candidates` to `unit` by XZ Euclidean distance, ties broken
 * by the lexicographically smaller site id. `undefined` when `candidates` is
 * empty.
 */
const nearestSite = (unit: Unit, candidates: Site[]): Site | undefined => {
  let best: Site | undefined;
  let bestDist = Infinity;
  for (const site of candidates) {
    const dx = site.position.x - unit.position.x;
    const dz = site.position.z - unit.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < bestDist || (dist === bestDist && best !== undefined && site.id < best.id)) {
      bestDist = dist;
      best = site;
    }
  }
  return best;
};

export function createAiController(
  sim: GameSimulation,
  options: AiControllerOptions,
): AiController {
  const factionId = options.factionId;
  const decisionInterval = positiveOr(options.decisionInterval, 1);
  // `0` must survive (it means "never train"), so this can't reuse
  // `positiveOr` — only a non-finite or negative value falls back to the
  // default, mirroring decisionInterval's non-finite/`<= 0` fallback but with
  // `0` itself kept meaningful.
  const maxUnits =
    options.maxUnits === undefined || !Number.isFinite(options.maxUnits) || options.maxUnits < 0
      ? 8
      : options.maxUnits;
  const train = options.train;

  /** Sim-seconds accumulated since the last decision pass. */
  let acc = 0;

  /**
   * One decision pass, in the fixed order the contract specifies:
   * 1. Threat scan (on the unit positions as of the start of the pass).
   * 2. Train, at most one unit, at the lexicographically smallest owned site.
   * 3. Command every idle/arrived unit of ours toward a threatened owned
   *    site if any exist, else the nearest site we do not own — except a
   *    unit already standing inside that target's `captureRadius` (XZ
   *    distance, inclusive, the same measure the capture rule uses), which is
   *    left alone rather than re-commanded: re-issuing the same order would
   *    either build a zero-length route that re-arrives synchronously every
   *    decision pass (procedural worlds, where sites sit on road-graph nodes)
   *    or walk the unit out to the nearest road node and back for no reason
   *    (historical worlds, where sites are not on the road graph).
   *
   * `listUnits()`/`listSites()` are called once for the threat scan (before
   * training can change anything) and once more for the command phase (after
   * training, so a unit trained this very pass is visible to it) — the O(units
   * × sites) work this implies only ever runs here, once per decision
   * interval, never once per frame.
   */
  const runPass = (): void => {
    const sites = sim.listSites();
    const ownedSites = sites.filter((s) => s.ownerFactionId === factionId);

    // 1. Threat scan.
    const preTrainUnits = sim.listUnits();
    const threatened = ownedSites.filter((site) =>
      preTrainUnits.some(
        (u) => u.factionId !== null && u.factionId !== factionId && withinRadius(u.position, site),
      ),
    );

    // 2. Train.
    if (train) {
      const ownUnitCount = preTrainUnits.filter((u) => u.factionId === factionId).length;
      if (ownUnitCount < maxUnits && ownedSites.length > 0) {
        const siteId = ownedSites.map((s) => s.id).sort()[0]!;
        sim.trainUnit(factionId, { siteId, cost: train.cost, unit: train.unit });
      }
    }

    // 3. Command.
    const unowned = sites.filter((s) => s.ownerFactionId !== factionId);
    const candidates = threatened.length > 0 ? threatened : unowned;
    for (const unit of sim.listUnits()) {
      if (unit.factionId !== factionId) continue;
      if (unit.state !== 'idle' && unit.state !== 'arrived') continue;
      const target = nearestSite(unit, candidates);
      if (!target) continue;
      if (withinRadius(unit.position, target)) continue; // already there
      sim.moveUnitTo(unit.id, { x: target.position.x, y: target.position.z });
    }
  };

  const update = (dt: number): void => {
    if (!Number.isFinite(dt) || dt <= 0) return;
    acc += dt;
    if (acc >= decisionInterval) {
      acc = 0;
      runPass();
    }
  };

  return { factionId, update };
}
