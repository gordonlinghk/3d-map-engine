import type { MapDraft } from '@map-engine/core';
export declare function fsaSupported(): boolean;
export declare function draftFileName(draft: MapDraft): string;
/**
 * Write the draft to disk. Returns the file handle when the File System
 * Access path was used (pass it back next time to overwrite without a
 * dialog), or null on the download path / when the user cancels the dialog.
 */
export declare function saveDraftFile(draft: MapDraft, handle: FileSystemFileHandle | null): Promise<FileSystemFileHandle | null>;
/**
 * Stash a parsed draft for the post-navigation boot to pick up, scoped to the
 * target URL search string. Drafts can embed multi-MB world snapshots, so
 * sessionStorage may refuse — throw a readable error instead of silently
 * losing the draft.
 */
export declare function stashPendingDraft(draft: MapDraft, search: string): void;
/**
 * Read the stashed draft if it targets the current URL. The stash is kept (not
 * consumed) so React StrictMode's double-mount and manual refreshes reuse it;
 * it is cleared as soon as the user navigates to a different world.
 */
export declare function takePendingDraft(currentSearch: string): MapDraft | null;
