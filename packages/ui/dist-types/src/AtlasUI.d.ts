import './ui.css';
import { type ToolbarProps } from './Toolbar';
import type { EngineContextValue } from './types';
export type AtlasUIProps = EngineContextValue & ToolbarProps;
export declare function AtlasUI({ renderer, world, ...toolbar }: AtlasUIProps): import("react").JSX.Element;
