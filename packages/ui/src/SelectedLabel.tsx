import { useEffect, useRef } from 'react';
import { useAtlas } from './context';
import { useAtlasStore } from './store';
import { avatarColor, avatarLetter } from './avatar';

/** Floating billboard label above the selected object (reference image 7). */
export function SelectedLabel() {
  const { renderer, world } = useAtlas();
  const selectedId = useAtlasStore((s) => s.selectedId);
  const labelsVisible = useAtlasStore((s) => s.labelsVisible);
  const ref = useRef<HTMLDivElement>(null);

  const obj = selectedId ? world.objects[selectedId] : null;
  const name =
    obj?.objectType === 'building'
      ? obj.building.name
      : obj?.objectType === 'landmark'
        ? obj.landmark.name
        : null;
  const category =
    obj?.objectType === 'building'
      ? (obj.building.category ?? obj.building.type)
      : obj?.objectType === 'landmark'
        ? 'Landmark'
        : undefined;

  useEffect(() => {
    if (!selectedId || !name) return;
    const el = ref.current;
    if (!el) return;
    const anchor = renderer.getObjectAnchor(selectedId);
    if (!anchor) return;
    let last = 0;
    const off = renderer.onFrame(() => {
      const now = performance.now();
      if (now - last < 40) return;
      last = now;
      const p = renderer.projectToScreen(anchor);
      el.style.display = p.visible ? 'flex' : 'none';
      el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
    });
    return off;
  }, [renderer, selectedId, name]);

  if (!selectedId || !name || !labelsVisible) return null;

  return (
    <div
      ref={ref}
      data-testid="selected-label"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        display: 'none',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        pointerEvents: 'none',
        zIndex: 18,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 11,
          background: avatarColor(category),
          color: '#fff',
          fontWeight: 800,
          fontSize: 17,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 6px 18px rgba(10,14,22,0.35)',
        }}
      >
        {avatarLetter(name)}
      </div>
      <div
        style={{
          background: 'rgba(18, 22, 30, 0.82)',
          color: '#fff',
          fontSize: 13,
          fontWeight: 600,
          borderRadius: 999,
          padding: '5px 13px',
          whiteSpace: 'nowrap',
          boxShadow: '0 6px 18px rgba(10,14,22,0.35)',
        }}
      >
        {name}
      </div>
    </div>
  );
}
