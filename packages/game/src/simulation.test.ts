import { describe, expect, it } from 'vitest';
import type { MapWorld, RoadGraph } from '@map-engine/core';
import {
  createGameSimulation,
  type FactionDefinition,
  type GameEvent,
  type GameSimulationOptions,
  type SiteDefinition,
} from './simulation';

function squareGraph(): RoadGraph {
  return {
    nodes: [
      { id: 'a', position: { x: 0, y: 0, z: 0 } },
      { id: 'b', position: { x: 10, y: 0, z: 0 } },
      { id: 'c', position: { x: 10, y: 0, z: 10 } },
      { id: 'd', position: { x: 0, y: 0, z: 10 } },
      { id: 'lonely', position: { x: 100, y: 0, z: 100 } },
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

function makeSim() {
  return createGameSimulation(fakeWorld(), { heightSampler: () => 5 });
}

/** A sim with capturable sites (and optionally resource-holding factions). */
function siteSim(sites: SiteDefinition[], factions: FactionDefinition[] = []) {
  return createGameSimulation(fakeWorld(), { heightSampler: () => 5, sites, factions });
}

type SiteEvent = Extract<GameEvent, { siteId: string }>;

/** Site events only — drops the unit noise. */
function siteEvents(events: GameEvent[]): SiteEvent[] {
  return events.filter(
    (e): e is SiteEvent => e.type === 'site:capture-started' || e.type === 'site:captured',
  );
}

/** Tick until every unit stops moving (or a guard trips). Returns events seen. */
function runToRest(sim: ReturnType<typeof makeSim>, dt = 0.1, maxTicks = 500): GameEvent[] {
  const events: GameEvent[] = [];
  sim.on((e) => events.push(e));
  for (let i = 0; i < maxTicks; i++) {
    if (sim.listUnits().every((u) => u.state !== 'moving')) break;
    sim.tick(dt);
  }
  return events;
}

describe('createGameSimulation — spawning', () => {
  it('spawns a unit at a road node, idle, on the ground', () => {
    const sim = makeSim();
    const events: GameEvent[] = [];
    sim.on((e) => events.push(e));
    const u = sim.spawnUnit({ atNode: 'b', speed: 20, kind: 'soldier' });
    expect(u.state).toBe('idle');
    expect(u.position).toEqual({ x: 10, y: 5, z: 0 });
    expect(u.kind).toBe('soldier');
    expect(events).toEqual([{ type: 'unit:spawned', unitId: u.id }]);
    expect(sim.getUnit(u.id)).toBe(u);
  });

  it('spawns at an explicit XZ position (Vec2: .y = world z)', () => {
    const sim = makeSim();
    const u = sim.spawnUnit({ position: { x: 3, y: 7 } });
    expect(u.position.x).toBe(3);
    expect(u.position.z).toBe(7);
  });

  it('rejects duplicate ids and unknown nodes', () => {
    const sim = makeSim();
    sim.spawnUnit({ id: 'x', atNode: 'a' });
    expect(() => sim.spawnUnit({ id: 'x', atNode: 'a' })).toThrow();
    expect(() => sim.spawnUnit({ atNode: 'ghost' })).toThrow();
  });
});

describe('createGameSimulation — movement', () => {
  it('moves a unit to a reachable target and arrives once', () => {
    const sim = makeSim();
    const u = sim.spawnUnit({ atNode: 'a', speed: 100 });
    const ok = sim.moveUnitTo(u.id, { x: 10, y: 10 }); // near node c
    expect(ok).toBe(true);
    expect(u.state).toBe('moving');

    const events = runToRest(sim);
    expect(u.state).toBe('arrived');
    // Landed at (or extremely near) the target.
    expect(u.position.x).toBeCloseTo(10, 3);
    expect(u.position.z).toBeCloseTo(10, 3);
    expect(u.position.y).toBe(5); // ground sampled

    const arrivals = events.filter((e) => e.type === 'unit:arrived');
    expect(arrivals).toEqual([{ type: 'unit:arrived', unitId: u.id }]);
  });

  it('emits waypoint events in ascending node order', () => {
    const sim = makeSim();
    const u = sim.spawnUnit({ atNode: 'a', speed: 100 });
    sim.moveUnitTo(u.id, { x: 10, y: 10 });
    const events = runToRest(sim);
    const wp = events
      .filter((e): e is Extract<GameEvent, { type: 'unit:waypoint' }> => e.type === 'unit:waypoint')
      .map((e) => e.nodeIndex);
    // a→c is two hops (via b or d); intermediate + goal nodes reported ascending.
    expect(wp.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < wp.length; i++) expect(wp[i]).toBeGreaterThan(wp[i - 1]!);
    // 'arrived' comes after the final waypoint.
    expect(events[events.length - 1]).toEqual({ type: 'unit:arrived', unitId: u.id });
  });

  it('returns false and leaves the unit idle for an unreachable target', () => {
    const sim = makeSim();
    const u = sim.spawnUnit({ atNode: 'a' });
    const ok = sim.moveUnitTo(u.id, { x: 100, y: 100 }); // snaps to 'lonely'
    expect(ok).toBe(false);
    expect(u.state).toBe('idle');
  });

  it('never overshoots the path end', () => {
    const sim = makeSim();
    const u = sim.spawnUnit({ atNode: 'a', speed: 1000 }); // huge step
    sim.moveUnitTo(u.id, { x: 10, y: 0 }); // node b, 10 units away
    sim.tick(1); // would travel 1000 units
    expect(u.state).toBe('arrived');
    expect(u.position.x).toBeCloseTo(10, 3);
    expect(u.progress).toBeLessThanOrEqual(11);
  });

  it('updates heading toward the direction of travel', () => {
    const sim = makeSim();
    const u = sim.spawnUnit({ atNode: 'a', speed: 5 });
    sim.moveUnitTo(u.id, { x: 10, y: 0 }); // move along +x toward b
    sim.tick(0.1);
    // heading = atan2(dx, dz); pure +x movement → atan2(1,0) = PI/2.
    expect(u.heading).toBeCloseTo(Math.PI / 2, 2);
  });

  it('stopUnit halts a moving unit in place', () => {
    const sim = makeSim();
    const u = sim.spawnUnit({ atNode: 'a', speed: 5 });
    sim.moveUnitTo(u.id, { x: 10, y: 10 });
    sim.tick(0.2);
    sim.stopUnit(u.id);
    expect(u.state).toBe('idle');
    expect(u.path).toBeNull();
    const x = u.position.x;
    sim.tick(1);
    expect(u.position.x).toBe(x); // no further movement
  });
});

describe('createGameSimulation — removal & safety', () => {
  it('removes a unit mid-path and is safe to keep ticking', () => {
    const sim = makeSim();
    const events: GameEvent[] = [];
    sim.on((e) => events.push(e));
    const u = sim.spawnUnit({ atNode: 'a', speed: 5 });
    sim.moveUnitTo(u.id, { x: 10, y: 10 });
    sim.tick(0.1);
    sim.removeUnit(u.id);
    expect(sim.getUnit(u.id)).toBeUndefined();
    expect(events.some((e) => e.type === 'unit:removed' && e.unitId === u.id)).toBe(true);
    expect(() => sim.tick(1)).not.toThrow();
  });

  it('delivers events in strict emission order even when a handler mutates the sim', () => {
    const sim = makeSim();
    const order: string[] = [];
    // Handler 1 re-enters the sim: removing B while delivering A's arrival
    // enqueues a nested event. Every event must still reach h1 before h2.
    const label = (e: GameEvent): string =>
      e.type === 'unit:combat'
        ? `${e.type}:${e.attackerId}`
        : e.type === 'site:capture-started' || e.type === 'site:captured'
          ? `${e.type}:${e.siteId}`
          : `${e.type}:${e.unitId}`;
    sim.on((e) => {
      order.push(`h1:${label(e)}`);
      if (e.type === 'unit:arrived' && e.unitId === 'A') sim.removeUnit('B');
    });
    sim.on((e) => order.push(`h2:${label(e)}`));
    sim.spawnUnit({ id: 'A', atNode: 'a', speed: 1000 });
    sim.spawnUnit({ id: 'B', atNode: 'c' });
    sim.moveUnitTo('A', { x: 10, y: 0 }); // node b, arrives next tick
    sim.tick(1);
    // arrived:A is fully delivered (h1 then h2) before removed:B — the nested
    // emit does not jump the queue. (Under a re-entrant flush it would.)
    expect(order.indexOf('h2:unit:arrived:A')).toBeLessThan(order.indexOf('h1:unit:removed:B'));
  });

  it('unsubscribe stops delivering events', () => {
    const sim = makeSim();
    const seen: GameEvent[] = [];
    const off = sim.on((e) => seen.push(e));
    sim.spawnUnit({ id: 'one', atNode: 'a' });
    off();
    sim.spawnUnit({ id: 'two', atNode: 'b' });
    expect(seen).toEqual([{ type: 'unit:spawned', unitId: 'one' }]);
  });
});

describe('createGameSimulation — factions & combat', () => {
  it('defaults every unit to a non-combatant with full hp', () => {
    const sim = makeSim();
    const u = sim.spawnUnit({ atNode: 'a' });
    expect(u.factionId).toBeNull();
    expect(u.hp).toBe(100);
    expect(u.maxHp).toBe(100);
    expect(u.attackDamage).toBe(10);
    expect(u.attackRange).toBe(8);
  });

  it('two enemies in range damage each other by attackDamage * dt', () => {
    const sim = makeSim();
    const events: GameEvent[] = [];
    sim.on((e) => events.push(e));
    const a = sim.spawnUnit({ id: 'A', position: { x: 0, y: 0 }, factionId: 'red' });
    const b = sim.spawnUnit({ id: 'B', position: { x: 3, y: 0 }, factionId: 'blue' });
    sim.tick(0.5);
    expect(a.hp).toBeCloseTo(95, 6);
    expect(b.hp).toBeCloseTo(95, 6);
    expect(a.state).toBe('fighting');
    expect(b.state).toBe('fighting');
    expect(events.filter((e) => e.type === 'unit:combat')).toEqual([
      { type: 'unit:combat', attackerId: 'A', defenderId: 'B', damage: 5 },
      { type: 'unit:combat', attackerId: 'B', defenderId: 'A', damage: 5 },
    ]);
  });

  it('ignores enemies beyond attackRange and only fights across factions', () => {
    const sim = makeSim();
    const events: GameEvent[] = [];
    sim.on((e) => events.push(e));
    sim.spawnUnit({ id: 'far1', position: { x: 0, y: 0 }, factionId: 'red', attackRange: 4 });
    sim.spawnUnit({ id: 'far2', position: { x: 5, y: 0 }, factionId: 'blue', attackRange: 4 });
    sim.tick(1);
    expect(events.some((e) => e.type === 'unit:combat')).toBe(false);
    expect(sim.getUnit('far1')!.hp).toBe(100);
  });

  it('never fights null-faction or same-faction neighbours', () => {
    const sim = makeSim();
    const events: GameEvent[] = [];
    sim.on((e) => events.push(e));
    // Non-combatant next to a soldier: neither attacks nor is targeted.
    const civ = sim.spawnUnit({ id: 'civ', position: { x: 0, y: 0 } });
    const soldier = sim.spawnUnit({ id: 'sol', position: { x: 1, y: 0 }, factionId: 'red' });
    // Two units of the same faction.
    const ally = sim.spawnUnit({ id: 'ally', position: { x: 2, y: 0 }, factionId: 'red' });
    sim.tick(1);
    expect(events.some((e) => e.type === 'unit:combat')).toBe(false);
    expect([civ.hp, soldier.hp, ally.hp]).toEqual([100, 100, 100]);
    expect([civ.state, soldier.state, ally.state]).toEqual(['idle', 'idle', 'idle']);
  });

  it('targets the nearest enemy, breaking ties on the smaller unit id', () => {
    const sim = makeSim();
    const events: GameEvent[] = [];
    sim.on((e) => events.push(e));
    sim.spawnUnit({ id: 'hero', position: { x: 0, y: 0 }, factionId: 'red', attackDamage: 1 });
    sim.spawnUnit({ id: 'far', position: { x: 5, y: 0 }, factionId: 'blue', attackDamage: 0 });
    sim.spawnUnit({ id: 'near-z', position: { x: 2, y: 0 }, factionId: 'blue', attackDamage: 0 });
    sim.spawnUnit({ id: 'near-a', position: { x: 0, y: 2 }, factionId: 'blue', attackDamage: 0 });
    sim.tick(1);
    const hits = events.filter(
      (e): e is Extract<GameEvent, { type: 'unit:combat' }> => e.type === 'unit:combat',
    );
    // Both 'near-*' sit at distance 2; the smaller id wins.
    expect(hits).toEqual([
      { type: 'unit:combat', attackerId: 'hero', defenderId: 'near-a', damage: 1 },
    ]);
  });

  it('emits unit:defeated then unit:removed, and forgets the unit', () => {
    const sim = makeSim();
    const events: GameEvent[] = [];
    sim.on((e) => events.push(e));
    sim.spawnUnit({ id: 'A', position: { x: 0, y: 0 }, factionId: 'red', attackDamage: 100 });
    sim.spawnUnit({
      id: 'B',
      position: { x: 1, y: 0 },
      factionId: 'blue',
      hp: 10,
      attackDamage: 0,
    });
    sim.tick(1);
    expect(events.filter((e) => e.type !== 'unit:spawned')).toEqual([
      { type: 'unit:combat', attackerId: 'A', defenderId: 'B', damage: 100 },
      { type: 'unit:defeated', unitId: 'B', attackerId: 'A' },
      { type: 'unit:removed', unitId: 'B' },
    ]);
    expect(sim.getUnit('B')).toBeUndefined();
    expect(sim.listUnits().map((u) => u.id)).toEqual(['A']);
    expect(() => sim.tick(1)).not.toThrow();
  });

  it('removes both units on a simultaneous mutual kill', () => {
    const sim = makeSim();
    const events: GameEvent[] = [];
    sim.on((e) => events.push(e));
    const at = (x: number) => ({ x, y: 0 });
    sim.spawnUnit({ id: 'A', position: at(0), factionId: 'red', hp: 10, attackDamage: 50 });
    sim.spawnUnit({ id: 'B', position: at(1), factionId: 'blue', hp: 10, attackDamage: 50 });
    sim.tick(1);
    // Damage is computed for both before either is applied → both die.
    expect(events.filter((e) => e.type !== 'unit:spawned')).toEqual([
      { type: 'unit:combat', attackerId: 'A', defenderId: 'B', damage: 50 },
      { type: 'unit:combat', attackerId: 'B', defenderId: 'A', damage: 50 },
      { type: 'unit:defeated', unitId: 'A', attackerId: 'B' },
      { type: 'unit:removed', unitId: 'A' },
      { type: 'unit:defeated', unitId: 'B', attackerId: 'A' },
      { type: 'unit:removed', unitId: 'B' },
    ]);
    expect(sim.listUnits()).toEqual([]);
  });

  it('suspends movement while engaged and resumes when the enemy dies', () => {
    const sim = makeSim();
    const u = sim.spawnUnit({
      id: 'A',
      atNode: 'a',
      speed: 10,
      factionId: 'red',
      attackDamage: 100,
    });
    sim.spawnUnit({
      id: 'B',
      position: { x: 2, y: 0 },
      factionId: 'blue',
      hp: 5,
      attackDamage: 0,
    });
    sim.moveUnitTo('A', { x: 10, y: 10 });
    expect(u.state).toBe('moving');

    sim.tick(0.1); // engaged: holds position, kills B
    expect(u.state).toBe('fighting');
    expect(u.progress).toBe(0);
    expect(u.position.x).toBe(0);
    expect(u.path).not.toBeNull();
    expect(sim.getUnit('B')).toBeUndefined();

    sim.tick(0.1); // disengaged: resumes the preserved route
    expect(u.state).toBe('moving');
    expect(u.progress).toBeCloseTo(1, 6);
  });

  it('restores the pre-fight resting state (arrived is not re-fired)', () => {
    const sim = makeSim();
    const u = sim.spawnUnit({ id: 'A', atNode: 'a', speed: 1000, factionId: 'red' });
    sim.moveUnitTo('A', { x: 10, y: 0 }); // node b
    sim.tick(1);
    expect(u.state).toBe('arrived');

    const events: GameEvent[] = [];
    sim.on((e) => events.push(e));
    // An enemy walks into range of the resting unit, then is removed.
    sim.spawnUnit({ id: 'B', position: { x: 12, y: 0 }, factionId: 'blue', attackDamage: 0 });
    sim.tick(0.1);
    expect(u.state).toBe('fighting');
    sim.removeUnit('B');
    sim.tick(0.1);
    expect(u.state).toBe('arrived');
    expect(events.some((e) => e.type === 'unit:arrived')).toBe(false);
  });

  it('hp never regenerates, and dt = 0 resolves no combat', () => {
    const sim = makeSim();
    const a = sim.spawnUnit({ id: 'A', position: { x: 0, y: 0 }, factionId: 'red' });
    sim.spawnUnit({ id: 'B', position: { x: 1, y: 0 }, factionId: 'blue' });
    sim.tick(0.5);
    expect(a.hp).toBeCloseTo(95, 6);
    const wounded = a.hp;
    sim.tick(0); // zero-dt tick resolves nothing
    expect(a.hp).toBe(wounded);
    sim.removeUnit('B');
    sim.tick(1);
    expect(a.hp).toBe(wounded); // no healing once the fight is over
    expect(a.maxHp).toBe(100);
    expect(a.state).toBe('idle');
  });
});

describe('createGameSimulation — edgeCost option', () => {
  it('routes around an edge the hook marks impassable', () => {
    const sim = createGameSimulation(fakeWorld(), {
      heightSampler: () => 5,
      edgeCost: (edge, _from, _to, base) => (edge.id === 'ab' ? Infinity : base),
    });
    const u = sim.spawnUnit({ atNode: 'a' });
    expect(sim.moveUnitTo(u.id, { x: 10, y: 0 })).toBe(true); // node b
    expect(u.path!.nodes).toEqual(['a', 'd', 'c', 'b']);
  });
});

describe('createGameSimulation — sites & capture', () => {
  it('registers sites and factions, defaults junk numbers, and rejects duplicate ids', () => {
    const sim = siteSim(
      [
        { id: 's1', position: { x: 0, y: 0 } },
        {
          id: 's2',
          name: '洛陽',
          position: { x: 10, y: 0 },
          ownerFactionId: 'red',
          captureRadius: -1,
          captureTime: Number.NaN,
          income: -5,
          data: { garrison: 3 },
        },
      ],
      [{ id: 'red', resources: 30, income: 2 }, { id: 'blue' }],
    );
    expect(sim.listSites().map((s) => s.id)).toEqual(['s1', 's2']);
    const s1 = sim.getSite('s1')!;
    const s2 = sim.getSite('s2')!;
    expect(s1).toMatchObject({
      name: 's1',
      captureRadius: 12,
      captureTime: 5,
      income: 1,
      ownerFactionId: null,
      capturingFactionId: null,
      captureProgress: 0,
    });
    expect(s1.position).toEqual({ x: 0, y: 5, z: 0 }); // Vec2 .y → world z, snapped
    // Junk radius/time fall back to their defaults; a negative income becomes 0.
    expect(s2).toMatchObject({
      name: '洛陽',
      captureRadius: 12,
      captureTime: 5,
      income: 0,
      ownerFactionId: 'red',
    });
    expect(s2.data).toEqual({ garrison: 3 });
    expect(sim.getSite('ghost')).toBeUndefined();

    expect(sim.listFactions().map((f) => f.id)).toEqual(['red', 'blue']);
    expect(sim.getFaction('red')).toMatchObject({ resources: 30, baseIncome: 2 });
    expect(sim.getFaction('blue')).toMatchObject({ resources: 0, baseIncome: 0 });
    expect(sim.getFaction('ghost')).toBeUndefined();

    expect(() =>
      siteSim([
        { id: 'dup', position: { x: 0, y: 0 } },
        { id: 'dup', position: { x: 1, y: 1 } },
      ]),
    ).toThrow();
    expect(() => siteSim([], [{ id: 'f' }, { id: 'f' }])).toThrow();
  });

  it('emits the same event stream with no sites or factions as with empty ones', () => {
    const run = (o: GameSimulationOptions): GameEvent[] => {
      const sim = createGameSimulation(fakeWorld(), { heightSampler: () => 5, ...o });
      const events: GameEvent[] = [];
      sim.on((e) => events.push(e));
      sim.spawnUnit({ id: 'red:1', atNode: 'a', speed: 13, factionId: 'red', hp: 40 });
      sim.spawnUnit({ id: 'blue:1', atNode: 'b', speed: 11, factionId: 'blue', hp: 40 });
      sim.moveUnitTo('red:1', { x: 10, y: 0 });
      sim.moveUnitTo('blue:1', { x: 0, y: 0 });
      for (let i = 0; i < 60; i++) sim.tick(0.1);
      return events;
    };
    const plain = run({});
    // Sanity: the fixture is a real fight, not an empty stream.
    expect(plain.some((e) => e.type === 'unit:defeated')).toBe(true);
    expect(run({ sites: [], factions: [] })).toEqual(plain);
  });

  it('a lone enemy accrues progress and flips ownership at captureTime', () => {
    const sim = siteSim(
      [{ id: 's', position: { x: 0, y: 0 }, captureRadius: 5, captureTime: 1, ownerFactionId: 'blue' }],
      [{ id: 'red' }],
    );
    const events: GameEvent[] = [];
    sim.on((e) => events.push(e));
    sim.spawnUnit({ id: 'R', position: { x: 2, y: 0 }, factionId: 'red' });
    sim.tick(0.4);
    const s = sim.getSite('s')!;
    expect(siteEvents(events)).toEqual([
      { type: 'site:capture-started', siteId: 's', factionId: 'red' },
    ]);
    expect(s.capturingFactionId).toBe('red');
    expect(s.captureProgress).toBeCloseTo(0.4, 6);
    expect(s.ownerFactionId).toBe('blue'); // not yet

    sim.tick(0.7); // 1.1 >= captureTime
    expect(s.ownerFactionId).toBe('red');
    expect(s.capturingFactionId).toBeNull();
    expect(s.captureProgress).toBe(0);
    expect(siteEvents(events)[1]).toEqual({
      type: 'site:captured',
      siteId: 's',
      factionId: 'red',
      previousOwnerFactionId: 'blue',
    });
  });

  it('freezes progress when the owner is present, and when two factions attack', () => {
    const sim = siteSim([
      { id: 's', position: { x: 0, y: 0 }, captureRadius: 5, captureTime: 10, ownerFactionId: 'blue' },
    ]);
    const s = sim.getSite('s')!;
    sim.spawnUnit({ id: 'R', position: { x: 2, y: 0 }, factionId: 'red', attackDamage: 0 });
    sim.tick(0.5);
    expect(s.captureProgress).toBeCloseTo(0.5, 6);

    // The owner walks in: contested, so progress stops without resetting.
    sim.spawnUnit({ id: 'B', position: { x: 1, y: 0 }, factionId: 'blue', attackDamage: 0 });
    sim.tick(0.5);
    expect(s.captureProgress).toBeCloseTo(0.5, 6);
    expect(s.capturingFactionId).toBe('red');

    // Owner leaves, a third faction arrives: two attackers, still frozen.
    sim.removeUnit('B');
    sim.spawnUnit({ id: 'G', position: { x: 0, y: 2 }, factionId: 'green', attackDamage: 0 });
    sim.tick(0.5);
    expect(s.captureProgress).toBeCloseTo(0.5, 6);
    expect(s.ownerFactionId).toBe('blue');
  });

  it('decays progress once the attackers leave and clears the capturer at zero', () => {
    const sim = siteSim([{ id: 's', position: { x: 0, y: 0 }, captureRadius: 5, captureTime: 10 }]);
    const s = sim.getSite('s')!;
    sim.spawnUnit({ id: 'R', position: { x: 1, y: 0 }, factionId: 'red' });
    sim.tick(0.6);
    expect(s.captureProgress).toBeCloseTo(0.6, 6);

    sim.removeUnit('R');
    sim.tick(0.2);
    expect(s.captureProgress).toBeCloseTo(0.4, 6);
    expect(s.capturingFactionId).toBe('red'); // still holding a partial claim

    sim.tick(5); // decay clamps at zero
    expect(s.captureProgress).toBe(0);
    expect(s.capturingFactionId).toBeNull();
  });

  it('resets progress and re-emits capture-started when the sole attacker changes', () => {
    const sim = siteSim([{ id: 's', position: { x: 0, y: 0 }, captureRadius: 5, captureTime: 10 }]);
    const events: GameEvent[] = [];
    sim.on((e) => events.push(e));
    sim.spawnUnit({ id: 'R', position: { x: 1, y: 0 }, factionId: 'red', attackDamage: 0 });
    sim.tick(0.5);
    sim.removeUnit('R');
    sim.spawnUnit({ id: 'G', position: { x: 1, y: 0 }, factionId: 'green', attackDamage: 0 });
    sim.tick(0.3);
    const s = sim.getSite('s')!;
    expect(s.capturingFactionId).toBe('green');
    expect(s.captureProgress).toBeCloseTo(0.3, 6);
    expect(siteEvents(events)).toEqual([
      { type: 'site:capture-started', siteId: 's', factionId: 'red' },
      { type: 'site:capture-started', siteId: 's', factionId: 'green' },
    ]);
  });

  it('captures a neutral site with previousOwnerFactionId null, both events in one tick', () => {
    const sim = siteSim([{ id: 's', position: { x: 0, y: 0 }, captureRadius: 5, captureTime: 0.5 }]);
    const events: GameEvent[] = [];
    sim.on((e) => events.push(e));
    sim.spawnUnit({ id: 'R', position: { x: 0, y: 0 }, factionId: 'red' });
    sim.tick(0.5);
    expect(siteEvents(events)).toEqual([
      { type: 'site:capture-started', siteId: 's', factionId: 'red' },
      { type: 'site:captured', siteId: 's', factionId: 'red', previousOwnerFactionId: null },
    ]);
  });

  it('does not count a unit killed in the damage phase of the same tick', () => {
    const sim = siteSim([
      { id: 's', position: { x: 0, y: 0 }, captureRadius: 5, captureTime: 1, ownerFactionId: 'blue' },
    ]);
    const events: GameEvent[] = [];
    sim.on((e) => events.push(e));
    // The red attacker stands on the site; a blue sniper outside the radius
    // kills it in phase 3, so phase 4 sees no attacker at all.
    sim.spawnUnit({ id: 'R', position: { x: 0, y: 0 }, factionId: 'red', hp: 5, attackDamage: 0 });
    sim.spawnUnit({ id: 'B', position: { x: 6, y: 0 }, factionId: 'blue', attackDamage: 100 });
    sim.tick(0.5);
    expect(sim.getUnit('R')).toBeUndefined();
    const s = sim.getSite('s')!;
    expect(s.captureProgress).toBe(0);
    expect(s.capturingFactionId).toBeNull();
    expect(siteEvents(events)).toEqual([]);
  });

  it('ignores non-combatants entirely', () => {
    const sim = siteSim([{ id: 's', position: { x: 0, y: 0 }, captureRadius: 5, captureTime: 1 }]);
    sim.spawnUnit({ id: 'civ', position: { x: 0, y: 0 } });
    sim.tick(2);
    const s = sim.getSite('s')!;
    expect(s.ownerFactionId).toBeNull();
    expect(s.captureProgress).toBe(0);
  });

  it('emits site events after the combat and defeat pairs, in declaration order', () => {
    const sim = siteSim([
      { id: 's1', position: { x: 0, y: 0 }, captureRadius: 5, captureTime: 0.1 },
      { id: 's2', position: { x: 10, y: 0 }, captureRadius: 5, captureTime: 0.1 },
    ]);
    const events: GameEvent[] = [];
    sim.on((e) => events.push(e));
    sim.spawnUnit({ id: 'R1', position: { x: 0, y: 0 }, factionId: 'red', attackDamage: 100 });
    sim.spawnUnit({ id: 'R2', position: { x: 10, y: 0 }, factionId: 'red', attackDamage: 0 });
    // Dies this tick, so it never contests s1.
    sim.spawnUnit({ id: 'B1', position: { x: 1, y: 0 }, factionId: 'blue', hp: 5, attackDamage: 0 });
    sim.tick(0.2);
    expect(events.filter((e) => e.type !== 'unit:spawned').map((e) => e.type)).toEqual([
      'unit:combat',
      'unit:defeated',
      'unit:removed',
      'site:capture-started',
      'site:captured',
      'site:capture-started',
      'site:captured',
    ]);
    expect(siteEvents(events).map((e) => e.siteId)).toEqual(['s1', 's1', 's2', 's2']);
  });
});

describe('createGameSimulation — resources & training', () => {
  it('pays base income plus owned-site income, crediting a capture on the same tick', () => {
    const sim = siteSim(
      [{ id: 's', position: { x: 0, y: 0 }, captureRadius: 5, captureTime: 0.5, income: 4 }],
      [{ id: 'red', income: 1 }],
    );
    sim.spawnUnit({ id: 'R', position: { x: 0, y: 0 }, factionId: 'red' });
    sim.tick(0.5); // captured during this tick → already earns the site's income
    expect(sim.getFaction('red')!.resources).toBeCloseTo(2.5, 6);
    sim.tick(1);
    expect(sim.getFaction('red')!.resources).toBeCloseTo(7.5, 6);
  });

  it('pays nothing for a siteless faction and nothing at all to unregistered owners', () => {
    const sim = siteSim(
      [{ id: 's', position: { x: 0, y: 0 }, income: 9, ownerFactionId: 'ghost' }],
      [{ id: 'red', income: 2 }, { id: 'blue' }],
    );
    sim.tick(1);
    expect(sim.getFaction('red')!.resources).toBeCloseTo(2, 6);
    expect(sim.getFaction('blue')!.resources).toBe(0);
    expect(sim.getFaction('ghost')).toBeUndefined();
  });

  it('trainUnit spawns at the owned site and every invalid call is a no-op null', () => {
    const sim = siteSim(
      [
        { id: 'own', position: { x: 10, y: 0 }, ownerFactionId: 'red' },
        { id: 'theirs', position: { x: 0, y: 10 }, ownerFactionId: 'blue' },
      ],
      [{ id: 'red', resources: 50 }],
    );
    const events: GameEvent[] = [];
    sim.on((e) => events.push(e));
    const u = sim.trainUnit('red', {
      siteId: 'own',
      cost: 20,
      id: 'T1',
      unit: { kind: 'soldier', speed: 9 },
    });
    expect(u).not.toBeNull();
    expect(u!.position).toEqual({ x: 10, y: 5, z: 0 });
    expect([u!.factionId, u!.kind, u!.speed, u!.state]).toEqual(['red', 'soldier', 9, 'idle']);
    expect(sim.getFaction('red')!.resources).toBe(30);
    expect(events).toEqual([{ type: 'unit:spawned', unitId: 'T1' }]);

    expect(sim.trainUnit('ghost', { siteId: 'own', cost: 1 })).toBeNull(); // unregistered
    expect(sim.trainUnit('red', { siteId: 'nope', cost: 1 })).toBeNull(); // unknown site
    expect(sim.trainUnit('red', { siteId: 'theirs', cost: 1 })).toBeNull(); // not ours
    expect(sim.trainUnit('red', { siteId: 'own', cost: -1 })).toBeNull(); // negative
    expect(sim.trainUnit('red', { siteId: 'own', cost: Infinity })).toBeNull(); // non-finite
    expect(sim.trainUnit('red', { siteId: 'own', cost: 31 })).toBeNull(); // unaffordable
    expect(sim.getFaction('red')!.resources).toBe(30);
    expect(sim.listUnits().map((x) => x.id)).toEqual(['T1']);

    // A duplicate id throws, but only after refusing to spend anything.
    expect(() => sim.trainUnit('red', { siteId: 'own', cost: 5, id: 'T1' })).toThrow();
    expect(sim.getFaction('red')!.resources).toBe(30);
    // Free training is legal, and exact-cost training is affordable.
    expect(sim.trainUnit('red', { siteId: 'own', cost: 0 })).not.toBeNull();
    expect(sim.trainUnit('red', { siteId: 'own', cost: 30 })).not.toBeNull();
    expect(sim.getFaction('red')!.resources).toBe(0);
  });

  it('trainUnit with no explicit id throws before spending when it collides with the auto-generated candidate', () => {
    const sim = siteSim(
      [{ id: 'own', position: { x: 10, y: 0 }, ownerFactionId: 'red' }],
      [{ id: 'red', resources: 50 }],
    );
    // Claim the id spawnUnit would auto-generate next ('unit:0', since
    // autoId starts at 0 and this is the sim's first spawn) with an
    // explicitly-id'd unit, then call trainUnit with no id of its own.
    sim.spawnUnit({ id: 'unit:0' });
    expect(() => sim.trainUnit('red', { siteId: 'own', cost: 20 })).toThrow();
    expect(sim.getFaction('red')!.resources).toBe(50);
    expect(sim.listUnits().map((x) => x.id)).toEqual(['unit:0']);
  });

  it('leaves capture progress, ownership and resources untouched for dt <= 0', () => {
    const sim = siteSim(
      [{ id: 's', position: { x: 0, y: 0 }, captureRadius: 5, captureTime: 1, income: 5 }],
      [{ id: 'red', income: 3, resources: 1 }],
    );
    sim.spawnUnit({ id: 'R', position: { x: 0, y: 0 }, factionId: 'red' });
    sim.tick(0);
    sim.tick(-1);
    const s = sim.getSite('s')!;
    expect(s.captureProgress).toBe(0);
    expect(s.ownerFactionId).toBeNull();
    expect(sim.getFaction('red')!.resources).toBe(1);
  });
});

describe('createGameSimulation — determinism', () => {
  it('produces identical positions and event streams across runs', () => {
    const run = () => {
      const sim = makeSim();
      const events: GameEvent[] = [];
      sim.on((e) => events.push(e));
      const u = sim.spawnUnit({ id: 'runner', atNode: 'a', speed: 37 });
      sim.moveUnitTo(u.id, { x: 10, y: 10 });
      for (let i = 0; i < 40; i++) sim.tick(0.1);
      return { pos: { ...u.position }, events };
    };
    const a = run();
    const b = run();
    expect(a.events).toEqual(b.events);
    expect(a.pos).toEqual(b.pos);
  });

  it('produces identical event logs and hp for identical combat runs', () => {
    const run = () => {
      const sim = makeSim();
      const events: GameEvent[] = [];
      sim.on((e) => events.push(e));
      // Two columns converging on the square, plus a bystander and a courier.
      sim.spawnUnit({ id: 'red:1', atNode: 'a', speed: 13, factionId: 'red', hp: 40 });
      sim.spawnUnit({ id: 'blue:1', atNode: 'b', speed: 11, factionId: 'blue', hp: 40 });
      sim.spawnUnit({ id: 'blue:2', atNode: 'c', speed: 17, factionId: 'blue', hp: 25 });
      sim.spawnUnit({ id: 'civ:1', atNode: 'd', speed: 7 });
      sim.moveUnitTo('red:1', { x: 10, y: 0 });
      sim.moveUnitTo('blue:1', { x: 0, y: 0 });
      sim.moveUnitTo('blue:2', { x: 0, y: 10 });
      sim.moveUnitTo('civ:1', { x: 10, y: 10 });
      for (let i = 0; i < 60; i++) sim.tick(0.1);
      const state = sim
        .listUnits()
        .map((u) => `${u.id}:${u.state}:${u.hp.toFixed(4)}:${u.position.x.toFixed(4)}`);
      return { events, state };
    };
    const a = run();
    const b = run();
    // Sanity: the fixture actually fights and kills someone.
    expect(a.events.some((e) => e.type === 'unit:combat')).toBe(true);
    expect(a.events.some((e) => e.type === 'unit:defeated')).toBe(true);
    expect(a.events).toEqual(b.events);
    expect(a.state).toEqual(b.state);
  });

  it('replays identically with sites, capture, income and training in play', () => {
    const run = () => {
      const sim = createGameSimulation(fakeWorld(), {
        heightSampler: () => 5,
        sites: [
          { id: 's:a', position: { x: 0, y: 0 }, captureRadius: 6, captureTime: 1.5, income: 4 },
          {
            id: 's:c',
            position: { x: 10, y: 10 },
            captureRadius: 6,
            captureTime: 1.5,
            income: 2,
            ownerFactionId: 'blue',
          },
        ],
        factions: [
          { id: 'red', resources: 20, income: 1 },
          { id: 'blue', resources: 20, income: 1 },
        ],
      });
      const events: GameEvent[] = [];
      sim.on((e) => events.push(e));
      // Head-on along edge a–b: they engage almost immediately and trade to
      // death, while red holds s:a long enough to take it.
      sim.spawnUnit({ id: 'red:1', atNode: 'a', speed: 13, factionId: 'red', hp: 40 });
      sim.spawnUnit({ id: 'blue:1', atNode: 'b', speed: 11, factionId: 'blue', hp: 40 });
      sim.moveUnitTo('red:1', { x: 10, y: 0 });
      sim.moveUnitTo('blue:1', { x: 0, y: 0 });
      for (let i = 0; i < 60; i++) {
        sim.tick(0.1);
        if (i === 20) sim.trainUnit('red', { siteId: 's:a', cost: 10, unit: { attackDamage: 5 } });
      }
      const state = sim
        .listSites()
        .map((s) => `${s.id}:${String(s.ownerFactionId)}:${s.captureProgress.toFixed(4)}`)
        .concat(sim.listFactions().map((f) => `${f.id}:${f.resources.toFixed(4)}`));
      return { events, state };
    };
    const a = run();
    const b = run();
    // Sanity: the fixture really captures, fights and trains.
    expect(a.events.some((e) => e.type === 'site:captured')).toBe(true);
    expect(a.events.some((e) => e.type === 'unit:combat')).toBe(true);
    expect(a.events.some((e) => e.type === 'unit:spawned' && e.unitId === 'unit:0')).toBe(true);
    expect(a.events).toEqual(b.events);
    expect(a.state).toEqual(b.state);
  });
});
