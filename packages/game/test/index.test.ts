import { describe, expect, it } from 'vitest';
import { NUCLEO_LISTO } from '@pila/core';
import { NUCLEO_ENLAZADO } from '../src/index.ts';

describe('@pila/game', () => {
  it('importa el marcador de @pila/core', () => {
    expect(NUCLEO_LISTO).toBe(true);
    expect(NUCLEO_ENLAZADO).toBe(true);
  });
});
