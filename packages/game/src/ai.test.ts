import { describe, expect, it, vi } from 'vitest';
import type { MapWorld, RoadGraph } from '@map-engine/core';
import { createAiController } from './ai';
import {
  createGameSimulation,
  type FactionDefinition,
  type GameEvent,
  type SiteDefinition,
} from './simulation';

function squareGraph(): RoadGraph {
  return {
    nodes: [
      { id: 'a', position: { x: 0, y: 0, z: 0 } },
      { id: 'b', position: { x: 10, y: 0, z: 0 } },
      { id: 'c', position: { x: 10, y: 0, z: 10 } },
      { id: 'd', position: { x: 0, y: 0, z: 10 } },
    ],
    edges: [
      { id: 'ab', from: 'a', to: 'b', kind: 'street', width: 8 },
      { id: 'bc', from: 'b', to: 'c', kind: 'street', width: 8 },
      { id: 'cd', from: 'c', to: 'd', kind: 'street', width: 8 },
      { id: 'da', from: 'd', to: 'a', kind: 'street', width: 8 },
    ],
  };
}

/** Minimal fake world — the sim only reads roadGraph + config.waterLevel. */
function fakeWorld(): MapWorld {
  return { config: { waterLevel: 0 }, roadGraph: squareGraph() } as unknown as MapWorld;
}

/** A sim with capturable sites and resource-holding factions. */
function siteSim(sites: SiteDefinition[], factions: FactionDefinition[] = []) {
  return createGameSimulation(fakeWorld(), { heightSampler: () => 5, sites, factions });
}

describe('createAiController — decision cadence', () => {
  it('respects decisionInterval and makes at most one pass per update, even for a huge dt', () => {
    const sim = siteSim(
      [{ id: 'home', position: { x: 0, y: 0 }, ownerFactionId: 'red' }],
      [{ id: 'red', resources: 1000 }],
    );
    const trainSpy = vi.spyOn(sim, 'trainUnit');
    const ai = createAiController(sim, {
      factionId: 'red',
      decisionInterval: 2,
      maxUnits: 1000,
      train: { cost: 0 },
    });

    ai.update(0.5); // acc 0.5
    ai.update(1.4); // acc 1.9
    expect(trainSpy).not.toHaveBeenCalled();

    ai.update(0.2); // acc 2.1 >= 2 -> exactly one pass
    expect(trainSpy).toHaveBeenCalledTimes(1);

    // A huge dt must still trigger only one pass, not several.
    ai.update(1000);
    expect(trainSpy).toHaveBeenCalledTimes(2);
  });

  it('no-ops for dt <= 0 and non-finite dt, without even accumulating', () => {
    const sim = siteSim(
      [{ id: 'home', position: { x: 0, y: 0 }, ownerFactionId: 'red' }],
      [{ id: 'red', resources: 1000 }],
    );
    const trainSpy = vi.spyOn(sim, 'trainUnit');
    const moveSpy = vi.spyOn(sim, 'moveUnitTo');
    sim.spawnUnit({ id: 'u', position: { x: 0, y: 0 }, factionId: 'red' });
    const ai = createAiController(sim, { factionId: 'red', decisionInterval: 1, train: { cost: 0 } });

    ai.update(0);
    ai.update(-5);
    ai.update(Number.NaN);
    ai.update(Number.POSITIVE_INFINITY);
    expect(trainSpy).not.toHaveBeenCalled();
    expect(moveSpy).not.toHaveBeenCalled();

    // Invalid calls must not have silently accumulated: 0.9 alone should not
    // reach the 1s threshold.
    ai.update(0.9);
    expect(trainSpy).not.toHaveBeenCalled();
    ai.update(0.1); // now at 1.0 -> pass fires
    expect(trainSpy).toHaveBeenCalledTimes(1);
  });
});

