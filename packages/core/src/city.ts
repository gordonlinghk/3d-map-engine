import { COMPANIES } from './companies';
import { cityGridExtent } from './roads';
import { createRng, type Rng } from './rng';
import type { HeightSampler } from './terrain';
import type {
  BuildingInfo,
  CityBlock,
  CityBlockKind,
  District,
  DistrictKind,
  LandmarkInfo,
  MapConfig,
  Vec2,
  Vec3,
} from './types';

export type TreeObject = { id: string; name: string; position: Vec3; tags: string[] };

export type CityData = {
  districts: District[];
  blocks: CityBlock[];
  buildings: BuildingInfo[];
  landmarks: LandmarkInfo[];
  trees: TreeObject[];
};

type BlockKind = CityBlockKind;

const RESIDENTIAL_NAMES_A = ['Harbor', 'Cedar', 'Sunset', 'Bayview', 'Alder', 'Hillcrest', 'Fog Hollow', 'Presidio', 'Juniper', 'Dolores', 'Clement', 'Noe', 'Castro', 'Balboa', 'Laguna'];
const RESIDENTIAL_NAMES_B = ['Flats', 'Residences', 'Court', 'Terrace', 'Row', 'Lofts', 'Commons', 'Heights', 'Place', 'Yard'];
const OFFICE_NAMES_A = ['Meridian', 'Pacific', 'Summit', 'Gateway', 'Beacon', 'Anchor', 'Foundry', 'Pioneer', 'Cascade', 'Harborline', 'Vantage', 'Northstar'];
const OFFICE_NAMES_B = ['Offices', 'Works', 'Exchange', 'Center', 'Labs', 'Plaza', 'House', 'Studio'];
const PUBLIC_NAMES = ['City Hall', 'Central Library', 'Museum of Modern Art', 'General Hospital', 'Opera House', 'Transit Center', 'Federal Courthouse', 'Maritime Museum'];

function districtCenterFor(config: MapConfig, half: number): Vec2 {
  switch (config.preset) {
    case 'coastal-tech-city':
      // Downtown sits near where the bay bridge lands, like SF's Embarcadero.
      return { x: -half * 0.05, y: half * 0.03 };
    case 'island-city':
    case 'downtown-night-grid':
      return { x: 0, y: 0 };
  }
}

function circleBoundary(center: Vec2, radius: number, segments = 12): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius });
  }
  return pts;
}

