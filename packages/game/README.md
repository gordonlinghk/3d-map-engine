# @map-engine/game

Game-logic layer for [`@map-engine/core`](../core). Zero DOM / Three.js
dependencies — pure, deterministic TypeScript you can unit-test in Node.

- **A\* pathfinding** over a `MapWorld`'s road graph (optimal, deterministic).
- **Units** that move along routes, hugging terrain height.
- An **event-driven simulation** (`spawn` / `waypoint` / `arrived` / `removed`).

The Three.js binding that renders units and drives camera-follow lives in
[`@map-engine/three`](../three) (`createGameView`), so this package stays
render-agnostic.

## Pathfinding

```ts
import { buildGraphIndex, findPath, nearestNode } from '@map-engine/game';

const index = buildGraphIndex(world.roadGraph); // build once, reuse
const from = nearestNode(index, 0, 0)!;         // snap XZ → nearest road node
const to = nearestNode(index, 400, -200)!;
const path = findPath(index, from, to);
// → { found, nodes: string[], points: Vec3[], cost: number }
```

The graph is treated as undirected; edge cost is geometric XZ length, so the
straight-line heuristic is admissible and `findPath` returns a shortest route.
Tie-breaking is deterministic (cost, then node id) — the same query always
yields the same path.

## Simulation

```ts
import { createGameSimulation } from '@map-engine/game';

const sim = createGameSimulation(world);
const unit = sim.spawnUnit({ atNode: from, speed: 30, kind: 'soldier' });

sim.on((e) => {
  if (e.type === 'unit:arrived') console.log(`${e.unitId} reached its goal`);
});

sim.moveUnitTo(unit.id, { x: 400, y: -200 }); // Vec2: .x = world x, .y = world z

// Drive it from your render loop:
function frame(dt: number) {
  sim.tick(dt); // advances units, flushes events
}
```

`Vec2` follows the engine convention: `.x` is world **x**, `.y` is world **z**.
`tick(dt)` advances every moving unit by `speed * dt` world units, samples
terrain so units stay on the ground, updates `heading`, and emits ordered
events. Everything is deterministic for a given `(world, spawns, dt-sequence)`.

## License

MIT © Gordon Ling
