export type ToolbarProps = {
    onTourToggle?: () => void;
    tourActive?: boolean;
    onReset?: () => void;
    /** Regenerate the world with an explicit seed + preset. */
    onGenerate?: (seed: string, preset: string) => void;
    /** Prompt-to-map: describe a city in natural language. */
    onPromptGenerate?: (prompt: string, apiKey: string) => Promise<void>;
    initialApiKey?: string;
};
export declare function Toolbar({ onTourToggle, tourActive, onReset, onGenerate, onPromptGenerate, initialApiKey, }: ToolbarProps): import("react").JSX.Element;
