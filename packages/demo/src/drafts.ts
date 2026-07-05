import { parseDraft } from '@map-engine/core';
import type { MapDraft } from '@map-engine/core';

/**
 * Draft file IO. Baseline works everywhere: save = download, open = file
 * picker <input>. When the File System Access API is available (Chrome/Edge)
 * saving writes through a real file handle instead, so repeat saves in the
 * same session overwrite the file silently. Automation (navigator.webdriver)
 * always gets the baseline path — native pickers can't be driven headlessly.
 */

const PENDING_DRAFT_KEY = 'map-engine.pending-draft';

type SaveFilePicker = (opts: {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

export function fsaSupported(): boolean {
  return 'showSaveFilePicker' in window && !navigator.webdriver;
}

export function draftFileName(draft: MapDraft): string {
  return `${draft.name.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || 'map'}.mapdraft.json`;
}

/**
 * Write the draft to disk. Returns the file handle when the File System
 * Access path was used (pass it back next time to overwrite without a
 * dialog), or null on the download path / when the user cancels the dialog.
 */
export async function saveDraftFile(
  draft: MapDraft,
  handle: FileSystemFileHandle | null,
): Promise<FileSystemFileHandle | null> {
  const json = JSON.stringify(draft, null, 2);

  if (fsaSupported()) {
    try {
      const target =
        handle ??
        (await (window as unknown as { showSaveFilePicker: SaveFilePicker }).showSaveFilePicker({
          suggestedName: draftFileName(draft),
          types: [{ description: 'Map draft', accept: { 'application/json': ['.json'] } }],
        }));
      const writable = await target.createWritable();
      await writable.write(json);
      await writable.close();
      return target;
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return null; // user cancelled
      throw err;
    }
  }

  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = draftFileName(draft);
  a.click();
  URL.revokeObjectURL(a.href);
  return null;
}

/**
 * Stash a parsed draft for the post-navigation boot to pick up, scoped to the
 * target URL search string. Drafts can embed multi-MB world snapshots, so
 * sessionStorage may refuse — throw a readable error instead of silently
 * losing the draft.
 */
export function stashPendingDraft(draft: MapDraft, search: string): void {
  try {
    sessionStorage.setItem(PENDING_DRAFT_KEY, JSON.stringify({ search, draft }));
  } catch {
    throw new Error('Draft is too large for this browser session — try a smaller draft file.');
  }
}

/**
 * Read the stashed draft if it targets the current URL. The stash is kept (not
 * consumed) so React StrictMode's double-mount and manual refreshes reuse it;
 * it is cleared as soon as the user navigates to a different world.
 */
export function takePendingDraft(currentSearch: string): MapDraft | null {
  const raw = sessionStorage.getItem(PENDING_DRAFT_KEY);
  if (!raw) return null;
  try {
    const { search, draft } = JSON.parse(raw) as { search: string; draft: unknown };
    if (search !== currentSearch) {
      sessionStorage.removeItem(PENDING_DRAFT_KEY);
      return null;
    }
    return parseDraft(JSON.stringify(draft));
  } catch {
    sessionStorage.removeItem(PENDING_DRAFT_KEY);
    return null;
  }
}
