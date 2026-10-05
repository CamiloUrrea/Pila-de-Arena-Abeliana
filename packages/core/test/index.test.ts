import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { NUCLEO_LISTO } from '../src/index.ts';

describe('@pila/core', () => {
  it('exporta el marcador provisional', () => {
    expect(NUCLEO_LISTO).toBe(true);
  });

  it('fast-check está disponible', () => {
    fc.assert(fc.property(fc.integer(), (n) => n + 0 === n));
  });
});
