import { describe, it, expect, vi } from 'vitest';
import { Emitter } from './events.js';

describe('Emitter', () => {
  it('calls listeners with the payload', () => {
    const em = new Emitter();
    const fn = vi.fn();
    em.on('ping', fn);
    em.emit('ping', { a: 1 });
    expect(fn).toHaveBeenCalledWith({ a: 1 });
  });

  it('returns an unsubscribe function', () => {
    const em = new Emitter();
    const fn = vi.fn();
    const off = em.on('ping', fn);
    off();
    em.emit('ping');
    expect(fn).not.toHaveBeenCalled();
  });

  it('does not throw when no listeners exist', () => {
    const em = new Emitter();
    expect(() => em.emit('nothing', 1)).not.toThrow();
  });

  it('lets a listener unsubscribe itself during emit', () => {
    const em = new Emitter();
    const calls = [];
    const off = em.on('x', () => { calls.push('a'); off(); });
    em.on('x', () => calls.push('b'));
    em.emit('x');
    em.emit('x');
    expect(calls).toEqual(['a', 'b', 'b']);
  });
});
