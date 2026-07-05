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
    /** Building editor (enables the ✏️ toggle). */
    onEditModeToggle?: (enabled: boolean) => void;
};
export declare function Toolbar({ onTourToggle, tourActive, onReset, onGenerate, onPromptGenerate, initialApiKey, cityOptions, onLoadCity, onEditModeToggle, }: ToolbarProps): import("react").JSX.Element;
