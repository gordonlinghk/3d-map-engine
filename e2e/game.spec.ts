import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const HILL_PNG = readFileSync(fileURLToPath(new URL('./fixtures/terrarium-hill.png', import.meta.url)));

/**
 * C9 replaced the old procedural `?game=1` sandbox with a scenario-driven
 * Three Kingdoms battle (`JINGZHOU_219`, see `demo/src/game/scenario.ts`):
 * `?game=1` only does anything on `?map=three-kingdoms` (`isGameModeUrl`).
 * Every test below routes real elevation tiles to a flat fixture, exactly like
 * `historical.spec.ts`, so booting the historical map never hits the network.
 */
const routeFlatElevation = (page: import('@playwright/test').Page) =>
  page.route('**/elevation-tiles-prod/**', (route) =>
    route.fulfill({ body: HILL_PNG, contentType: 'image/png' }),
  );

test('game: ?game=1 is fully inert on the procedural map (no map= param)', async ({ page }) => {
  await routeFlatElevation(page);
  await page.goto('/?game=1');

  // The procedural world still boots normally — wait for it, exactly like the
  // non-game smoke tests do.
  await page.waitForFunction(
    () => !!(window as unknown as { __mapEngine?: { world?: unknown } }).__mapEngine?.world,
    undefined,
    { timeout: 30_000 },
  );

  // Mobile defaults the side panel to collapsed; open it so `.atlas-side`
  // actually mounts, same as historical.spec.ts's established pattern.
  if (await page.getByTestId('side-open').isVisible()) {
    await page.getByTestId('side-open').click();
  }
  await expect(page.locator('.atlas-side')).toHaveCount(1);

  await expect(page.locator('[data-testid^="game-"]')).toHaveCount(0);

  const flags = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const me = (window as any).__mapEngine;
    return {
      gameController: me.gameController,
      game: me.game,
      gameView: me.gameView,
      gameAis: me.gameAis,
    };
  });
  expect(flags.gameController).toBeUndefined();
  expect(flags.game).toBeUndefined();
  expect(flags.gameView).toBeUndefined();
  expect(flags.gameAis).toBeUndefined();
});

test('game: lobby shows scenario-derived preview stats and replaces AtlasUI entirely', async ({
  page,
}) => {
  await routeFlatElevation(page);
  await page.goto('/?map=three-kingdoms&era=y219&game=1');

  await expect(page.getByTestId('game-lobby')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid^="game-faction-card-"]')).toHaveCount(3);

  // 劉備: 3 cities (jiangling/yiling/shangyong) × unitsPerCity 1 = 3.
  const liubeiCard = page.getByTestId('game-faction-card-liubei');
  await expect(liubeiCard).toContainText('起始城池數 3');
  await expect(liubeiCard).toContainText('兵力 3');

  // 曹操: 2 cities (wan/xiangyang) × unitsPerCity 1 = 2.
  const caocaoCard = page.getByTestId('game-faction-card-caocao');
  await expect(caocaoCard).toContainText('起始城池數 2');
  await expect(caocaoCard).toContainText('兵力 2');

  // GameUI replaces AtlasUI wholesale in game mode — none of its chrome mounts.
  await expect(page.locator('.atlas-side')).toHaveCount(0);
  await expect(page.locator('.atlas-search')).toHaveCount(0);
  await expect(page.locator('.atlas-toolbar')).toHaveCount(0);

  const snapshot = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const me = (window as any).__mapEngine;
    return {
      phase: me.gameController?.getState().phase,
      game: me.game,
    };
  });
  expect(snapshot.phase).toBe('lobby');
  expect(snapshot.game).toBeUndefined();
});

