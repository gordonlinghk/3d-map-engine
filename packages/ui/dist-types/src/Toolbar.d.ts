export type ToolbarProps = {
    onTourToggle?: () => void;
    tourActive?: boolean;
    onReset?: () => void;
};
export declare function Toolbar({ onTourToggle, tourActive, onReset }: ToolbarProps): import("react").JSX.Element;
