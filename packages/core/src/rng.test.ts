import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

describe('createRng', () => {
  it('produces the identical sequence for the same seed', () => {
    const a = createRng('hello');
    const b = createRng('hello');
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng('seed-1');
    const b = createRng('seed-2');
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('stays within [0, 1) and int stays within bounds', () => {
    const rng = createRng('bounds');
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = rng.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  it('fork streams are independent of consumption order', () => {
    // Consume the parent before forking in one case, after in the other —
    // fork must depend only on (seed, label).
    const a = createRng('world');
    a.next();
    a.next();
    const forkA = a.fork('chunk/1,2');

    const b = createRng('world');
    const forkB = b.fork('chunk/1,2');

    expect(forkA.next()).toBe(forkB.next());
    expect(forkA.next()).toBe(forkB.next());
  });

  it('fork streams with different labels differ', () => {
    const rng = createRng('world');
    const f1 = rng.fork('chunk/0,0');
    const f2 = rng.fork('chunk/0,1');
    const seq1 = Array.from({ length: 10 }, () => f1.next());
    const seq2 = Array.from({ length: 10 }, () => f2.next());
    expect(seq1).not.toEqual(seq2);
  });

  it('has a roughly uniform distribution', () => {
    const rng = createRng('uniform');
    const buckets = new Array(10).fill(0);
    const n = 10_000;
    for (let i = 0; i < n; i++) buckets[Math.floor(rng.next() * 10)] += 1;
    for (const count of buckets) {
      expect(count).toBeGreaterThan(n / 10 - n * 0.02);
      expect(count).toBeLessThan(n / 10 + n * 0.02);
    }
  });
});
