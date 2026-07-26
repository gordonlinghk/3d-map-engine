import { describe, expect, it } from 'vitest';
import type { MapWorld, RoadGraph } from '@map-engine/core';
import { createGameSimulation, type GameEvent } from './simulation';

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
      e.type === 'unit:combat' ? `${e.type}:${e.attackerId}` : `${e.type}:${e.unitId}`;
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
});
