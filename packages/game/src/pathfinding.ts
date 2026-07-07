import type { RoadGraph, Vec2, Vec3 } from '@map-engine/core';

/**
 * A* pathfinding over a MapWorld's road graph.
 *
 * The graph is treated as **undirected**: every edge is traversable in both
 * directions (matching how the ambient traffic layer already drives it). Cost
 * is the geometric XZ length of each edge, so the straight-line Euclidean
 * distance is an admissible, consistent heuristic and A* returns an optimal
 * (shortest) path. Tie-breaking is fully deterministic (by accumulated cost,
 * then node id), so a given (graph, from, to) always yields the same route —
 * important for reproducible simulations and tests.
 */

export type PathResult = {
  /** Whether a route from `from` to `to` exists. */
  found: boolean;
  /** Road-node ids from start to goal inclusive. `[]` when not found. */
  nodes: string[];
  /** World positions of each node in `nodes` (parallel array). */
  points: Vec3[];
  /** Total path length in world units (XZ). `Infinity` when not found. */
  cost: number;
};

const NO_PATH: PathResult = { found: false, nodes: [], points: [], cost: Infinity };

type Adjacency = Map<string, { to: string; cost: number }[]>;

/**
 * Pre-processed road graph for fast repeated queries. Build once per world and
 * reuse across many `findPath` / `nearestNode` calls.
 */
export type RoadGraphIndex = {
  readonly nodeById: Map<string, Vec3>;
  readonly adjacency: Adjacency;
  /** Insertion-ordered node ids (stable iteration for deterministic snapping). */
  readonly nodeIds: string[];
};

function xzDist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Build the reusable adjacency index from a road graph. */
export function buildGraphIndex(graph: RoadGraph): RoadGraphIndex {
  const nodeById = new Map<string, Vec3>();
  for (const n of graph.nodes) nodeById.set(n.id, n.position);

  const adjacency: Adjacency = new Map();
  const link = (from: string, to: string, cost: number): void => {
    let list = adjacency.get(from);
    if (!list) {
      list = [];
      adjacency.set(from, list);
    }
    list.push({ to, cost });
  };

  for (const e of graph.edges) {
    const a = nodeById.get(e.from);
    const b = nodeById.get(e.to);
    if (!a || !b || e.from === e.to) continue;
    const cost = xzDist(a, b);
    // Undirected: connect both ways.
    link(e.from, e.to, cost);
    link(e.to, e.from, cost);
  }

  return { nodeById, adjacency, nodeIds: graph.nodes.map((n) => n.id) };
}

/**
 * Nearest road node to a world XZ position. Linear scan (road graphs here hold
 * hundreds of nodes, so this is cheap). Returns null only for an empty graph;
 * ties break on node id for determinism.
 */
export function nearestNode(index: RoadGraphIndex, x: number, z: number): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const id of index.nodeIds) {
    const p = index.nodeById.get(id);
    if (!p) continue;
    const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
    if (d < bestD || (d === bestD && best !== null && id < best)) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

/**
 * Binary min-heap keyed on `f` with a deterministic tie-break: lower `f`, then
 * lower `g`, then lexicographically smaller node id.
 */
type HeapEntry = { id: string; f: number; g: number };

function entryLess(a: HeapEntry, b: HeapEntry): boolean {
  if (a.f !== b.f) return a.f < b.f;
  if (a.g !== b.g) return a.g < b.g;
  return a.id < b.id;
}

class MinHeap {
  private items: HeapEntry[] = [];

  get size(): number {
    return this.items.length;
  }

  push(entry: HeapEntry): void {
    const items = this.items;
    items.push(entry);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (entryLess(items[i]!, items[parent]!)) {
        [items[i], items[parent]] = [items[parent]!, items[i]!];
        i = parent;
      } else break;
    }
  }

  pop(): HeapEntry | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0 && last) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let smallest = i;
        if (l < items.length && entryLess(items[l]!, items[smallest]!)) smallest = l;
        if (r < items.length && entryLess(items[r]!, items[smallest]!)) smallest = r;
        if (smallest === i) break;
        [items[i], items[smallest]] = [items[smallest]!, items[i]!];
        i = smallest;
      }
    }
    return top;
  }
}

/**
 * Shortest path between two road-node ids. Optimal under the geometric-length
 * cost model. Returns a not-found result when either id is unknown or the goal
 * is unreachable; a path from a node to itself is the trivial single-node path.
 */
export function findPath(index: RoadGraphIndex, fromNodeId: string, toNodeId: string): PathResult {
  const { nodeById, adjacency } = index;
  const start = nodeById.get(fromNodeId);
  const goal = nodeById.get(toNodeId);
  if (!start || !goal) return NO_PATH;

  if (fromNodeId === toNodeId) {
    return { found: true, nodes: [fromNodeId], points: [start], cost: 0 };
  }

  const heuristic = (id: string): number => xzDist(nodeById.get(id)!, goal);

  const gScore = new Map<string, number>([[fromNodeId, 0]]);
  const cameFrom = new Map<string, string>();
  const closed = new Set<string>();
  const open = new MinHeap();
  open.push({ id: fromNodeId, g: 0, f: heuristic(fromNodeId) });

  while (open.size > 0) {
    const current = open.pop()!;
    if (current.id === toNodeId) {
      // Reconstruct.
      const nodes: string[] = [toNodeId];
      let cur = toNodeId;
      while (cameFrom.has(cur)) {
        cur = cameFrom.get(cur)!;
        nodes.push(cur);
      }
      nodes.reverse();
      return {
        found: true,
        nodes,
        points: nodes.map((id) => nodeById.get(id)!),
        cost: gScore.get(toNodeId)!,
      };
    }
    // A node may be queued multiple times; skip stale/settled entries.
    if (closed.has(current.id)) continue;
    if (current.g > (gScore.get(current.id) ?? Infinity)) continue;
    closed.add(current.id);

    for (const { to, cost } of adjacency.get(current.id) ?? []) {
      if (closed.has(to)) continue;
      const tentative = current.g + cost;
      if (tentative < (gScore.get(to) ?? Infinity)) {
        gScore.set(to, tentative);
        cameFrom.set(to, current.id);
        open.push({ id: to, g: tentative, f: tentative + heuristic(to) });
      }
    }
  }

  return NO_PATH;
}

/**
 * Convenience: shortest path between two world XZ positions, snapping each end
 * to its nearest road node. The returned path's endpoints are road nodes, not
 * the exact input positions — callers wanting exact start/end should prepend /
 * append the raw points themselves.
 */
export function findPathBetweenPoints(
  index: RoadGraphIndex,
  from: Vec2,
  to: Vec2,
): PathResult {
  const a = nearestNode(index, from.x, from.y);
  const b = nearestNode(index, to.x, to.y);
  if (!a || !b) return NO_PATH;
  return findPath(index, a, b);
}
