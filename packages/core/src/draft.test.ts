import { describe, expect, it } from 'vitest';
import { createDraft, parseDraft, sanitizeOverlayForWorld, DRAFT_FORMAT } from './draft';
import { emptyOverlay } from './edits';
import { generateWorld } from './world';
import { getPresetConfig } from './presets';
import { serializeMap } from './serialize';
import type { BuildingInfo } from './types';
import type { DraftBase } from './draft';

const NOW = '2026-07-05T10:00:00.000Z';
const LATER = '2026-07-06T10:00:00.000Z';

function makeBuilding(id: string): BuildingInfo {
  return {
    id,
    name: 'User Tower',
    type: 'company',
    description: 'custom',
    districtId: 'd:downtown',
    position: { x: 10, y: 5, z: 10 },
    footprint: [
      { x: 4, y: 4 },
      { x: 16, y: 4 },
      { x: 16, y: 16 },
      { x: 4, y: 16 },
    ],
    height: 31,
    floors: 10,
    tags: ['Custom'],
    source: 'user-defined',
  };
}

const proceduralBase: DraftBase = {
  kind: 'procedural',
  seed: 'draft-test',
  directives: { preset: 'coastal-tech-city', environment: 'night' },
};

describe('map drafts', () => {
  it('round-trips through JSON', () => {
    const overlay = { ...emptyOverlay(), added: [makeBuilding('bldg:user:1')], deleted: ['bldg:0,0:1,1'] };
    const draft = createDraft({ name: 'my draft', base: proceduralBase, overlay, now: NOW });
    const parsed = parseDraft(JSON.stringify(draft));
    expect(parsed).toEqual(draft);
    expect(parsed.format).toBe(DRAFT_FORMAT);
    expect(parsed.createdAt).toBe(NOW);
    expect(parsed.updatedAt).toBe(NOW);
  });

  it('re-saving preserves createdAt and bumps updatedAt', () => {
    const first = createDraft({ name: 'd', base: proceduralBase, overlay: emptyOverlay(), now: NOW });
    const second = createDraft({
      name: 'd',
      base: proceduralBase,
      overlay: emptyOverlay(),
      now: LATER,
      createdAt: first.createdAt,
    });
    expect(second.createdAt).toBe(NOW);
    expect(second.updatedAt).toBe(LATER);
  });

  it('round-trips an imported base with a world snapshot', () => {
    const world = generateWorld('draft-osm', getPresetConfig('downtown-night-grid'));
    const base: DraftBase = {
      kind: 'imported',
      sourceSlug: 'hong-kong-central',
      sourceName: 'Hong Kong Central',
      snapshot: serializeMap(world),
    };
    const draft = createDraft({ name: 'hk', base, overlay: emptyOverlay(), now: NOW });
    const parsed = parseDraft(JSON.stringify(draft));
    expect(parsed.base.kind).toBe('imported');
    if (parsed.base.kind === 'imported') {
      expect(parsed.base.snapshot.world.id).toBe(world.id);
      expect(Object.keys(parsed.base.snapshot.world.objects).length).toBeGreaterThan(0);
    }
  });

  it('rejects non-drafts, corrupt JSON and unsupported versions', () => {
    expect(() => parseDraft('not json at all')).toThrow(/JSON/);
    expect(() => parseDraft('{"hello":"world"}')).toThrow(/draft/i);
    const draft = createDraft({ name: 'd', base: proceduralBase, overlay: emptyOverlay(), now: NOW });
    expect(() => parseDraft(JSON.stringify({ ...draft, version: 99 }))).toThrow(/version/i);
    expect(() => parseDraft(JSON.stringify({ ...draft, base: { kind: 'weird' } }))).toThrow(/kind/i);
    expect(() =>
      parseDraft(JSON.stringify({ ...draft, base: { kind: 'procedural', seed: '' } })),
    ).toThrow(/seed/i);
  });

  it('normalizes a missing/partial overlay to an empty one', () => {
    const draft = createDraft({ name: 'd', base: proceduralBase, overlay: emptyOverlay(), now: NOW });
    const raw = { ...draft, overlay: { version: 1, modified: undefined } };
    const parsed = parseDraft(JSON.stringify(raw));
    expect(parsed.overlay.modified).toEqual([]);
    expect(parsed.overlay.added).toEqual([]);
    expect(parsed.overlay.deleted).toEqual([]);
  });

  it('sanitizeOverlayForWorld drops entries whose buildings vanished from the base', () => {
    const world = generateWorld('draft-test', getPresetConfig('coastal-tech-city'));
    const existingId = Object.keys(world.objects).find((id) => id.startsWith('bldg:'))!;
    const existing = world.objects[existingId];
    const modified = structuredClone(
      existing?.objectType === 'building' ? existing.building : makeBuilding(existingId),
    );
    modified.name = 'Renamed';

    const ghost = makeBuilding('bldg:9,9:99,99'); // not in this world
    const overlay = {
      ...emptyOverlay(),
      modified: [modified, ghost],
      added: [makeBuilding('bldg:user:1')],
      deleted: [existingId === 'bldg:gone' ? 'bldg:gone2' : 'bldg:gone'],
    };

    const { overlay: clean, droppedIds } = sanitizeOverlayForWorld(world, overlay);
    expect(clean.modified.map((b) => b.id)).toEqual([existingId]);
    expect(clean.added).toHaveLength(1); // user-added buildings always survive
    expect(clean.deleted).toEqual([]);
    expect(droppedIds).toContain(ghost.id);
    expect(droppedIds).toHaveLength(2);
  });
});