export function generateCity(
  seed: string,
  config: MapConfig,
  sample: HeightSampler,
): CityData {
  const rng = createRng(`${seed}/city`);
  const half = (config.chunksX * config.chunkSize) / 2;
  const spacing = config.city.blockSize;
  const gridExtent = cityGridExtent(config);
  const isLand = (x: number, z: number) => sample(x, z) > config.waterLevel + 0.6;
  const center = districtCenterFor(config, half);

  // --- Districts -------------------------------------------------------------
  const isCoastal = config.preset === 'coastal-tech-city';
  const districts: District[] = [
    { id: 'd:downtown', name: 'Downtown', kind: 'downtown', center, boundary: circleBoundary(center, 180) },
    { id: 'd:commercial', name: isCoastal ? 'SoMa' : 'Midtown', kind: 'commercial', center: { x: center.x - 120, y: center.y - 120 }, boundary: circleBoundary(center, 400) },
    { id: 'd:residential', name: isCoastal ? 'Mission' : 'Old Town', kind: 'residential', center: { x: center.x - 350, y: center.y - 250 }, boundary: circleBoundary({ x: center.x - 350, y: center.y - 250 }, 420) },
    { id: 'd:waterfront', name: isCoastal ? 'Embarcadero' : 'Harborside', kind: 'waterfront', center: { x: center.x + 200, y: center.y + 200 }, boundary: circleBoundary({ x: center.x + 200, y: center.y + 200 }, 320) },
    { id: 'd:park', name: isCoastal ? 'Golden Gate Park' : 'Central Park', kind: 'green', center: { x: center.x - 300, y: center.y + 150 }, boundary: circleBoundary({ x: center.x - 300, y: center.y + 150 }, 160) },
  ];
  const districtIdFor = (kind: BlockKind): string =>
    kind === 'downtown' ? 'd:downtown'
    : kind === 'commercial' ? 'd:commercial'
    : kind === 'waterfront' ? 'd:waterfront'
    : kind === 'park' ? 'd:park'
    : 'd:residential';

  // --- Classify blocks -------------------------------------------------------
  const gx = (i: number) => i * spacing;
  type Block = { i: number; j: number; cx: number; cz: number; kind: BlockKind };
  const blocks: Block[] = [];

  // A dedicated park strip (the "Golden Gate Park" band on coastal maps).
  const parkStrip = (i: number, j: number): boolean => {
    if (config.preset === 'downtown-night-grid') return false;
    const pj = Math.round(gridExtent * 0.35);
    return j === pj && i >= -gridExtent + 1 && i <= -gridExtent + 5;
  };

  for (let i = -gridExtent; i < gridExtent; i++) {
    for (let j = -gridExtent; j < gridExtent; j++) {
      const cx = gx(i) + spacing / 2;
      const cz = gx(j) + spacing / 2;
      const corners: Array<[number, number]> = [
        [gx(i), gx(j)],
        [gx(i + 1), gx(j)],
        [gx(i), gx(j + 1)],
        [gx(i + 1), gx(j + 1)],
      ];
      if (!corners.every(([x, z]) => isLand(x, z)) || !isLand(cx, cz)) continue;

      const blockRng = rng.fork(`block/${i},${j}`);
      const nearWater = !isLand(cx + spacing * 1.6, cz + spacing * 1.6) ||
        !isLand(cx - spacing * 1.6, cz - spacing * 1.6) ||
        !isLand(cx + spacing * 1.6, cz - spacing * 1.6) ||
        !isLand(cx - spacing * 1.6, cz + spacing * 1.6);
      const dist = Math.hypot(cx - center.x, cz - center.y);

      let kind: BlockKind;
      if (parkStrip(i, j)) kind = 'park';
      else if (dist < 170) kind = 'downtown';
      else if (blockRng.chance(0.055)) kind = 'park';
      else if (nearWater) kind = 'waterfront';
      else if (dist < 400) kind = 'commercial';
      else kind = 'residential';
      blocks.push({ i, j, cx, cz, kind });
    }
  }

  // --- Buildings -------------------------------------------------------------
  const buildings: BuildingInfo[] = [];
  const density = config.city.buildingDensity;
  const maxFloors = config.city.maxFloors;

  for (const block of blocks) {
    if (block.kind === 'park') continue;
    const blockRng = rng.fork(`bldg/${block.i},${block.j}`);
    const lotsPerSide = block.kind === 'residential' ? 3 : 2;
    const margin = 6;
    const inner = spacing - margin * 2;
    const lotSize = inner / lotsPerSide;
    const lotDensity = block.kind === 'downtown' ? Math.min(0.92, density + 0.3) : density;

    for (let li = 0; li < lotsPerSide; li++) {
      for (let lj = 0; lj < lotsPerSide; lj++) {
        if (!blockRng.chance(lotDensity)) continue;
        const lx = gx(block.i) + margin + lotSize * (li + 0.5);
        const lz = gx(block.j) + margin + lotSize * (lj + 0.5);
        const ground = sample(lx, lz);
        if (ground < config.waterLevel + 0.6) continue;
        // Reject steep lots.
        const slope = Math.abs(sample(lx + lotSize / 2, lz) - sample(lx - lotSize / 2, lz)) +
          Math.abs(sample(lx, lz + lotSize / 2) - sample(lx, lz - lotSize / 2));
        if (slope > 7) continue;

        const distT = Math.max(0, 1 - Math.hypot(lx - center.x, lz - center.y) / 190);
        let floors: number;
        switch (block.kind) {
          case 'downtown': {
            const r = blockRng.next();
            floors = Math.round(8 + r * r * (maxFloors - 8) * (0.45 + 0.55 * distT));
            break;
          }
          case 'commercial':
            floors = blockRng.int(3, 11);
            break;
          case 'waterfront':
            floors = blockRng.int(2, 6);
            break;
          default:
            floors = blockRng.int(2, 5);
        }
        floors = Math.max(2, floors);
        const height = floors * 3.1 + blockRng.float(0, 1.5);
        const w = lotSize * blockRng.float(0.55, 0.82);
        const d = lotSize * blockRng.float(0.55, 0.82);

        const id = `bldg:${block.i},${block.j}:${li},${lj}`;
        const isPublic = block.kind !== 'downtown' && blockRng.chance(0.012);
        const name = isPublic
          ? blockRng.pick(PUBLIC_NAMES)
          : block.kind === 'residential'
            ? `${blockRng.pick(RESIDENTIAL_NAMES_A)} ${blockRng.pick(RESIDENTIAL_NAMES_B)}`
            : `${blockRng.pick(OFFICE_NAMES_A)} ${blockRng.pick(OFFICE_NAMES_B)}`;

        buildings.push({
          id,
          name,
          type: isPublic ? 'public' : block.kind === 'residential' ? 'residential' : 'company',
          description: isPublic
            ? 'Public institution serving the city.'
            : block.kind === 'residential'
              ? 'Residential building in a quiet neighborhood.'
              : 'Commercial office building.',
          districtId: districtIdFor(block.kind),
          position: { x: lx, y: ground, z: lz },
          footprint: [
            { x: lx - w / 2, y: lz - d / 2 },
            { x: lx + w / 2, y: lz - d / 2 },
            { x: lx + w / 2, y: lz + d / 2 },
            { x: lx - w / 2, y: lz + d / 2 },
          ],
          height,
          floors,
          tags: isPublic ? ['Public'] : block.kind === 'residential' ? ['Residential'] : ['Office'],
          source: 'procedural',
        });
      }
    }
  }

  // --- Assign real companies to prominent office towers ----------------------
  const officeCandidates = buildings
    .filter((b) => b.type === 'company')
    .sort((a, b) => b.height - a.height);
  const companyRng = rng.fork('companies');
  let candidateIdx = 0;
  for (const company of COMPANIES) {
    // Space assignments out so company HQs are not all in one block.
    while (candidateIdx < officeCandidates.length) {
      const b = officeCandidates[candidateIdx]!;
      candidateIdx += 1;
      if (companyRng.chance(0.75)) {
        b.name = company.name;
        b.category = company.category;
        b.description = company.description;
        b.tags = [company.category, ...(company.unicorn ? ['Unicorn'] : [])];
        b.metadata = {
          company: company.id,
          founded: company.founded,
          founders: company.founders,
          funding: company.funding,
          valuation: company.valuation,
          headquarters: company.hq,
          products: company.products,
        };
        if (company.id === 'salesforce') {
          // Tallest building in the city, visible from everywhere.
          b.floors = maxFloors + 8;
          b.height = b.floors * 3.1;
        }
        break;
      }
    }
  }

  // --- Landmarks -------------------------------------------------------------
  const landmarks: LandmarkInfo[] = [];
  const groundAt = (x: number, z: number): number => Math.max(sample(x, z), config.waterLevel);

  const findPeak = (cx: number, cz: number, radius: number): Vec3 => {
    let best: Vec3 = { x: cx, y: sample(cx, cz), z: cz };
    for (let x = cx - radius; x <= cx + radius; x += 25) {
      for (let z = cz - radius; z <= cz + radius; z += 25) {
        const h = sample(x, z);
        if (h > best.y) best = { x, y: h, z };
      }
    }
    return best;
  };

  if (config.preset === 'coastal-tech-city') {
    const bayA: Vec2 = { x: 0, y: half * 0.06 };
    const bayB: Vec2 = { x: half * 0.6, y: half * 0.62 };
    // Bridge midpoint over the water span.
    landmarks.push({
      id: 'lm:golden-gate-bridge',
      name: 'Golden Gate Bridge',
      kind: 'bridge',
      description: 'Iconic suspension bridge spanning the bay. Its towers rise 227 m above the water.',
      position: { x: (bayA.x + bayB.x) / 2, y: config.waterLevel + 7, z: (bayA.y + bayB.y) / 2 },
      tags: ['Landmark', 'Bridge'],
      metadata: { ax: bayA.x, az: bayA.y, bx: bayB.x, bz: bayB.y },
    });
    landmarks.push({
      id: 'lm:alcatraz',
      name: 'Alcatraz Island',
      kind: 'island',
      description: 'Infamous island prison (1934–63), now a national park in the middle of the bay.',
      position: { x: half * 0.28, y: groundAt(half * 0.28, half * 0.3), z: half * 0.3 },
      tags: ['Landmark', 'Island'],
    });
    const peak = findPeak(-half * 0.45, -half * 0.35, half * 0.3);
    landmarks.push({
      id: 'lm:sutro-tower',
      name: 'Sutro Tower',
      kind: 'tower',
      description: 'Three-pronged TV tower on the city\'s highest ridge, visible through the fog.',
      position: peak,
      tags: ['Landmark', 'Tower'],
    });
    landmarks.push({
      id: 'lm:coit-tower',
      name: 'Coit Tower',
      kind: 'tower',
      description: 'Slender observation tower honoring the city\'s firefighters.',
      position: findPeak(center.x - 150, center.y - 200, 160),
      tags: ['Landmark', 'Tower'],
      metadata: { style: 'cylinder' },
    });
  } else {
    if (config.preset === 'island-city') {
      landmarks.push({
        id: 'lm:strait-bridge',
        name: 'Strait Bridge',
        kind: 'bridge',
        description: 'Suspension bridge linking the main island to its smaller neighbor.',
        position: { x: half * 0.275, y: config.waterLevel + 7, z: half * 0.225 },
        tags: ['Landmark', 'Bridge'],
        metadata: { ax: 0, az: 0, bx: half * 0.55, bz: half * 0.45 },
      });
    }
    const peak = findPeak(0, 0, half * 0.5);
    landmarks.push({
      id: 'lm:summit-tower',
      name: 'Summit Tower',
      kind: 'tower',
      description: 'Broadcast tower on the highest point of the city.',
      position: peak,
      tags: ['Landmark', 'Tower'],
    });
  }

  // Stadium: take over a waterfront-ish block near downtown.
  const stadiumCandidates = blocks.filter(
    (b) => b.kind === 'waterfront' && Math.hypot(b.cx - center.x, b.cz - center.y) > 120,
  );
  const stadiumPool = stadiumCandidates.length > 0
    ? stadiumCandidates
    : blocks.filter((b) => b.kind !== 'park' && Math.hypot(b.cx - center.x, b.cz - center.y) > 120);
  const stadiumBlock = stadiumPool.sort(
    (a, b) =>
      Math.hypot(a.cx - center.x, a.cz - center.y) - Math.hypot(b.cx - center.x, b.cz - center.y),
  )[0];
  if (stadiumBlock) {
    const sx = stadiumBlock.cx;
    const sz = stadiumBlock.cz;
    // Clear any buildings on that block.
    for (let bi = buildings.length - 1; bi >= 0; bi--) {
      const b = buildings[bi]!;
      if (Math.abs(b.position.x - sx) < spacing && Math.abs(b.position.z - sz) < spacing) {
        buildings.splice(bi, 1);
      }
    }
    landmarks.push({
      id: 'lm:stadium',
      name: isCoastal ? 'Oracle Park' : 'Harbor Stadium',
      kind: 'stadium',
      description: isCoastal
        ? 'Waterfront ballpark famous for kayakers catching home runs in the cove.'
        : 'Open-air stadium by the water.',
      position: { x: sx, y: groundAt(sx, sz), z: sz },
      tags: ['Landmark', 'Stadium'],
    });
  }

  // Ferry pier: walk from downtown toward the water and stop at the shore.
  {
    const dir = config.preset === 'coastal-tech-city' ? { x: 0.707, z: 0.707 } : { x: 1, z: 0 };
    let px = center.x;
    let pz = center.y;
    for (let s = 0; s < 200; s++) {
      px += dir.x * 10;
      pz += dir.z * 10;
      if (!isLand(px, pz)) break;
    }
    landmarks.push({
      id: 'lm:ferry-building',
      name: isCoastal ? 'Ferry Building' : 'Old Ferry Pier',
      kind: 'pier',
      description: isCoastal
        ? 'Historic ferry terminal with a landmark clock tower and a food hall.'
        : 'Ferry terminal connecting the islands.',
      position: { x: px, y: config.waterLevel, z: pz },
      tags: ['Landmark', 'Transport'],
    });
  }

  // Big park landmark on the dedicated strip.
  const parkBlocks = blocks.filter((b) => b.kind === 'park');
  if (parkBlocks.length > 0) {
    const strip = parkBlocks.filter((b) => parkStrip(b.i, b.j));
    const anchor = strip.length > 0 ? strip[Math.floor(strip.length / 2)]! : parkBlocks[0]!;
    landmarks.push({
      id: 'lm:great-park',
      name: isCoastal ? 'Golden Gate Park' : 'Central Park',
      kind: 'park',
      description: 'A long green ribbon of gardens, trails and meadows inside the city grid.',
      position: { x: anchor.cx, y: groundAt(anchor.cx, anchor.cz), z: anchor.cz },
      tags: ['Landmark', 'Park'],
    });
  }

  // --- Trees ------------------------------------------------------------------
  const trees: TreeObject[] = [];
  let treeN = 0;
  const pushTree = (x: number, z: number, rngT: Rng): void => {
    const y = sample(x, z);
    if (y < config.waterLevel + 0.6) return;
    trees.push({
      id: `tree:${treeN++}`,
      name: 'Tree',
      position: { x: x + rngT.float(-3, 3), y, z: z + rngT.float(-3, 3) },
      tags: ['Tree'],
    });
  };

  for (const block of parkBlocks) {
    const treeRng = rng.fork(`trees/${block.i},${block.j}`);
    const n = treeRng.int(7, 12);
    for (let t = 0; t < n; t++) {
      pushTree(
        block.cx + treeRng.float(-spacing * 0.4, spacing * 0.4),
        block.cz + treeRng.float(-spacing * 0.4, spacing * 0.4),
        treeRng,
      );
    }
  }
  // Forested hills outside the street grid.
  const hillRng = rng.fork('trees/hills');
  const cityEdge = gridExtent * spacing;
  for (let x = -half; x < half; x += 26) {
    for (let z = -half; z < half; z += 26) {
      if (trees.length >= 2600) break;
      const insideCity = Math.abs(x) < cityEdge && Math.abs(z) < cityEdge;
      if (insideCity) continue;
      const h = sample(x, z);
      const t = h - config.waterLevel;
      if (t > 12 && t < 48 && hillRng.chance(0.28)) pushTree(x, z, hillRng);
    }
  }

  return {
    districts,
    blocks: blocks.map((b) => ({ i: b.i, j: b.j, center: { x: b.cx, y: b.cz }, kind: b.kind })),
    buildings,
    landmarks,
    trees,
  };
}

export type { DistrictKind };
