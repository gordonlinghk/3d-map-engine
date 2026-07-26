import type { RoadEdge, RoadGraph, Vec2, Vec3 } from '@map-engine/core';
/**
 * A* pathfinding over a MapWorld's road graph.
 *
 * The graph is treated as **undirected**: every edge is traversable in both
 * directions (matching how the ambient traffic layer already drives it). Cost
 * is by default the geometric XZ length of each edge, so the straight-line
 * Euclidean distance is an admissible, consistent heuristic and A* returns an
 * optimal (shortest) path. Tie-breaking is fully deterministic (by accumulated
 * cost, then node id), so a given (graph, from, to) always yields the same
 * route — important for reproducible simulations and tests.
 *
 * `buildGraphIndex` optionally takes an `edgeCost` hook to weight edges (road
 * kind, terrain, faction control, …); see {@link EdgeCostFn} for the cost model
 * and why optimality survives it.
 */
export type PathResult = {
    /** Whether a route from `from` to `to` exists. */
    found: boolean;
    /** Road-node ids from start to goal inclusive. `[]` when not found. */
    nodes: string[];
    /** World positions of each node in `nodes` (parallel array). */
    points: Vec3[];
    /**
     * Total effective cost of the route. With no `edgeCost` hook this is the path
     * length in world units (XZ); with one it is the sum of the weighted per-edge
     * costs. `Infinity` when not found.
     */
    cost: number;
};
/**
 * Per-edge cost override for {@link buildGraphIndex}.
 *
 * Called once per graph edge with the edge, its two endpoint positions (in
 * `edge.from` → `edge.to` order) and `baseCost` — the edge's geometric XZ
 * length, i.e. the cost used when no hook is supplied.
 *
 * The returned value is interpreted as follows:
 * - **Effective cost = `max(returnValue, baseCost)`.** The clamp is what keeps
 *   the Euclidean heuristic admissible: no edge can ever cost less than the
 *   straight-line distance it spans, so `h(n)` (straight line to the goal) can
 *   never exceed the true remaining cost, and A* stays optimal under the
 *   weighted model. Consequence: the hook can only ever make an edge *more*
 *   expensive — discounts are clamped away rather than silently breaking A*.
 * - **`Infinity` marks the edge impassable**: it is dropped from the adjacency
 *   in *both* directions, as if it were absent from the graph.
 * - **`NaN` or a negative value falls back to `baseCost`** (defensive: a bad
 *   weight degrades to plain geometric cost instead of poisoning the search).
 *
 * The hook must be pure and deterministic — it is called once per edge at index
 * build time, and route determinism depends on it.
 */
export type EdgeCostFn = (edge: RoadEdge, from: Vec3, to: Vec3, baseCost: number) => number;
type Adjacency = Map<string, {
    to: string;
    cost: number;
}[]>;
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
/**
 * Build the reusable adjacency index from a road graph.
 *
 * With no `options.edgeCost`, edges cost their geometric XZ length. Supplying
 * the hook re-weights (or removes) edges up front, so every later `findPath`
 * against this index searches the weighted graph — see {@link EdgeCostFn}.
 */
export declare function buildGraphIndex(graph: RoadGraph, options?: {
    edgeCost?: EdgeCostFn;
}): RoadGraphIndex;
/**
 * Nearest road node to a world XZ position. Linear scan (road graphs here hold
 * hundreds of nodes, so this is cheap). Returns null only for an empty graph;
 * ties break on node id for determinism.
 */
export declare function nearestNode(index: RoadGraphIndex, x: number, z: number): string | null;
/**
 * Cheapest path between two road-node ids. Optimal under the index's cost model
 * — geometric length, or the clamped weighted costs of a `buildGraphIndex`
 * `edgeCost` hook. Returns a not-found result when either id is unknown or the
 * goal is unreachable (including when weighting made every route impassable); a
 * path from a node to itself is the trivial single-node path.
 */
export declare function findPath(index: RoadGraphIndex, fromNodeId: string, toNodeId: string): PathResult;
/**
 * Convenience: shortest path between two world XZ positions, snapping each end
 * to its nearest road node. The returned path's endpoints are road nodes, not
 * the exact input positions — callers wanting exact start/end should prepend /
 * append the raw points themselves.
 */
export declare function findPathBetweenPoints(index: RoadGraphIndex, from: Vec2, to: Vec2): PathResult;
export {};
