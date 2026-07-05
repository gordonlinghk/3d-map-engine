import { test, expect, type Page } from '@playwright/test';

async function waitForWorld(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as never as { __mapEngine?: unknown }).__mapEngine, undefined, {
    timeout: 15_000,
  });
  await page.waitForTimeout(600);
}

test('walk mode: buildings block movement (no walking through walls)', async ({ page, viewport }) => {
  test.skip(!!viewport && viewport.width < 900, 'keyboard navigation is desktop-only');
  await waitForWorld(page);

  // Pick a tall building whose southern approach corridor is free of other
  // buildings, stand 12 units south of its wall, face north, in walk mode.
  const target = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eng = (window as any).__mapEngine;
    type FP = Array<{ x: number; y: number }>;
    const all = Object.values(eng.world.objects).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (o: any) => o.objectType === 'building',
    ) as Array<{ building: { position: { x: number; z: number }; floors: number; footprint: FP } }>;

    const rect = (fp: FP) => ({
      minX: Math.min(fp[0]!.x, fp[2]!.x),
      maxX: Math.max(fp[0]!.x, fp[2]!.x),
      minZ: Math.min(fp[0]!.y, fp[2]!.y),
      maxZ: Math.max(fp[0]!.y, fp[2]!.y),
    });

    const candidate = all.find(({ building: b }) => {
      if (b.floors < 12) return false;
      const r = rect(b.footprint);
      // Corridor south of the wall must be clear of every other building.
      const corridor = { minX: b.position.x - 3, maxX: b.position.x + 3, minZ: r.minZ - 14, maxZ: r.minZ - 0.5 };
      return !all.some(({ building: o }) => {
        if (o === b) return false;
        const or = rect(o.footprint);
        return (
          or.minX < corridor.maxX && or.maxX > corridor.minX &&
          or.minZ < corridor.maxZ && or.maxZ > corridor.minZ
        );
      });
    })!;

    const b = candidate.building;
    const r = rect(b.footprint);
    eng.renderer.setCameraMode('walk');
    const cam = eng.renderer.camera;
    cam.position.set(b.position.x, cam.position.y, r.minZ - 12);
    cam.lookAt(b.position.x, cam.position.y, r.minZ + 10);
    return { x: b.position.x, minZ: r.minZ, maxZ: r.maxZ };
  });

  await page.locator('canvas').first().click({ position: { x: 700, y: 400 } });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1800);
  await page.keyboard.up('KeyW');

  const pos = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cam = (window as any).__mapEngine.renderer.camera;
    return { x: cam.position.x, z: cam.position.z };
  });

  // Walking north from minZ - 12: must never end up inside the footprint…
  const inside =
    pos.z > target.minZ && pos.z < target.maxZ && Math.abs(pos.x - target.x) < 10;
  expect(inside, `camera ended inside footprint (z=${pos.z}, wall=${target.minZ})`).toBe(false);
  expect(pos.z).toBeLessThanOrEqual(target.minZ);
  // …but it must have moved toward the wall (not frozen in place).
  expect(pos.z).toBeGreaterThan(target.minZ - 12);
});
