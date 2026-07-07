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
