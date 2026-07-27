export type ScenarioFaction = {
    /** Dataset faction id, e.g. 'liubei'. Also used as the game factionId. */
    id: string;
    /** Display name, e.g. '劉備'. */
    name: string;
    /** Marker/UI color. */
    color: string;
    /** Dataset city ids this faction owns at scenario start. */
    cities: string[];
    /** Units spawned at (the road node nearest) each owned city at start. */
    unitsPerCity: number;
    /** Starting resource stock. */
    resources: number;
    /** Base income per second, independent of cities. */
    income: number;
};
export type Scenario = {
    id: string;
    /** Display title, e.g. '荊州爭奪戰(建安二十四年)'. */
    name: string;
    /** 2–3 sentence opening blurb shown in the lobby, Traditional Chinese. */
    blurb: string;
    mapId: 'three-kingdoms';
    /** Era whose map tint best matches the scenario; the URL should carry it. */
    recommendedEra: string;
    factions: ScenarioFaction[];
    siteDefaults: {
        captureRadius: number;
        captureTime: number;
        income: number;
    };
    trainCost: number;
    unitStats: {
        speed: number;
        hp: number;
        attackDamage: number;
        attackRange: number;
    };
    victoryText: string;
    defeatText: string;
};
/** `city:{mapId}:{cityId}` — the building id historicalToWorld assigns. */
export declare function scenarioBuildingId(scenario: Scenario, cityId: string): string;
/** Every city id in the scenario, in faction order then city order. */
export declare function scenarioCityIds(scenario: Scenario): string[];
export declare const JINGZHOU_219: Scenario;
