/**
 * Deterministic seeded RNG.
 *
 * All procedural generation must flow through this module so that a given
 * (seed, config) pair always produces the identical world. `fork` derives an
 * independent stream from a label, which makes generation order-independent:
 * chunk (3,-2) always uses the stream `fork("chunk/3,-2")` regardless of when
 * it is generated.
 */
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
export declare function createRng(seed: string): Rng;
