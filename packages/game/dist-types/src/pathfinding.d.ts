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
/** Build the reusable adjacency index from a road graph. */
export declare function buildGraphIndex(graph: RoadGraph): RoadGraphIndex;
/**
 * Nearest road node to a world XZ position. Linear scan (road graphs here hold
 * hundreds of nodes, so this is cheap). Returns null only for an empty graph;
 * ties break on node id for determinism.
 */
export declare function nearestNode(index: RoadGraphIndex, x: number, z: number): string | null;
/**
 * Shortest path between two road-node ids. Optimal under the geometric-length
 * cost model. Returns a not-found result when either id is unknown or the goal
 * is unreachable; a path from a node to itself is the trivial single-node path.
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
