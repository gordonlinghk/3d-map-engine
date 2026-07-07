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
    sim.on((e) => {
      order.push(`h1:${e.type}:${e.unitId}`);
      if (e.type === 'unit:arrived' && e.unitId === 'A') sim.removeUnit('B');
    });
    sim.on((e) => order.push(`h2:${e.type}:${e.unitId}`));
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
});
