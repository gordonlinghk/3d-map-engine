import type { EditOverlay } from './edits';
import { emptyOverlay, normalizeOverlay } from './edits';
import type { MapDirectives } from './directives';
import type { MapWorld, SerializedMap } from './types';
import { SERIALIZATION_VERSION } from './types';

/**
 * A map draft is a portable file that captures in-progress edits plus a way to
 * rebuild the base world they apply to, so editing can resume later on any
 * machine. Procedural worlds store only their recipe (seed + directives —
 * regeneration is deterministic); imported worlds (OSM) embed a full snapshot
 * because the upstream data source can drift between sessions.
 */

export const DRAFT_FORMAT = 'map-engine-draft';
export const DRAFT_VERSION = 1;

export type DraftBase =
  | { kind: 'procedural'; seed: string; directives: MapDirectives }
  | { kind: 'imported'; sourceSlug: string; sourceName: string; snapshot: SerializedMap };

export type MapDraft = {
  format: typeof DRAFT_FORMAT;
  version: typeof DRAFT_VERSION;
  name: string;
  createdAt: string;
  updatedAt: string;
  base: DraftBase;
  overlay: EditOverlay;
};

/**
 * Assemble a draft. Timestamps are passed in (never read from the clock here)
 * so core stays deterministic and unit-testable.
 */
export function createDraft(opts: {
  name: string;
  base: DraftBase;
  overlay: EditOverlay;
  /** ISO timestamp for updatedAt (and createdAt when not resuming a draft). */
  now: string;
  /** Preserved from the original draft when re-saving. */
  createdAt?: string;
}): MapDraft {
  return {
    format: DRAFT_FORMAT,
    version: DRAFT_VERSION,
    name: opts.name,
    createdAt: opts.createdAt ?? opts.now,
    updatedAt: opts.now,
    base: structuredClone(opts.base),
    overlay: structuredClone(opts.overlay),
  };
}

/** Parse and validate a draft file's JSON text. Throws with a readable reason. */
export function parseDraft(json: string): MapDraft {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('Not a valid JSON file.');
  }
  const d = data as Partial<MapDraft> | null;
  if (!d || typeof d !== 'object' || d.format !== DRAFT_FORMAT) {
    throw new Error('Not a map-engine draft file.');
  }
  if (d.version !== DRAFT_VERSION) {
    throw new Error(
      `Draft version ${String(d.version)} is not supported by this build (expected ${DRAFT_VERSION}).`,
    );
  }
  const base = d.base as DraftBase | undefined;
  if (!base || typeof base !== 'object') throw new Error('Draft is missing its base world.');
  if (base.kind === 'procedural') {
    if (typeof base.seed !== 'string' || !base.seed) throw new Error('Draft base has no seed.');
    if (!base.directives || typeof base.directives !== 'object') {
      throw new Error('Draft base has no directives.');
    }
  } else if (base.kind === 'imported') {
    if (typeof base.sourceSlug !== 'string' || !base.sourceSlug) {
      throw new Error('Draft base has no source slug.');
    }
    if (base.snapshot?.version !== SERIALIZATION_VERSION || !base.snapshot.world) {
      throw new Error('Draft base snapshot is missing or from an unsupported version.');
    }
  } else {
    throw new Error(`Unknown draft base kind "${String((base as { kind?: unknown }).kind)}".`);
  }

  // Older drafts embed a v1 overlay; normalizeOverlay migrates it to v2.
  const overlay = normalizeOverlay(d.overlay);

  return {
    format: DRAFT_FORMAT,
    version: DRAFT_VERSION,
    name: typeof d.name === 'string' && d.name ? d.name : 'untitled draft',
    createdAt: typeof d.createdAt === 'string' ? d.createdAt : '',
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : '',
    base,
    overlay,
  };
}

/**
 * Drop overlay entries that reference buildings absent from the base world —
 * this happens when an imported data source drifted since the draft was saved.
 * Returns the cleaned overlay plus the ids that were dropped (for reporting);
 * user-added buildings are always kept.
 */
export function sanitizeOverlayForWorld(
  world: MapWorld,
  overlay: EditOverlay,
): { overlay: EditOverlay; droppedIds: string[] } {
  const out = emptyOverlay();
  const droppedIds: string[] = [];
  for (const b of overlay.modified) {
    if (world.objects[b.id]) out.modified.push(structuredClone(b));
    else droppedIds.push(b.id);
  }
  for (const id of overlay.deleted) {
    if (world.objects[id]) out.deleted.push(id);
    else droppedIds.push(id);
  }
  out.added = overlay.added.map((b) => structuredClone(b));

  for (const p of overlay.modifiedPois) {
    if (world.objects[p.id]) out.modifiedPois.push(structuredClone(p));
    else droppedIds.push(p.id);
  }
  for (const id of overlay.deletedPois) {
    if (world.objects[id]) out.deletedPois.push(id);
    else droppedIds.push(id);
  }
  out.addedPois = overlay.addedPois.map((p) => structuredClone(p));
  return { overlay: out, droppedIds };
}
