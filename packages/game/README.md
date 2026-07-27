# @map-engine/game

Game-logic layer for [`@map-engine/core`](../core). Zero DOM / Three.js
dependencies — pure, deterministic TypeScript you can unit-test in Node.

- **A\* pathfinding** over a `MapWorld`'s road graph, with an optional
  weighted `edgeCost` hook (optimal, deterministic).
- **Units** that move along routes, hugging terrain height, and fight —
  faction-vs-faction combat resolved every tick.
- **Capturable sites** and **faction resources**: units hold ground, sites pay
  income, and factions can `trainUnit` new units where they afford to.
- A deterministic **AI controller** (`createAiController`) that can play a
  faction on its own — defend, expand, train — with no randomness at all.
- An **event-driven simulation** (`spawn` / `waypoint` / `arrived` / `removed`
  / `combat` / `defeated` / site capture events).

The Three.js binding that renders units and sites, drives camera-follow and
unit picking/selection lives in [`@map-engine/three`](../three)
(`createGameView`), so this package stays render-agnostic.

The exhaustive contract (every option, every edge case) lives in the demo's
[developer guide](../demo/public/developer-guide.html), §6.4. This README is a
summary with small examples.

## Pathfinding

```ts
import { buildGraphIndex, findPath, nearestNode } from '@map-engine/game';

const index = buildGraphIndex(world.roadGraph); // build once, reuse
const from = nearestNode(index, 0, 0)!;         // snap XZ → nearest road node
const to = nearestNode(index, 400, -200)!;
const path = findPath(index, from, to);
// → { found, nodes: string[], points: Vec3[], cost: number }
```

The graph is treated as undirected; edge cost defaults to geometric XZ length,
so the straight-line heuristic is admissible and `findPath` returns a shortest
route. Tie-breaking is deterministic (cost, then node id) — the same query
always yields the same path.

To weight the graph (roads that cost more/less, or blocked edges), pass
`options.edgeCost` to `buildGraphIndex`:

```ts
const index = buildGraphIndex(world.roadGraph, {
  edgeCost: (edge, from, to, baseCost) =>
    edge.kind === 'highway' ? baseCost * 0.5 : baseCost,
});
```

The effective cost is always `Math.max(edgeCost(...), baseCost)` — a hook can
only make an edge *more* expensive than its geometric distance, never
cheaper, which is what keeps the straight-line heuristic admissible and
`findPath` optimal. Return `Infinity` to close an edge entirely (removed from
the graph in both directions); `NaN` or a negative value falls back to
`baseCost`.

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

## Faction combat

Give a unit a `factionId` (and, optionally, `hp`/`attackDamage`/`attackRange`)
and it fights automatically — every tick, each non-neutral unit targets the
nearest living enemy within range and both sides trade damage:

```ts
sim.spawnUnit({ atNode: from, factionId: 'red', hp: 100, attackDamage: 10 });
sim.spawnUnit({ atNode: to, factionId: 'blue' });

sim.on((e) => {
  if (e.type === 'unit:defeated') console.log(`${e.unitId} was defeated`);
});
```

A unit with `factionId: null` (the default) is a non-combatant: it never
attacks and is never targeted. An engaged unit pauses in place (`state` →
`'fighting'`) rather than abandoning its route, and resumes from where it left
off once the enemy is gone.

## Sites, resources & training

Capturable sites and faction resources are both optional, additive
constructor options — omit them and nothing changes:

```ts
const sim = createGameSimulation(world, {
  sites: [{ id: 'keep', position: { x: 0, y: 0 }, ownerFactionId: 'red', income: 5 }],
  factions: [{ id: 'red', resources: 50, income: 1 }],
});

sim.on((e) => {
  if (e.type === 'site:captured') console.log(`${e.siteId} → ${e.factionId}`);
});

// Spend a faction's resources to spawn a unit at a site it owns:
sim.trainUnit('red', { siteId: 'keep', cost: 20, unit: { kind: 'soldier' } });
```

A site is captured by whichever non-owning faction is the sole one standing
within its `captureRadius` for `captureTime` seconds straight; owned sites and
registered factions both pay `income` every tick. `trainUnit` returns `null`
(no state change) for every ordinary failure — unregistered faction, unknown
or foreign site, bad or unaffordable `cost` — and only throws for a duplicate
unit id, always before spending anything.

## AI opponent

`createAiController` plays an entire faction on its own — no randomness, so
replaying the same simulation with the same controller always produces the
same event stream:

```ts
import { createAiController } from '@map-engine/game';

const ai = createAiController(sim, { factionId: 'blue', train: { cost: 30 } });

function frame(dt: number) {
  ai.update(dt); // read state, issue commands — call BEFORE sim.tick(dt)
  sim.tick(dt);
}
```

Each decision pass (throttled by `decisionInterval`, default 1 sim-second):
defend a threatened owned site if one exists, otherwise march idle units
toward the nearest site the faction doesn't own (skipping any unit already
standing inside that target's capture radius); train one unit at the
cheapest-sorted owned site while under `maxUnits` (default 8) and affordable.
Several controllers — one per faction — can drive the same simulation side by
side.

## License

MIT © Gordon Ling