describe('createAiController — training', () => {
  it('trains at the lexicographically smallest owned site when affordable and under maxUnits', () => {
    const sim = siteSim(
      [
        { id: 'z-site', position: { x: 0, y: 0 }, ownerFactionId: 'red' },
        { id: 'a-site', position: { x: 20, y: 20 }, ownerFactionId: 'red' },
      ],
      [{ id: 'red', resources: 100 }],
    );
    const trainSpy = vi.spyOn(sim, 'trainUnit');
    const ai = createAiController(sim, {
      factionId: 'red',
      train: { cost: 10, unit: { kind: 'soldier' } },
    });
    ai.update(1);
    expect(trainSpy).toHaveBeenCalledWith('red', {
      siteId: 'a-site',
      cost: 10,
      unit: { kind: 'soldier' },
    });
    expect(sim.getFaction('red')!.resources).toBe(90);
    const trained = sim.listUnits().find((u) => u.kind === 'soldier');
    expect(trained?.position).toEqual({ x: 20, y: 5, z: 20 });
  });

  it('does not train when unaffordable, at maxUnits, or owning no site', () => {
    // Unaffordable.
    const poor = siteSim(
      [{ id: 's', position: { x: 0, y: 0 }, ownerFactionId: 'red' }],
      [{ id: 'red', resources: 1 }],
    );
    createAiController(poor, { factionId: 'red', train: { cost: 100 } }).update(1);
    expect(poor.listUnits()).toEqual([]);
    expect(poor.getFaction('red')!.resources).toBe(1);

    // Already at maxUnits.
    const full = siteSim(
      [{ id: 's', position: { x: 0, y: 0 }, ownerFactionId: 'red' }],
      [{ id: 'red', resources: 100 }],
    );
    full.spawnUnit({ id: 'e1', factionId: 'red' });
    full.spawnUnit({ id: 'e2', factionId: 'red' });
    createAiController(full, { factionId: 'red', maxUnits: 2, train: { cost: 1 } }).update(1);
    expect(full.listUnits().map((u) => u.id)).toEqual(['e1', 'e2']);
    expect(full.getFaction('red')!.resources).toBe(100);

    // Owns no site at all.
    const siteless = siteSim([{ id: 's', position: { x: 0, y: 0 } }], [{ id: 'red', resources: 100 }]);
    createAiController(siteless, { factionId: 'red', train: { cost: 1 } }).update(1);
    expect(siteless.listUnits()).toEqual([]);
    expect(siteless.getFaction('red')!.resources).toBe(100);
  });
});

describe('createAiController — commanding units', () => {
  it('sends idle units to the nearest non-owned site, tie broken by the smaller site id', () => {
    // captureRadius small enough that the unit at (0,0) is NOT already inside
    // either site's radius — otherwise the "don't re-command a unit already
    // there" rule (tested separately below) would swallow this command and
    // the tie-break itself would go untested.
    const sim = siteSim([
      { id: 'y', position: { x: 5, y: 0 }, captureRadius: 1 },
      { id: 'x', position: { x: -5, y: 0 }, captureRadius: 1 },
    ]);
    const moveSpy = vi.spyOn(sim, 'moveUnitTo');
    sim.spawnUnit({ id: 'u', position: { x: 0, y: 0 }, factionId: 'red' });
    const ai = createAiController(sim, { factionId: 'red' });
    ai.update(1);
    // Both sites are exactly 5 away — 'x' must win the tie-break.
    expect(moveSpy).toHaveBeenCalledWith('u', { x: -5, y: 0 });
  });

  it('prioritises a threatened owned site over expansion', () => {
    const sim = siteSim(
      [
        { id: 'home', position: { x: 20, y: 0 }, ownerFactionId: 'red', captureRadius: 12 },
        { id: 'near-neutral', position: { x: 2, y: 0 } },
      ],
      [{ id: 'red' }],
    );
    // An enemy sits inside 'home's capture radius (distance 5 <= 12).
    sim.spawnUnit({ id: 'enemy', position: { x: 25, y: 0 }, factionId: 'blue', attackDamage: 0 });
    const moveSpy = vi.spyOn(sim, 'moveUnitTo');
    // Our idle unit is much closer to the neutral site than to home.
    sim.spawnUnit({ id: 'defender', position: { x: 0, y: 0 }, factionId: 'red' });
    const ai = createAiController(sim, { factionId: 'red' });
    ai.update(1);
    expect(moveSpy).toHaveBeenCalledWith('defender', { x: 20, y: 0 });
  });

  it('never commands moving or fighting units', () => {
    const sim = siteSim([{ id: 's', position: { x: 50, y: 50 } }]);
    // Unit already travelling somewhere of its own accord.
    const traveller = sim.spawnUnit({ id: 'traveller', atNode: 'a', speed: 1, factionId: 'red' });
    sim.moveUnitTo('traveller', { x: 10, y: 0 }); // node b — far enough not to arrive this tick
    expect(traveller.state).toBe('moving');

    // Unit currently engaged in combat.
    sim.spawnUnit({
      id: 'fighter',
      position: { x: 0, y: 0 },
      factionId: 'red',
      attackDamage: 1,
    });
    sim.spawnUnit({ id: 'enemy', position: { x: 1, y: 0 }, factionId: 'blue', attackDamage: 0 });
    sim.tick(0.1);
    expect(sim.getUnit('fighter')!.state).toBe('fighting');

    const moveSpy = vi.spyOn(sim, 'moveUnitTo');
    const ai = createAiController(sim, { factionId: 'red' });
    ai.update(1);
    expect(moveSpy).not.toHaveBeenCalledWith('traveller', expect.anything());
    expect(moveSpy).not.toHaveBeenCalledWith('fighter', expect.anything());
  });

  it('does not re-command a unit already standing inside its target site’s captureRadius', () => {
    const sim = siteSim([{ id: 's', position: { x: 0, y: 0 }, captureRadius: 6 }]);
    const moveSpy = vi.spyOn(sim, 'moveUnitTo');
    // Standing right on the site's position — well inside its capture radius.
    sim.spawnUnit({ id: 'inside', position: { x: 0, y: 0 }, factionId: 'red' });
    const ai = createAiController(sim, { factionId: 'red' });
    ai.update(1);
    expect(moveSpy).not.toHaveBeenCalled();
  });

  it('commands the same unit once it stands outside the target site’s captureRadius', () => {
    const sim = siteSim([{ id: 's', position: { x: 0, y: 0 }, captureRadius: 6 }]);
    const moveSpy = vi.spyOn(sim, 'moveUnitTo');
    sim.spawnUnit({ id: 'outside', position: { x: 20, y: 0 }, factionId: 'red' });
    const ai = createAiController(sim, { factionId: 'red' });
    ai.update(1);
    expect(moveSpy).toHaveBeenCalledWith('outside', { x: 0, y: 0 });
  });
});

