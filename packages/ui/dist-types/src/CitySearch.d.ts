import type { CityCandidateLike } from './types';
/**
 * City autocomplete for the world panel. Search/selection/generation stay
 * separate: this component only turns keystrokes into a candidate list and
 * reports the user's pick — the host app owns what "loading a city" means.
 * Stale-response protection: every search bumps a sequence number and aborts
 * the in-flight request; only the newest response may touch state. Results
 * are cached per normalized query for the lifetime of the panel.
 */
export declare function CitySearch({ onSearch, onSelect, currentCityName, }: {
    onSearch: (query: string, signal: AbortSignal) => Promise<CityCandidateLike[]>;
    onSelect: (candidate: CityCandidateLike, scale: number) => void;
    currentCityName?: string;
}): import("react").JSX.Element;
