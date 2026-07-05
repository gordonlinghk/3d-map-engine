import type { ReactNode } from 'react';
import type { AtlasEntry } from './entries';
import type { EngineContextValue } from './types';
type AtlasContextValue = EngineContextValue & {
    entries: AtlasEntry[];
};
export declare function AtlasProvider({ renderer, world, children, }: EngineContextValue & {
    children: ReactNode;
}): import("react").JSX.Element;
export declare function useAtlas(): AtlasContextValue;
export {};
