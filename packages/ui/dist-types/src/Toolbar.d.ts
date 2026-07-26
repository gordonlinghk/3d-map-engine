import type { CityCandidateLike } from './types';
export type ToolbarProps = {
    onTourToggle?: () => void;
    tourActive?: boolean;
    onReset?: () => void;
    /** Regenerate the world with an explicit seed + preset. */
    onGenerate?: (seed: string, preset: string) => void;
    /** Prompt-to-map: describe a city in natural language. */
    onPromptGenerate?: (prompt: string, apiKey: string) => Promise<void>;
    initialApiKey?: string;
    /** Real-world cities (OSM imports). */
    cityOptions?: Array<{
        slug: string;
        name: string;
    }>;
    onLoadCity?: (slug: string) => void;
    /** City geocoding search (enables the autocomplete input). */
    onSearchCities?: (query: string, signal: AbortSignal) => Promise<CityCandidateLike[]>;
    /** Called when the user picks a search candidate (scale = area multiplier 1..3). */
    onSelectCity?: (candidate: CityCandidateLike, scale: number) => void;
    /** Name of the currently loaded real city, if any. */
    currentCityName?: string;
    /** Bundled historical maps. */
    historicalOptions?: Array<{
        slug: string;
        name: string;
    }>;
    onLoadHistorical?: (slug: string) => void;
    /** Selectable era snapshots (年份切換) for the currently loaded historical map. */
    eraOptions?: Array<{
        id: string;
        year: number;
        name: string;
    }>;
    currentEra?: string;
    onSelectEra?: (id: string) => void;
    /** Building editor (enables the ✏️ toggle). */
    onEditModeToggle?: (enabled: boolean) => void;
};
export declare function Toolbar({ onTourToggle, tourActive, onReset, onGenerate, onPromptGenerate, initialApiKey, cityOptions, onLoadCity, onSearchCities, onSelectCity, currentCityName, historicalOptions, onLoadHistorical, eraOptions, currentEra, onSelectEra, onEditModeToggle, }: ToolbarProps): import("react").JSX.Element;
