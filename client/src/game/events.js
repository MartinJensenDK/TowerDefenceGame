/** Minimal synchronous event emitter used by the simulation. */
export class Emitter {
  #listeners = new Map();

  on(name, fn) {
    if (!this.#listeners.has(name)) this.#listeners.set(name, new Set());
    this.#listeners.get(name).add(fn);
    return () => this.off(name, fn);
  }

  off(name, fn) {
    this.#listeners.get(name)?.delete(fn);
  }

  emit(name, payload) {
    const set = this.#listeners.get(name);
    if (!set) return;
    for (const fn of [...set]) fn(payload);
  }
}
