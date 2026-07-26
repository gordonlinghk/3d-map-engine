import { describe, expect, it } from 'vitest';
import { generateWorld, getPresetConfig } from '@map-engine/core';
import type { RoadGraph } from '@map-engine/core';
import { buildGraphIndex, findPath, findPathBetweenPoints, nearestNode } from './pathfinding';

/** A tiny hand-built graph: a 4-node square with a diagonal shortcut. */
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

describe('findPath (hand-built graph)', () => {
  const index = buildGraphIndex(squareGraph());

  it('same-node path is trivial with zero cost', () => {
    const p = findPath(index, 'a', 'a');
    expect(p.found).toBe(true);
    expect(p.nodes).toEqual(['a']);
    expect(p.cost).toBe(0);
  });

  it('finds the shortest of two equal-hop routes', () => {
    // a→b→c and a→d→c are both length 20; deterministic tie-break picks one.
    const p = findPath(index, 'a', 'c');
    expect(p.found).toBe(true);
    expect(p.cost).toBeCloseTo(20, 6);
    expect(p.nodes[0]).toBe('a');
    expect(p.nodes[p.nodes.length - 1]).toBe('c');
    expect(p.nodes).toHaveLength(3);
    // Path points are parallel to node ids.
    expect(p.points).toHaveLength(p.nodes.length);
    expect(p.points[0]).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('traverses edges in both directions (undirected)', () => {
    const p = findPath(index, 'b', 'a');
    expect(p.found).toBe(true);
    expect(p.cost).toBeCloseTo(10, 6);
    expect(p.nodes).toEqual(['b', 'a']);
  });

  it('returns not-found for a disconnected node', () => {
    const p = findPath(index, 'a', 'lonely');
    expect(p.found).toBe(false);
    expect(p.nodes).toEqual([]);
    expect(p.cost).toBe(Infinity);
  });

  it('returns not-found for unknown ids', () => {
    expect(findPath(index, 'a', 'nope').found).toBe(false);
    expect(findPath(index, 'nope', 'a').found).toBe(false);
  });

  it('is deterministic across repeated queries', () => {
    const a = findPath(index, 'a', 'c');
    const b = findPath(index, 'a', 'c');
    expect(a).toEqual(b);
  });
});

describe('buildGraphIndex — edgeCost weighting', () => {
  const graph = squareGraph();

  it('leaves routes and costs untouched when no hook is given', () => {
    // Baseline fixture: a→c is 20 either way, b→a is 10, and the chosen route is
    // stable. Passing no `edgeCost` must reproduce all of it exactly.
    const plain = buildGraphIndex(graph);
    expect(findPath(plain, 'a', 'c')).toEqual({
      found: true,
      nodes: ['a', 'b', 'c'],
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
        { x: 10, y: 0, z: 10 },
      ],
      cost: 20,
    });
    // An identity hook (returns baseCost) is indistinguishable from no hook.
    const identity = buildGraphIndex(graph, { edgeCost: (_e, _f, _t, base) => base });
    expect(findPath(identity, 'a', 'c')).toEqual(findPath(plain, 'a', 'c'));
  });

  it('receives the edge, both endpoints and the geometric base cost', () => {
    const seen: { id: string; from: string; to: string; base: number }[] = [];
    buildGraphIndex(graph, {
      edgeCost: (edge, from, to, base) => {
        seen.push({ id: edge.id, from: `${from.x},${from.z}`, to: `${to.x},${to.z}`, base });
        return base;
      },
    });
    expect(seen).toEqual([
      { id: 'ab', from: '0,0', to: '10,0', base: 10 },
      { id: 'bc', from: '10,0', to: '10,10', base: 10 },
      { id: 'cd', from: '10,10', to: '0,10', base: 10 },
      { id: 'da', from: '0,10', to: '0,0', base: 10 },
    ]);
  });

  it('diverts A* onto a geometrically longer route when an edge is penalised', () => {
    // Penalise the a→b→c side heavily; the equal-length a→d→c side wins.
    const index = buildGraphIndex(graph, {
      edgeCost: (edge, _f, _t, base) => (edge.id === 'ab' ? base * 10 : base),
    });
    const p = findPath(index, 'a', 'c');
    expect(p.found).toBe(true);
    expect(p.nodes).toEqual(['a', 'd', 'c']);
    expect(p.cost).toBeCloseTo(20, 6);

    // A detour that is longer in geometry but cheaper in weighted cost: make the
    // single 10-unit 'da' edge cost 200 so a→d must go the long way round.
    const detour = buildGraphIndex(graph, {
      edgeCost: (edge, _f, _t, base) => (edge.id === 'da' ? 200 : base),
    });
    const q = findPath(detour, 'a', 'd');
    expect(q.nodes).toEqual(['a', 'b', 'c', 'd']); // 30 units of road, cost 30
    expect(q.cost).toBeCloseTo(30, 6);
  });

  it('treats Infinity as impassable in both directions', () => {
    const index = buildGraphIndex(graph, {
      edgeCost: (edge, _f, _t, base) => (edge.id === 'ab' ? Infinity : base),
    });
    // Neither direction of 'ab' survives in the adjacency.
    expect((index.adjacency.get('a') ?? []).map((n) => n.to)).toEqual(['d']);
    expect((index.adjacency.get('b') ?? []).map((n) => n.to)).toEqual(['c']);
    // Routing goes around.
    expect(findPath(index, 'a', 'b').nodes).toEqual(['a', 'd', 'c', 'b']);

    // Blocking every edge out of 'a' makes it unreachable entirely.
    const walled = buildGraphIndex(graph, {
      edgeCost: (edge) => (edge.id === 'ab' || edge.id === 'da' ? Infinity : 1),
    });
    const p = findPath(walled, 'a', 'c');
    expect(p.found).toBe(false);
    expect(p.cost).toBe(Infinity);
  });

  it('clamps a below-baseCost return up to baseCost (keeps the heuristic admissible)', () => {
    const index = buildGraphIndex(graph, { edgeCost: () => 0 });
    for (const neighbours of index.adjacency.values()) {
      for (const n of neighbours) expect(n.cost).toBe(10);
    }
    // Zero/negative/NaN weights all degrade to the geometric length.
    expect(findPath(index, 'a', 'c').cost).toBeCloseTo(20, 6);
    expect(findPath(buildGraphIndex(graph, { edgeCost: () => -5 }), 'a', 'c').cost).toBeCloseTo(
      20,
      6,
    );
    expect(findPath(buildGraphIndex(graph, { edgeCost: () => NaN }), 'a', 'c').cost).toBeCloseTo(
      20,
      6,
    );
    expect(
      findPath(buildGraphIndex(graph, { edgeCost: () => -Infinity }), 'a', 'c').cost,
    ).toBeCloseTo(20, 6);
  });

  it('reports the summed weighted cost, not the geometric length', () => {
    const index = buildGraphIndex(graph, { edgeCost: (_e, _f, _t, base) => base + 5 });
    const p = findPath(index, 'a', 'c');
    expect(p.nodes).toHaveLength(3); // two edges of 15
    expect(p.cost).toBeCloseTo(30, 6);
  });
});

describe('nearestNode', () => {
  const index = buildGraphIndex(squareGraph());

  it('snaps a point to its closest node', () => {
    expect(nearestNode(index, 1, 1)).toBe('a');
    expect(nearestNode(index, 9, 1)).toBe('b');
    expect(nearestNode(index, 9, 9)).toBe('c');
  });

  it('returns null for an empty graph', () => {
    const empty = buildGraphIndex({ nodes: [], edges: [] });
    expect(nearestNode(empty, 0, 0)).toBeNull();
  });
});

describe('findPathBetweenPoints', () => {
  const index = buildGraphIndex(squareGraph());

  it('snaps both endpoints then routes', () => {
    // Near a → near c. (Vec2: .x = world x, .y = world z.)
    const p = findPathBetweenPoints(index, { x: 1, y: 1 }, { x: 9, y: 9 });
    expect(p.found).toBe(true);
    expect(p.nodes[0]).toBe('a');
    expect(p.nodes[p.nodes.length - 1]).toBe('c');
  });
});

describe('findPath (generated world)', () => {
  const world = generateWorld('pathfinding', getPresetConfig('coastal-tech-city'));
  const index = buildGraphIndex(world.roadGraph);

  it('routes to the furthest reachable node with a positive, admissible cost', () => {
    // The road graph can have disconnected components (e.g. separate highways),
    // so pick a goal that is provably reachable: BFS the component containing a
    // well-connected grid node, then target its most distant member.
    const start = world.roadGraph.nodes[0]!.id; // grid nodes are added first
    const seen = new Set<string>([start]);
    const queue = [start];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const { to } of index.adjacency.get(cur) ?? []) {
        if (!seen.has(to)) {
          seen.add(to);
          queue.push(to);
        }
      }
    }
    expect(seen.size).toBeGreaterThan(10); // a real, connected component

    const startPos = index.nodeById.get(start)!;
    let goal = start;
    let bestD = -1;
    for (const id of seen) {
      const p = index.nodeById.get(id)!;
      const d = Math.hypot(p.x - startPos.x, p.z - startPos.z);
      if (d > bestD) {
        bestD = d;
        goal = id;
      }
    }

    const path = findPath(index, start, goal);
    expect(path.found).toBe(true);
    expect(path.cost).toBeGreaterThan(0);
    // Cost is never less than the straight-line distance (heuristic admissible).
    expect(path.cost).toBeGreaterThanOrEqual(bestD - 1e-6);
    // Consecutive nodes in the route are graph neighbours.
    for (let i = 1; i < path.nodes.length; i++) {
      const neighbours = index.adjacency.get(path.nodes[i - 1]!) ?? [];
      expect(neighbours.some((n) => n.to === path.nodes[i])).toBe(true);
    }
  });
});
