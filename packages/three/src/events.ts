export type Handler<T> = (payload: T) => void;

export interface Emitter<Events extends Record<string, unknown>> {
  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void;
  off<K extends keyof Events>(event: K, handler: Handler<Events[K]>): void;
  emit<K extends keyof Events>(event: K, payload: Events[K]): void;
  clear(): void;
}

export function createEmitter<Events extends Record<string, unknown>>(): Emitter<Events> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers = new Map<keyof Events, Set<Handler<any>>>();
  return {
    on(event, handler) {
      let set = handlers.get(event);
      if (!set) {
        set = new Set();
        handlers.set(event, set);
      }
      set.add(handler);
      return () => set.delete(handler);
    },
    off(event, handler) {
      handlers.get(event)?.delete(handler);
    },
    emit(event, payload) {
      handlers.get(event)?.forEach((h) => h(payload));
    },
    clear() {
      handlers.clear();
    },
  };
}