test('game: starting as 劉備 spawns the scenario and training a unit at an owned city works', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await routeFlatElevation(page);
  await page.goto('/?map=three-kingdoms&era=y219&game=1');

  await expect(page.getByTestId('game-lobby')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('game-faction-card-liubei').locator('button').click();

  await expect
    .poll(
      async () =>
        page.evaluate(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          () => (window as any).__mapEngine.gameController.getState().phase,
        ),
      { timeout: 30_000 },
    )
    .toBe('playing');

  // One snapshot: 8 sites with the exact expected owner map, 8 units split
  // 2 (caocao) / 3 (liubei) / 3 (sun), the two AI factions, the topbar and all
  // 8 city labels.
  const snapshot = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const me = (window as any).__mapEngine;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sites = (me.game.listSites() as any[]).map((s) => ({ id: s.id, owner: s.ownerFactionId }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const units = me.game.listUnits() as any[];
    const byFaction: Record<string, number> = {};
    for (const u of units) byFaction[u.factionId] = (byFaction[u.factionId] ?? 0) + 1;
    return {
      sites,
      unitCount: units.length,
      byFaction,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      aiFactionIds: ((me.gameAis ?? []) as any[]).map((a) => a.factionId).sort(),
      cityLabelCount: document.querySelectorAll('[data-testid^="game-city-label-"]').length,
    };
  });

  expect(snapshot.sites).toHaveLength(8);
  const owners = Object.fromEntries(snapshot.sites.map((s) => [s.id, s.owner]));
  expect(owners).toEqual({
    'city:three-kingdoms:wan': 'caocao',
    'city:three-kingdoms:xiangyang': 'caocao',
    'city:three-kingdoms:jiangling': 'liubei',
    'city:three-kingdoms:yiling': 'liubei',
    'city:three-kingdoms:shangyong': 'liubei',
    'city:three-kingdoms:changsha': 'sun',
    'city:three-kingdoms:chibi': 'sun',
    'city:three-kingdoms:wuchang': 'sun',
  });
  expect(snapshot.unitCount).toBe(8);
  expect(snapshot.byFaction).toEqual({ caocao: 2, liubei: 3, sun: 3 });
  expect(snapshot.aiFactionIds).toEqual(['caocao', 'sun']);
  expect(snapshot.cityLabelCount).toBe(8);
  await expect(page.getByTestId('game-topbar')).toBeVisible();

  // Select the player's own city (jiangling) by clicking its screen-projected
  // label position. The camera is still settling from `start()`'s focusPoint
  // fly-in, so retry the click inside the poll until it actually resolves to
  // the site selection (rather than missing, or landing on nothing useful).
  await expect
    .poll(
      async () => {
        const label = await page.evaluate(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const me = (window as any).__mapEngine;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const l = (me.gameController.getCityLabels() as any[]).find(
            (x) => x.cityId === 'jiangling',
          );
          return l ?? null;
        });
        if (!label || !label.visible) return false;
        await page.mouse.click(label.x, label.y);
        const selection = await page.evaluate(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          () => (window as any).__mapEngine.gameController.getState().selection,
        );
        return selection?.kind === 'site' && selection.cityId === 'jiangling';
      },
      { timeout: 30_000 },
    )
    .toBe(true);

  await expect(page.getByTestId('game-selected-panel')).toBeVisible();
  const trainBtn = page.getByTestId('game-train-btn');
  await expect(trainBtn).toBeVisible();
  await expect(trainBtn).toBeEnabled();

  const beforeResources = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const me = (window as any).__mapEngine;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (me.gameController.getState().factions as any[]).find((f) => f.id === 'liubei')
      .resources;
  });

  await trainBtn.click();

  // Resources also tick up ~1-3/s from income while we poll, so `after` is
  // NOT simply `before - trainCost` — assert on what training can uniquely
  // prove: the unit count went 3 → 4 AND resources dropped (only `train()`
  // ever decreases them; income only ever adds).
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const me = (window as any).__mapEngine;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const liubei = (me.gameController.getState().factions as any[]).find(
            (f) => f.id === 'liubei',
          );
          return { unitCount: liubei.unitCount, resources: liubei.resources };
        }),
      { timeout: 30_000 },
    )
    .toEqual(
      expect.objectContaining({
        unitCount: 4,
      }),
    );

  const afterResources = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const me = (window as any).__mapEngine;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (me.gameController.getState().factions as any[]).find((f) => f.id === 'liubei')
      .resources;
  });
  expect(afterResources).toBeLessThan(beforeResources);
});

test('game: capturing all 8 cities as 劉備 ends the game in victory', async ({ page }) => {
  // captureTime is 5 sim-seconds per site and three concurrent Playwright
  // projects rendering WebGL can starve requestAnimationFrame badly — budget
  // generously, as the other game.spec.ts tests do for the same reason.
  test.setTimeout(180_000);
  await routeFlatElevation(page);
  await page.goto('/?map=three-kingdoms&era=y219&game=1');

  await expect(page.getByTestId('game-lobby')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('game-faction-card-liubei').locator('button').click();

  await expect
    .poll(
      async () =>
        page.evaluate(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          () => (window as any).__mapEngine.gameController.getState().phase,
        ),
      { timeout: 30_000 },
    )
    .toBe('playing');

  // Drop a 劉備 unit directly on every enemy-owned site so it starts
  // capturing immediately. `Site.position` is a `Vec3` ({x, y, z}) but
  // `spawnUnit`'s `position` option is a `Vec2` where `.y` means WORLD Z, not
  // world height — passing `site.position.y` here silently teleports the unit
  // to the wrong place and cost a previous agent an hour to debug. Always map
  // `{ x: position.x, y: position.z }`.
  //
  // Every scenario city's starting unit is spawned at the road node nearest
  // its own city — which, verified live, coincides EXACTLY with the city
  // position for all 5 non-劉備 cities. So a plain same-stats invader lands
  // directly on top of the defender: both engage at zero range and, with
  // identical hp/attackDamage, trade a mutual kill in ~10 sim-seconds —
  // capture progress never accrues (nobody's left standing), and the two AI
  // factions, now unopposed, spend the rest of the budget conquering each
  // other AND the player's own cities instead (verified against a live debug
  // run: phase ended 'lost', not 'won'). Overwhelming combat stats make the
  // invader a one-tick executioner instead of an even trade: the defender
  // dies before it can return meaningful damage, the invader is left standing
  // alone, and the site starts capturing normally from there.
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const me = (window as any).__mapEngine;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sites = me.game.listSites() as any[];
    for (const site of sites) {
      if (site.ownerFactionId === 'liubei') continue;
      me.game.spawnUnit({
        factionId: 'liubei',
        position: { x: site.position.x, y: site.position.z },
        hp: 1e6,
        attackDamage: 1e6,
      });
    }
  });

  await expect
    .poll(
      async () =>
        page.evaluate(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          () => (window as any).__mapEngine.gameController.getState().phase,
        ),
      { timeout: 120_000 },
    )
    .toBe('won');

  await expect(page.getByTestId('game-end-overlay')).toBeVisible();
  await expect(page.getByTestId('game-end-overlay')).toContainText('勝利');
  await expect(page.getByTestId('game-restart-btn')).toBeVisible();
});
