import { useEffect, useRef, useState } from 'react';
import type { CityCandidateLike } from './types';

const MIN_CHARS = 2;
const DEBOUNCE_MS = 400;

/**
 * City autocomplete for the world panel. Search/selection/generation stay
 * separate: this component only turns keystrokes into a candidate list and
 * reports the user's pick — the host app owns what "loading a city" means.
 * Stale-response protection: every search bumps a sequence number and aborts
 * the in-flight request; only the newest response may touch state. Results
 * are cached per normalized query for the lifetime of the panel.
 */
export function CitySearch({
  onSearch,
  onSelect,
  currentCityName,
}: {
  onSearch: (query: string, signal: AbortSignal) => Promise<CityCandidateLike[]>;
  onSelect: (candidate: CityCandidateLike) => void;
  currentCityName?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CityCandidateLike[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef(new Map<string, CityCandidateLike[]>());

  const runSearch = async (raw: string): Promise<void> => {
    const q = raw.trim().toLowerCase();
    if (q.length < MIN_CHARS) return;
    const seq = ++seqRef.current;
    setError(null);
    const cached = cacheRef.current.get(q);
    if (cached) {
      setResults(cached);
      setHighlight(0);
      setLoading(false);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const found = await onSearch(q, controller.signal);
      if (seq !== seqRef.current) return; // a newer search superseded this one
      cacheRef.current.set(q, found);
      setResults(found);
      setHighlight(0);
      setLoading(false);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError' || seq !== seqRef.current) return;
      setLoading(false);
      setResults(null);
      setError(err instanceof Error ? err.message : 'City search failed — try again.');
      console.error('[city-search]', err);
    }
  };

  // Debounced search-as-you-type.
  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_CHARS) {
      setResults(null);
      setError(null);
      setLoading(false);
      return;
    }
    const timer = setTimeout(() => void runSearch(q), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const select = (candidate: CityCandidateLike): void => {
    setResults(null);
    setQuery(candidate.label);
    onSelect(candidate);
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      setResults(null);
      return;
    }
    if (results && results.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => (h + 1) % results.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => (h - 1 + results.length) % results.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const pick = results[highlight];
        if (pick) select(pick);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void runSearch(query);
    }
  };

  return (
    <div className="atlas-city-search" data-testid="city-search">
      <span className="atlas-city-search-label">🗺 REAL CITY (OpenStreetMap)</span>
      <div className="atlas-city-search-row">
        <input
          data-testid="city-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search any city… e.g. Paris"
          aria-label="Search a real city"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          data-testid="city-search-btn"
          title="Search"
          disabled={query.trim().length < MIN_CHARS || loading}
          onClick={() => void runSearch(query)}
        >
          {loading ? '…' : '🔍'}
        </button>
      </div>

      {loading && (
        <div className="atlas-city-search-note" data-testid="city-search-loading">
          Searching…
        </div>
      )}
      {error && (
        <div className="atlas-city-search-error" data-testid="city-search-error">
          {error}
        </div>
      )}
      {!loading && !error && results !== null && results.length === 0 && (
        <div className="atlas-city-search-note" data-testid="city-search-empty">
          No cities found — try a different spelling.
        </div>
      )}
      {!loading && results !== null && results.length > 0 && (
        <ul className="atlas-city-search-results" data-testid="city-search-results" role="listbox">
          {results.map((c, i) => (
            <li key={c.id}>
              <button
                role="option"
                aria-selected={i === highlight}
                className={i === highlight ? 'active' : ''}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => select(c)}
              >
                <b>{c.name}</b>
                <span>{[c.region, c.country].filter((p) => p && p !== c.name).join(', ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {currentCityName && (
        <div className="atlas-city-search-current" data-testid="city-current">
          Current: <b>{currentCityName}</b>
        </div>
      )}
    </div>
  );
}
