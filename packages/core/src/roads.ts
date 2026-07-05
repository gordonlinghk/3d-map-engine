import type { HeightSampler } from './terrain';
import type { MapConfig, RoadEdge, RoadGraph, RoadNode } from './types';

const LAND_MARGIN = 0.6;

/** Number of grid steps from the center to the edge of the city street grid. */
export function cityGridExtent(config: MapConfig): number {
  const half = (config.chunksX * config.chunkSize) / 2;
  return Math.floor((half * 0.72) / config.city.blockSize);
}

/**
 * Road network = downtown street grid + two highways crossing the whole map.
 * Highway segments over water become bridges. Everything is derived from the
 * height field, so the graph is deterministic for a (seed, config) pair.
 */
export function generateRoadGraph(
  _seed: string,
  config: MapConfig,
  sample: HeightSampler,
): RoadGraph {
  const nodes = new Map<string, RoadNode>();
  const edges: RoadEdge[] = [];
  const half = (config.chunksX * config.chunkSize) / 2;
  const spacing = config.city.blockSize;
  const isLand = (x: number, z: number) => sample(x, z) > config.waterLevel + LAND_MARGIN;

  const addNode = (id: string, x: number, z: number): RoadNode => {
    let node = nodes.get(id);
    if (!node) {
      node = { id, position: { x, y: Math.max(sample(x, z), config.waterLevel), z } };
      nodes.set(id, node);
    }
    return node;
  };

  // --- Street grid over the central city zone -------------------------------
  const gridExtent = cityGridExtent(config);
  const gx = (i: number) => i * spacing;

  for (let i = -gridExtent; i <= gridExtent; i++) {
    for (let j = -gridExtent; j <= gridExtent; j++) {
      const x = gx(i);
      const z = gx(j);
      if (!isLand(x, z)) continue;

      // Connect to east and south neighbours when the whole segment is on land.
      const neighbours: Array<[number, number]> = [
        [i + 1, j],
        [i, j + 1],
      ];
      for (const [ni, nj] of neighbours) {
        if (ni > gridExtent || nj > gridExtent) continue;
        const nxp = gx(ni);
        const nzp = gx(nj);
        if (!isLand(nxp, nzp)) continue;
        if (!isLand((x + nxp) / 2, (z + nzp) / 2)) continue;

        const fromId = `rn:${i},${j}`;
        const toId = `rn:${ni},${nj}`;
        addNode(fromId, x, z);
        addNode(toId, nxp, nzp);
        const horizontal = nj === j;
        const lineIndex = horizontal ? j : i;
        const avenue = lineIndex % 4 === 0;
        edges.push({
          id: `re:${fromId}>${toId}`,
          from: fromId,
          to: toId,
          kind: avenue ? 'avenue' : 'street',
          width: avenue ? 10 : 6,
        });
      }
    }
  }

  // --- Highways across the full map, bridging water gaps --------------------
  const step = config.chunkSize / 2;
  const lines: Array<{ name: string; a: [number, number]; b: [number, number] }> = [
    { name: 'ew', a: [-half, half * 0.12], b: [half, half * 0.12] },
    { name: 'ns', a: [-half * 0.1, -half], b: [-half * 0.1, half] },
  ];

  // Per-preset water crossing so every coastal/island map has a road bridge.
  if (config.preset === 'coastal-tech-city') {
    lines.push({ name: 'bay', a: [0, half * 0.06], b: [half * 0.6, half * 0.62] });
  } else if (config.preset === 'island-city') {
    lines.push({ name: 'strait', a: [0, 0], b: [half * 0.55, half * 0.45] });
  }

  for (const line of lines) {
    const length = Math.hypot(line.b[0] - line.a[0], line.b[1] - line.a[1]);
    const count = Math.max(2, Math.round(length / step));
    const samples: Array<{ x: number; z: number; land: boolean }> = [];
    for (let s = 0; s <= count; s++) {
      const t = s / count;
      const x = line.a[0] + (line.b[0] - line.a[0]) * t;
      const z = line.a[1] + (line.b[1] - line.a[1]) * t;
      samples.push({ x, z, land: isLand(x, z) });
    }
    const first = samples.findIndex((s) => s.land);
    const last = samples.length - 1 - [...samples].reverse().findIndex((s) => s.land);
    if (first === -1 || last <= first) continue;

    for (let k = first; k < last; k++) {
      const a = samples[k]!;
      const b = samples[k + 1]!;
      const fromId = `rn:hw:${line.name}:${k}`;
      const toId = `rn:hw:${line.name}:${k + 1}`;
      addNode(fromId, a.x, a.z);
      addNode(toId, b.x, b.z);
      const overWater = !a.land || !b.land || !isLand((a.x + b.x) / 2, (a.z + b.z) / 2);
      edges.push({
        id: `re:hw:${line.name}:${k}`,
        from: fromId,
        to: toId,
        kind: overWater ? 'bridge' : 'highway',
        width: 14,
      });
    }
  }

  return { nodes: [...nodes.values()], edges };
}
