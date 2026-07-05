export type ToolbarProps = {
    onTourToggle?: () => void;
    tourActive?: boolean;
    onReset?: () => void;
    /** Regenerate the world with an explicit seed + preset. */
    onGenerate?: (seed: string, preset: string) => void;
};
export declare function Toolbar({ onTourToggle, tourActive, onReset, onGenerate }: ToolbarProps): import("react").JSX.Element;
