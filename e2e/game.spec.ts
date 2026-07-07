import { test, expect } from '@playwright/test';

test('game: click-to-move unit reaches target and camera follow tracks it', async ({ page }) => {
  await page.goto('/?game=1');

  // Wait for the opt-in game sim to boot with at least two spawned units.
  await page.waitForFunction(
    () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      !!(window as any).__mapEngine?.game &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__mapEngine.game.listUnits().length >= 2,
    undefined,
    { timeout: 15_000 },
  );

  const [unitA, unitB] = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const units = (window as any).__mapEngine.game.listUnits();
    return [
      { id: units[0].id, position: { ...units[0].position } },
      { id: units[1].id, position: { ...units[1].position } },
    ];
  });
  const aId = unitA!.id as string;
  const aStartPos = unitA!.position as { x: number; y: number; z: number };
  const bPos = unitB!.position as { x: number; y: number; z: number };

  // Command unit A to move to unit B's position; the sim's Vec2 is {x, y}
  // where y maps to world z.
  const started = await page.evaluate(
    ([aId, b]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__mapEngine.game.moveUnitTo(aId, { x: b.x, y: b.z });
    },
    [aId, bPos] as const,
  );
  expect(started).toBe(true);

  await expect
    .poll(
      async () =>
        page.evaluate((id) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const u = (window as any).__mapEngine.game.getUnit(id);
          return u ? u.state : null;
        }, aId),
      { timeout: 30_000 },
    )
    .toBe('arrived');

  const finalPos = await page.evaluate((id) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u = (window as any).__mapEngine.game.getUnit(id);
    return { x: u.position.x, z: u.position.z };
  }, aId);
  const dx = finalPos.x - bPos.x;
  const dz = finalPos.z - bPos.z;
  expect(Math.hypot(dx, dz)).toBeLessThan(5);

  // Camera follow: recording the start position, then following unit A while
  // it's commanded to move again should visibly move the camera.
  const startCamera = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cam = (window as any).__mapEngine.renderer.camera;
    return { x: cam.position.x, y: cam.position.y, z: cam.position.z };
  });

  await page.evaluate(
    ([aId, start]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const me = (window as any).__mapEngine;
      me.gameView.followUnit(aId);
      // Send unit A back toward its own starting point — a third reachable
      // location distinct from where it's currently standing (unit B's
      // position) — so it has a real route to travel while followed.
      me.game.moveUnitTo(aId, { x: start.x, y: start.z });
    },
    [aId, aStartPos] as const,
  );

  await expect
    .poll(
      async () => {
        const cam = await page.evaluate(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const c = (window as any).__mapEngine.renderer.camera;
          return { x: c.position.x, y: c.position.y, z: c.position.z };
        });
        return Math.hypot(
          cam.x - startCamera.x,
          cam.y - startCamera.y,
          cam.z - startCamera.z,
        );
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(5);
});
