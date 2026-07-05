import { createNoise2D } from './noise';
import type { MapConfig } from './types';

/** Pure height function in world units; negative values are below sea level. */
export type HeightSampler = (x: number, z: number) => number;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smooth01(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

function gauss(dx: number, dz: number, radius: number): number {
  const d2 = (dx * dx + dz * dz) / (radius * radius);
  return Math.exp(-d2);
}

/**
 * Terrain shaping. The noise field is shared; each preset applies its own
 * large-scale mask (bay carving, island falloff, flat downtown grid).
 * Sea level in the normalized field is SEA — heights are remapped so that
 * `SEA` maps to `config.waterLevel` in world units.
 */
const SEA = 0.34;

export function createHeightSampler(seed: string, config: MapConfig): HeightSampler {
  const base = createNoise2D(`${seed}/terrain`);
  const detail = createNoise2D(`${seed}/terrain-detail`);
  const { maxHeight, hilliness, islandFactor } = config.terrain;
  const half = (config.chunksX * config.chunkSize) / 2;
  const baseFreq = 1 / 480;
  const detailFreq = 1 / 90;

  const radialFalloff = (x: number, z: number): number => {
    const r = Math.sqrt(x * x + z * z) / half;
    // 1 at center, 0 approaching the map edge; islandFactor controls how
    // early the falloff starts (bigger factor → more ocean).
    return smooth01((1.05 - r) / Math.max(islandFactor, 0.05));
  };

  // Fade to ocean over the outer ~12% of the map so the border is never a cliff.
  const boxFalloff = (x: number, z: number): number => {
    const r = Math.max(Math.abs(x), Math.abs(z)) / half;
    return smooth01((1 - r) / 0.12);
  };

  return (x: number, z: number): number => {
    let h = base.fbm(x * baseFreq, z * baseFreq, 5);
    h = h * hilliness + 0.5 * (1 - hilliness);
    h += (detail.fbm(x * detailFreq, z * detailFreq, 3) - 0.5) * 0.06;

    switch (config.preset) {
      case 'coastal-tech-city': {
        // Mainland fills the south-west; the north-east is a wide bay.
        const diag = (x + z) / (2 * half); // -1 at SW corner, +1 at NE corner
        const mainland = smooth01((0.32 - diag) / 0.4);
        const edge = boxFalloff(x, z);
        h = (h * 0.85 + 0.24) * mainland * edge;
        // Deepen the middle of the bay.
        h -= 0.22 * gauss(x - half * 0.5, z - half * 0.5, half * 0.4);
        // Islands inside the bay.
        h += 0.62 * gauss(x - half * 0.28, z - half * 0.3, half * 0.075) * edge;
        h += 0.7 * gauss(x - half * 0.6, z - half * 0.62, half * 0.1) * edge;
        break;
      }
      case 'island-city': {
        // Main island plus two satellites; the radial falloff guarantees
        // open ocean around them.
        h *= radialFalloff(x, z);
        h += 0.3 * gauss(x, z, half * 0.42);
        h += 0.26 * gauss(x - half * 0.55, z - half * 0.4, half * 0.14);
        h += 0.24 * gauss(x + half * 0.55, z + half * 0.45, half * 0.12);
        h -= 0.1;
        break;
      }
      case 'downtown-night-grid': {
        // Mostly flat plateau slightly above sea level, water at the borders.
        h = (h * 0.35 + 0.52) * boxFalloff(x, z);
        break;
      }
    }

    // Remap normalized field to world units: SEA → waterLevel.
    const worldH = ((h - SEA) / (1 - SEA)) * maxHeight;
    // Soften and clamp the ocean floor.
    return worldH >= 0 ? worldH + config.waterLevel : config.waterLevel + Math.max(worldH * 0.5, -14);
  };
}
