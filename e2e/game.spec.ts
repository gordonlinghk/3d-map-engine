import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

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

// Shared boot wait: the opt-in game sim has spawned at least two units.
const waitForGameBoot = (page: Page) =>
  page.waitForFunction(
    () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      !!(window as any).__mapEngine?.game &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__mapEngine.game.listUnits().length >= 2,
    undefined,
    { timeout: 15_000 },
  );

test('game: selectUnit sets getSelectedUnit + a game:selection scene object, and null clears both', async ({
  page,
}) => {
  await page.goto('/?game=1');
  await waitForGameBoot(page);

  const result = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const me = (window as any).__mapEngine;
    const id = me.game.listUnits()[0].id as string;
    me.gameView.selectUnit(id);
    const selectedAfterSet = me.gameView.getSelectedUnit();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ringAfterSet = me.renderer.scene.getObjectByName('game:selection') as any;
    // Snapshot booleans now — `ringAfterSet` is a live Three.js object, and
    // selectUnit(null) below mutates its `.visible` in place, so reading it
    // lazily later would observe the post-clear state instead of this one.
    const ringExistsAfterSet = !!ringAfterSet;
    const ringVisibleAfterSet = !!ringAfterSet?.visible;

    me.gameView.selectUnit(null);
    const selectedAfterClear = me.gameView.getSelectedUnit();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ringAfterClear = me.renderer.scene.getObjectByName('game:selection') as any;
    // The ring may be hidden rather than removed — either satisfies "cleared".
    const ringGoneOrHiddenAfterClear = !ringAfterClear || ringAfterClear.visible === false;

    return {
      id,
      selectedAfterSet,
      ringExistsAfterSet,
      ringVisibleAfterSet,
      selectedAfterClear,
      ringGoneOrHiddenAfterClear,
    };
  });

  expect(result.selectedAfterSet).toBe(result.id);
  expect(result.ringExistsAfterSet).toBe(true);
  expect(result.ringVisibleAfterSet).toBe(true);
  expect(result.selectedAfterClear).toBeNull();
  expect(result.ringGoneOrHiddenAfterClear).toBe(true);
});

test('game: pickUnit resolves the unit under the pointer (and misses empty space)', async ({
  page,
}) => {
  await page.goto('/?game=1');
  await waitForGameBoot(page);

  const unitId = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const me = (window as any).__mapEngine;
    const id = me.game.listUnits()[0].id as string;
    me.gameView.followUnit(id);
    return id;
  });

  // The follow camera converges toward the unit over a few frames; poll the
  // marker's actual rendered world position — not the ground-level sim
  // position, which the default marker mesh sits lifted above — projected to
  // client coords, and pickUnit there until it resolves. Reading the marker
  // object's own world matrix (rather than hardcoding the default marker's
  // lift) keeps this correct for any unitObject factory.
  await expect
    .poll(
      async () =>
        page.evaluate((id) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const me = (window as any).__mapEngine;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const obj = me.gameView.group.getObjectByName(`game:unit:${id}`) as any;
          if (!obj) return null;
          const target = obj.children[0] ?? obj;
          target.updateWorldMatrix(true, false);
          const m = target.matrixWorld.elements;
          const worldPos = { x: m[12], y: m[13], z: m[14] };
          const rect = me.renderer.domElement.getBoundingClientRect();
          const screen = me.renderer.projectToScreen(worldPos);
          if (!screen.visible) return null;
          return me.gameView.pickUnit({ x: rect.left + screen.x, y: rect.top + screen.y });
        }, unitId),
      { timeout: 30_000 },
    )
    .toBe(unitId);

  // A point in the far corner of the viewport (over sky, no unit marker
  // anywhere near it) must miss.
  const miss = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const me = (window as any).__mapEngine;
    return me.gameView.pickUnit({ x: 2, y: 2 });
  });
  expect(miss).toBeNull();
});

test('game: red vs blue units auto-fight and a defeat reduces the unit count', async ({ page }) => {
  // Generous budget: closing distance + ~10s of mutual combat at default
  // stats normally finishes in well under a minute, but three Playwright
  // projects rendering WebGL concurrently can starve requestAnimationFrame
  // enough to slow the sim's wall-clock progress substantially.
  test.setTimeout(270_000);
  await page.goto('/?game=1');
  await waitForGameBoot(page);

  const setup = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const me = (window as any).__mapEngine;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const units = me.game.listUnits() as any[];
    const reds = units.filter((u) => u.factionId === 'red');
    const blues = units.filter((u) => u.factionId === 'blue');
    if (reds.length === 0 || blues.length === 0) return null;

    // The demo's "well-separated" node picking can put factions far apart on
    // the road graph; pick the closest red/blue pair (by straight-line XZ
    // distance) so closing the gap stays within the poll timeout below.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let red = reds[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let blue = blues[0];
    let best = Infinity;
    for (const r of reds) {
      for (const b of blues) {
        const d = Math.hypot(r.position.x - b.position.x, r.position.z - b.position.z);
        if (d < best) {
          best = d;
          red = r;
          blue = b;
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__defeatedEvents = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    me.game.on((e: any) => {
      if (e.type === 'unit:defeated') (window as any).__defeatedEvents.push(e);
    });

    const startCount = units.length;
    const started = me.game.moveUnitTo(red.id, { x: blue.position.x, y: blue.position.z });
    return { redId: red.id as string, blueId: blue.id as string, startCount, started };
  });

  expect(setup).not.toBeNull();
  expect(setup!.started).toBe(true);

  // Closing distance to attackRange plus mutual combat at default stats
  // (100 hp / 10 dps ≈ 10s) — generous timeout to absorb both, plus the
  // rendering contention described above.
  await expect
    .poll(
      async () => page.evaluate(() => (window as any).__mapEngine.game.listUnits().length),
      { timeout: 240_000 },
    )
    .toBeLessThan(setup!.startCount);

  const defeatedEvents = await page.evaluate(() => (window as any).__defeatedEvents as unknown[]);
  expect(defeatedEvents.length).toBeGreaterThan(0);
});
