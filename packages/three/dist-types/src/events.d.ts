export type Handler<T> = (payload: T) => void;
export interface Emitter<Events extends Record<string, unknown>> {
    on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void;
    off<K extends keyof Events>(event: K, handler: Handler<Events[K]>): void;
    emit<K extends keyof Events>(event: K, payload: Events[K]): void;
    clear(): void;
}
export declare function createEmitter<Events extends Record<string, unknown>>(): Emitter<Events>;
