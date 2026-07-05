import Fuse from 'fuse.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAtlas } from './context';
import { useAtlasStore } from './store';
import { avatarColor, avatarLetter } from './avatar';
import type { AtlasEntry } from './entries';

export function SearchBar() {
  const { renderer, entries } = useAtlas();
  const query = useAtlasStore((s) => s.query);
  const setQuery = useAtlasStore((s) => s.setQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const fuse = useMemo(
    () =>
      new Fuse(entries, {
        keys: ['name', 'category', 'tags', 'description'],
        threshold: 0.35,
      }),
    [entries],
  );

  const results = useMemo(
    () => (query.trim() ? fuse.search(query).slice(0, 8).map((r) => r.item) : []),
    [fuse, query],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const choose = (entry: AtlasEntry): void => {
    setOpen(false);
    setQuery('');
    if (entry.kind === 'district') return;
    renderer.setSelected(entry.id);
    void renderer.focusObject(entry.id);
  };

  return (
    <div className="atlas-search" data-testid="search-bar">
      <span className="icon">🔍</span>
      <input
        ref={inputRef}
        value={query}
        placeholder="Search companies, landmarks, neighborhoods…"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIdx(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActiveIdx((i) => Math.min(i + 1, results.length - 1));
          else if (e.key === 'ArrowUp') setActiveIdx((i) => Math.max(i - 1, 0));
          else if (e.key === 'Enter' && results[activeIdx]) choose(results[activeIdx]);
          else if (e.key === 'Escape') {
            setQuery('');
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <span className="kbd">⌘K</span>
      {open && results.length > 0 && (
        <div className="atlas-search-results" data-testid="search-results">
          {results.map((r, i) => (
            <button
              key={r.id}
              className={`row${i === activeIdx ? ' active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(r);
              }}
            >
              <span
                className="avatar"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: avatarColor(r.category),
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {avatarLetter(r.name)}
              </span>
              <span>{r.name}</span>
              <span className="cat">{r.category}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
