/**
 * Deterministic seeded RNG.
 *
 * All procedural generation must flow through this module so that a given
 * (seed, config) pair always produces the identical world. `fork` derives an
 * independent stream from a label, which makes generation order-independent:
 * chunk (3,-2) always uses the stream `fork("chunk/3,-2")` regardless of when
 * it is generated.
 */

/** xmur3 string hash — produces a 32-bit seed from an arbitrary string. */
function hashString(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Uniform float in [min, max). */
  float(min: number, max: number): number;
  /** Pick a uniformly random element. Throws on empty array. */
  pick<T>(items: readonly T[]): T;
  /** True with probability p. */
  chance(p: number): boolean;
  /** Derive an independent deterministic sub-stream. */
  fork(label: string): Rng;
}

class Mulberry32 implements Rng {
  private state: number;

  constructor(private readonly seedString: string) {
    this.state = hashString(seedString);
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick called with empty array');
    return items[this.int(0, items.length - 1)]!;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  fork(label: string): Rng {
    return new Mulberry32(`${this.seedString}/${label}`);
  }
}

export function createRng(seed: string): Rng {
  return new Mulberry32(seed);
}
