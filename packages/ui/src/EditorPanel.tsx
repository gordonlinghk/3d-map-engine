import { useEffect, useState } from 'react';
import { useAtlas } from './context';
import { useAtlasStore } from './store';
import type { BuildingEditorLike } from './types';

const btn: React.CSSProperties = {
  padding: '7px 10px',
  border: 'none',
  borderRadius: 9,
  background: 'rgba(0,0,0,0.08)',
  cursor: 'pointer',
  fontSize: 12.5,
  fontWeight: 600,
};

export function EditorPanel({
  editor,
  onExport,
  onSaveDraft,
  onOpenDraft,
}: {
  editor: BuildingEditorLike;
  onExport?: () => void;
  onSaveDraft?: () => void;
  onOpenDraft?: () => void;
}) {
  const { renderer } = useAtlas();
  const selectedId = useAtlasStore((s) => s.selectedId);
  const [, setTick] = useState(0);
  useEffect(() => editor.onChange(() => setTick((t) => t + 1)), [editor]);

  const editorState = editor.getState();
  const building = selectedId ? editor.getBuilding(selectedId) : null;
  const poi = selectedId && !building ? editor.getPoi(selectedId) : null;
  const [nameDraft, setNameDraft] = useState(building?.name ?? '');
  const buildingName = building?.name ?? '';
  useEffect(() => {
    setNameDraft(buildingName);
  }, [selectedId, buildingName]);

  const [poiNameDraft, setPoiNameDraft] = useState(poi?.name ?? '');
  const [poiDescDraft, setPoiDescDraft] = useState(poi?.description ?? '');
  const poiName = poi?.name ?? '';
  const poiDesc = poi?.description ?? '';
  useEffect(() => {
    setPoiNameDraft(poiName);
    setPoiDescDraft(poiDesc);
  }, [selectedId, poiName, poiDesc]);

  return (
    <div className="atlas-info" data-testid="editor-panel">
      <div className="atlas-info-header" style={{ background: 'linear-gradient(135deg, rgba(91,75,214,0.18), rgba(91,75,214,0.03))' }}>
        <div>
          <h2>✏️ Editor</h2>
          <span className="tag" style={{ color: '#4c3fb0', background: 'rgba(91,75,214,0.14)', borderColor: 'rgba(91,75,214,0.35)' }}>
            edit mode
          </span>
        </div>
      </div>
      <div className="atlas-info-body">
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button data-testid="editor-undo" style={btn} disabled={!editorState.canUndo} onClick={() => editor.undo()}>
            ↩ Undo
          </button>
          <button data-testid="editor-redo" style={btn} disabled={!editorState.canRedo} onClick={() => editor.redo()}>
            ↪ Redo
          </button>
          <button
            data-testid="editor-add"
            style={{ ...btn, marginLeft: 'auto', background: editorState.addMode ? '#5b4bd6' : 'rgba(0,0,0,0.08)', color: editorState.addMode ? '#fff' : undefined }}
            onClick={() => editor.setAddMode(!editorState.addMode)}
          >
            ＋ Add
          </button>
          <button
            data-testid="editor-poi"
            style={{ ...btn, background: editorState.poiMode ? '#5b4bd6' : 'rgba(0,0,0,0.08)', color: editorState.poiMode ? '#fff' : undefined }}
            onClick={() => editor.setPoiMode(!editorState.poiMode)}
          >
            📍 POI
          </button>
        </div>
        {editorState.addMode && (
          <p className="desc" data-testid="editor-add-hint">
            Click anywhere on the ground to place a new building.
          </p>
        )}
        {editorState.poiMode && (
          <p className="desc" data-testid="editor-poi-hint">
            Click anywhere on the ground to place a new POI marker.
          </p>
        )}

        {!building && !poi && !editorState.addMode && !editorState.poiMode && (
          <p className="desc">
            Click a building to edit it — drag the selected building to move it. Changes are saved
            in your browser automatically.
          </p>
        )}

        {building && (
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-dim)' }}>NAME</span>
              <input
                data-testid="editor-name"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => {
                  if (nameDraft.trim() && nameDraft !== building.name) {
                    editor.rename(building.id, nameDraft.trim());
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                style={{ padding: '7px 9px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', fontSize: 13 }}
              />
            </label>

            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-dim)' }}>
                FLOORS · {building.floors}(約 {Math.round(building.height)} m)
              </span>
              <input
                data-testid="editor-floors"
                type="range"
                min={1}
                max={80}
                value={building.floors}
                onChange={(e) => editor.setFloors(building.id, Number(e.target.value))}
              />
            </label>

            <div style={{ display: 'flex', gap: 8 }}>
              <button data-testid="editor-rotate-ccw" style={btn} onClick={() => editor.rotate(building.id, -15)}>
                ⟲ 15°
              </button>
              <button data-testid="editor-rotate-cw" style={btn} onClick={() => editor.rotate(building.id, 15)}>
                ⟳ 15°
              </button>
              <button
                data-testid="editor-delete"
                style={{ ...btn, marginLeft: 'auto', background: 'rgba(179,56,44,0.12)', color: '#b3382c' }}
                onClick={() => editor.deleteBuilding(building.id)}
              >
                🗑 Delete
              </button>
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              Drag the highlighted building on the map to move it.
            </div>
          </div>
        )}

        {poi && (
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-dim)' }}>NAME</span>
              <input
                data-testid="poi-name"
                value={poiNameDraft}
                onChange={(e) => setPoiNameDraft(e.target.value)}
                onBlur={() => {
                  if (poiNameDraft.trim() && (poiNameDraft !== poi.name || poiDescDraft !== (poi.description ?? ''))) {
                    editor.renamePoi(poi.id, poiNameDraft.trim(), poiDescDraft);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                style={{ padding: '7px 9px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', fontSize: 13 }}
              />
            </label>

            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-dim)' }}>ICON</span>
              <select
                data-testid="poi-icon"
                value={poi.icon}
                onChange={(e) => editor.setPoiIcon(poi.id, e.target.value as typeof poi.icon)}
                style={{ padding: '7px 9px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', fontSize: 13 }}
              >
                <option value="flag">🚩 Flag</option>
                <option value="quest">⭐ Quest</option>
                <option value="resource">🌾 Resource</option>
                <option value="danger">⚠️ Danger</option>
                <option value="note">📝 Note</option>
              </select>
            </label>

            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-dim)' }}>
                DESCRIPTION(可選)
              </span>
              <input
                data-testid="poi-desc"
                value={poiDescDraft}
                onChange={(e) => setPoiDescDraft(e.target.value)}
                onBlur={() => {
                  if (poiNameDraft.trim() && (poiNameDraft !== poi.name || poiDescDraft !== (poi.description ?? ''))) {
                    editor.renamePoi(poi.id, poiNameDraft.trim(), poiDescDraft);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                style={{ padding: '7px 9px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', fontSize: 13 }}
              />
            </label>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                data-testid="poi-delete"
                style={{ ...btn, marginLeft: 'auto', background: 'rgba(179,56,44,0.12)', color: '#b3382c' }}
                onClick={() => editor.deletePoi(poi.id)}
              >
                🗑 Delete
              </button>
            </div>
          </div>
        )}

        {(onSaveDraft || onOpenDraft) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14, borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 12 }}>
            {onSaveDraft && (
              <button data-testid="editor-save-draft" style={btn} onClick={onSaveDraft}>
                💾 Save draft
              </button>
            )}
            {onOpenDraft && (
              <button data-testid="editor-open-draft" style={btn} onClick={onOpenDraft}>
                📂 Open draft
              </button>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {onExport && (
            <button data-testid="editor-export" style={btn} onClick={onExport}>
              ⬇ Export world JSON
            </button>
          )}
          <button
            data-testid="editor-close"
            style={{ ...btn, marginLeft: 'auto' }}
            onClick={() => {
              useAtlasStore.getState().setEditMode(false);
              editor.setEnabled(false);
              renderer.setSelected(null);
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
