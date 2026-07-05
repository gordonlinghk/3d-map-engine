/**
 * Deterministic 2D value noise with fractal Brownian motion, seeded by string.
 * Pure function of (seed, x, y) — no internal mutable state, so terrain
 * sampling is independent of evaluation order.
 */

function hash2d(seed: number, xi: number, yi: number): number {
  let h = seed ^ Math.imul(xi, 374761393) ^ Math.imul(yi, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function seedFromString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export interface Noise2D {
  /** Single-octave value noise in [0, 1]. */
  sample(x: number, y: number): number;
  /** Fractal (fBm) noise in [0, 1]. */
  fbm(x: number, y: number, octaves?: number, lacunarity?: number, gain?: number): number;
}

export function createNoise2D(seed: string): Noise2D {
  const s = seedFromString(seed);

  function sample(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = smoothstep(x - xi);
    const ty = smoothstep(y - yi);
    const v00 = hash2d(s, xi, yi);
    const v10 = hash2d(s, xi + 1, yi);
    const v01 = hash2d(s, xi, yi + 1);
    const v11 = hash2d(s, xi + 1, yi + 1);
    return lerp(lerp(v00, v10, tx), lerp(v01, v11, tx), ty);
  }

  function fbm(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amplitude = 1;
    let frequency = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amplitude * sample(x * frequency, y * frequency);
      norm += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }
    return sum / norm;
  }

  return { sample, fbm };
}
