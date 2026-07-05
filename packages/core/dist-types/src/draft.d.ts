import type { EditOverlay } from './edits';
import type { MapDirectives } from './directives';
import type { MapWorld, SerializedMap } from './types';
/**
 * A map draft is a portable file that captures in-progress edits plus a way to
 * rebuild the base world they apply to, so editing can resume later on any
 * machine. Procedural worlds store only their recipe (seed + directives —
 * regeneration is deterministic); imported worlds (OSM) embed a full snapshot
 * because the upstream data source can drift between sessions.
 */
export declare const DRAFT_FORMAT = "map-engine-draft";
export declare const DRAFT_VERSION = 1;
export type DraftBase = {
    kind: 'procedural';
    seed: string;
    directives: MapDirectives;
} | {
    kind: 'imported';
    sourceSlug: string;
    sourceName: string;
    snapshot: SerializedMap;
};
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
export declare function createDraft(opts: {
    name: string;
    base: DraftBase;
    overlay: EditOverlay;
    /** ISO timestamp for updatedAt (and createdAt when not resuming a draft). */
    now: string;
    /** Preserved from the original draft when re-saving. */
    createdAt?: string;
}): MapDraft;
/** Parse and validate a draft file's JSON text. Throws with a readable reason. */
export declare function parseDraft(json: string): MapDraft;
/**
 * Drop overlay entries that reference buildings absent from the base world —
 * this happens when an imported data source drifted since the draft was saved.
 * Returns the cleaned overlay plus the ids that were dropped (for reporting);
 * user-added buildings are always kept.
 */
export declare function sanitizeOverlayForWorld(world: MapWorld, overlay: EditOverlay): {
    overlay: EditOverlay;
    droppedIds: string[];
};