describe('createAiController — maxUnits validation', () => {
  it('falls back to the default 8 for a non-finite or negative maxUnits, but keeps 0 meaningful', () => {
    const home = (): SiteDefinition => ({ id: 'home', position: { x: 0, y: 0 }, ownerFactionId: 'red' });

    // 0 must still disable training entirely.
    const zero = siteSim([home()], [{ id: 'red', resources: 1000 }]);
    createAiController(zero, { factionId: 'red', maxUnits: 0, train: { cost: 0 } }).update(1);
    expect(zero.listUnits()).toEqual([]);

    // NaN and a negative value both fall back to the default (8), so
    // training still happens.
    const nan = siteSim([home()], [{ id: 'red', resources: 1000 }]);
    createAiController(nan, { factionId: 'red', maxUnits: Number.NaN, train: { cost: 0 } }).update(1);
    expect(nan.listUnits().length).toBe(1);

    const negative = siteSim([home()], [{ id: 'red', resources: 1000 }]);
    createAiController(negative, {
      factionId: 'red',
      maxUnits: -3,
      train: { cost: 0 },
    }).update(1);
    expect(negative.listUnits().length).toBe(1);
  });
});

describe('createAiController — determinism', () => {
  it('two opposing AI controllers replay identically across two runs', () => {
    const run = () => {
      const sim = createGameSimulation(fakeWorld(), {
        heightSampler: () => 5,
        sites: [
          { id: 's:red', position: { x: 0, y: 0 }, ownerFactionId: 'red', income: 1 },
          { id: 's:blue', position: { x: 10, y: 10 }, ownerFactionId: 'blue', income: 1 },
          { id: 'mid', position: { x: 10, y: 0 }, captureRadius: 8, captureTime: 0.5 },
        ],
        factions: [
          { id: 'red', resources: 30 },
          { id: 'blue', resources: 30 },
        ],
      });
      const events: GameEvent[] = [];
      sim.on((e) => events.push(e));

      // Red is stronger, so the clash at 'mid' has a deterministic winner
      // rather than a symmetric mutual kill.
      sim.spawnUnit({ id: 'red:1', atNode: 'a', factionId: 'red', hp: 60, attackDamage: 15 });
      sim.spawnUnit({ id: 'blue:1', atNode: 'c', factionId: 'blue', hp: 30, attackDamage: 5 });

      const redAi = createAiController(sim, {
        factionId: 'red',
        decisionInterval: 0.5,
        train: { cost: 10 },
      });
      const blueAi = createAiController(sim, {
        factionId: 'blue',
        decisionInterval: 0.5,
        train: { cost: 10 },
      });

      for (let i = 0; i < 100; i++) {
        redAi.update(0.1);
        blueAi.update(0.1);
        sim.tick(0.1);
      }

      const state = sim
        .listSites()
        .map((s) => `${s.id}:${String(s.ownerFactionId)}`)
        .concat(sim.listFactions().map((f) => `${f.id}:${f.resources.toFixed(4)}`));
      return { events, state };
    };

    const a = run();
    const b = run();
    // Sanity: the fixture really trains, moves, fights and captures.
    expect(a.events.some((e) => e.type === 'unit:combat')).toBe(true);
    expect(a.events.some((e) => e.type === 'site:captured')).toBe(true);
    expect(a.events.filter((e) => e.type === 'unit:spawned').length).toBeGreaterThan(2);
    expect(a.events).toEqual(b.events);
    expect(a.state).toEqual(b.state);
  });
});
