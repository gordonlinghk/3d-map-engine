import type { GameSimulation, SpawnOptions } from './simulation';
/**
 * A deterministic AI controller that plays one faction of a `GameSimulation`.
 *
 * The policy is purely greedy — defend a threatened owned site, otherwise
 * expand to the nearest unclaimed one, and train while affordable — so it
 * needs no randomness at all: no `Math.random()`, no `Date.now()`, and
 * deliberately not even `@map-engine/core`'s seeded RNG. Every decision is a
 * pure function of the simulation's public state plus the controller's own
 * elapsed-time accumulator, which is what makes two controllers replaying the
 * same simulation from the same start produce byte-identical event streams.
 *
 * `update(dt)` must be called once per frame, with the *same* `dt` about to be
 * handed to `sim.tick`, and *before* that `tick` call: the controller reads
 * live unit/site/faction state and issues commands (`trainUnit`,
 * `moveUnitTo`) whose effects are realised by the following `tick`. It never
 * touches anything but `GameSimulation`'s public API, so several controllers
 * — one per faction — can drive the same simulation side by side, each blind
 * to the others except through the shared world. Constructing two
 * controllers for the *same* faction is caller error (they would issue
 * conflicting, redundant commands every pass); this is not detected.
 */
export type AiControllerOptions = {
    /** The faction this controller plays. */
    factionId: string;
    /**
     * Sim-seconds between decision passes. Default 1. Non-finite or `<= 0`
     * falls back to the default. At most one decision pass runs per `update`
     * call no matter how large `dt` is — a stalled game loop cannot make the
     * AI "catch up" by deciding several times in a row.
     */
    decisionInterval?: number;
    /**
     * Stop training once the faction owns this many units. Default 8. `0` is
     * meaningful ("never train"); a non-finite or negative value falls back to
     * the default instead of silently disabling training.
     */
    maxUnits?: number;
    /**
     * Training policy. Omitted → the AI never trains; it only ever commands
     * the units it already has.
     */
    train?: {
        /** Forwarded verbatim as `trainUnit`'s `cost`. */
        cost: number;
        /**
         * Forwarded verbatim as `trainUnit`'s `unit`. Position, id and faction
         * are always the controller's to set, so they are excluded here too.
         */
        unit?: Omit<SpawnOptions, 'id' | 'position' | 'atNode' | 'factionId'>;
    };
};
export interface AiController {
    readonly factionId: string;
    /**
     * Call once per frame with the SAME `dt` you are about to pass to
     * `sim.tick`, BEFORE calling `sim.tick(dt)`. A non-finite `dt` or `dt <= 0`
     * is a no-op — it does not even accumulate. Pure and deterministic: the
     * only inputs are the simulation's public state and the summed `dt` — no
     * RNG, no wall clock.
     */
    update(dt: number): void;
}
export declare function createAiController(sim: GameSimulation, options: AiControllerOptions): AiController;
