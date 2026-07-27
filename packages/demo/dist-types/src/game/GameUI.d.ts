import type { ThreeMapRenderer } from '@map-engine/three';
import type { GameController } from '../gameSetup';
import './gameUi.css';
export type GameUIProps = {
    controller: GameController;
    renderer: ThreeMapRenderer;
};
/**
 * Full-screen game HUD driven entirely by `GameController`'s observable
 * snapshot. Replaces `AtlasUI` wholesale in game mode (see App.tsx) — this
 * component and its CSS are self-contained and never touch `@map-engine/ui`.
 */
export declare function GameUI({ controller, renderer }: GameUIProps): import("react").JSX.Element;
