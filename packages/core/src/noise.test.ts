import { describe, expect, it } from 'vitest';
import { createNoise2D } from './noise';

describe('createNoise2D', () => {
  it('is deterministic for the same seed', () => {
    const a = createNoise2D('terrain');
    const b = createNoise2D('terrain');
    for (let i = 0; i < 100; i++) {
      const x = i * 0.37;
      const y = i * 0.71;
      expect(a.sample(x, y)).toBe(b.sample(x, y));
      expect(a.fbm(x, y)).toBe(b.fbm(x, y));
    }
  });

  it('is a pure function of position (order-independent)', () => {
    const n = createNoise2D('terrain');
    const first = n.sample(12.3, 45.6);
    n.sample(99, 1);
    n.fbm(5, 5);
    expect(n.sample(12.3, 45.6)).toBe(first);
  });

  it('differs across seeds', () => {
    const a = createNoise2D('seed-a');
    const b = createNoise2D('seed-b');
    const samplesA = Array.from({ length: 20 }, (_, i) => a.sample(i * 1.3, i * 2.7));
    const samplesB = Array.from({ length: 20 }, (_, i) => b.sample(i * 1.3, i * 2.7));
    expect(samplesA).not.toEqual(samplesB);
  });

  it('stays within [0, 1] and varies smoothly', () => {
    const n = createNoise2D('bounds');
    let prev = n.fbm(0, 0);
    for (let i = 1; i < 500; i++) {
      const v = n.fbm(i * 0.01, i * 0.013);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      // Small steps should not jump wildly.
      expect(Math.abs(v - prev)).toBeLessThan(0.2);
      prev = v;
    }
  });
});
