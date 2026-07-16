// Tiny synchronous emitter — the one-way bridge from sim to the outside
// world (fx, sfx, juice, music, hud). Listeners must never mutate sim state;
// sim-internal communication uses direct method calls so step ordering stays
// auditable. A new emitter is created per run, so there is no off().

export function createEmitter() {
  const listeners = new Map();
  return {
    // test/logging hook — sees every emit before listeners do
    tap: null,

    on(name, fn) {
      let l = listeners.get(name);
      if (!l) listeners.set(name, (l = []));
      l.push(fn);
    },

    emit(name, payload) {
      if (this.tap) this.tap(name, payload);
      const l = listeners.get(name);
      if (l) for (const fn of l) fn(payload);
    },
  };
}
