/**
 * Deterministic 2D value noise with fractal Brownian motion, seeded by string.
 * Pure function of (seed, x, y) — no internal mutable state, so terrain
 * sampling is independent of evaluation order.
 */
export interface Noise2D {
    /** Single-octave value noise in [0, 1]. */
    sample(x: number, y: number): number;
    /** Fractal (fBm) noise in [0, 1]. */
    fbm(x: number, y: number, octaves?: number, lacunarity?: number, gain?: number): number;
}
export declare function createNoise2D(seed: string): Noise2D;
