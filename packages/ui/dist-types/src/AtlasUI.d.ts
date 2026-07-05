import './ui.css';
import { type ToolbarProps } from './Toolbar';
import type { BuildingEditorLike } from './types';
import type { EngineContextValue } from './types';
export type AtlasUIProps = EngineContextValue & ToolbarProps & {
    editor?: BuildingEditorLike;
    onExportWorld?: () => void;
};
export declare function AtlasUI({ renderer, world, editor, onExportWorld, ...toolbar }: AtlasUIProps): import("react").JSX.Element;
