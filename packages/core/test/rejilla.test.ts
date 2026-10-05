import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { crearRejilla, dentro, leerCelda } from '../src/index.ts';
import { congelar } from './ayudantes.ts';

describe('rejilla', () => {
  it('crearRejilla da lado × lado celdas a cero', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9 }), (lado) => {
        const rejilla = crearRejilla(lado);
        expect(rejilla).toHaveLength(lado);
        for (const fila of rejilla) {
          expect(fila).toHaveLength(lado);
          expect(fila.every((celda) => celda === 0)).toBe(true);
        }
      }),
    );
  });

  it('crearRejilla admite un valor inicial y filas independientes', () => {
    const rejilla = crearRejilla(3, 2);
    expect(rejilla).toEqual([
      [2, 2, 2],
      [2, 2, 2],
      [2, 2, 2],
    ]);
    expect(rejilla[0]).not.toBe(rejilla[1]);
  });

  it('dentro acepta los bordes y rechaza lo de fuera', () => {
    expect(dentro(3, 0, 0)).toBe(true);
    expect(dentro(3, 2, 2)).toBe(true);
    expect(dentro(3, 2, 0)).toBe(true);
    expect(dentro(3, 0, 2)).toBe(true);
    expect(dentro(1, 0, 0)).toBe(true);
    expect(dentro(3, -1, 0)).toBe(false);
    expect(dentro(3, 0, -1)).toBe(false);
    expect(dentro(3, 3, 0)).toBe(false);
    expect(dentro(3, 0, 3)).toBe(false);
    expect(dentro(3, 1.5, 1)).toBe(false);
    expect(dentro(3, Number.NaN, 1)).toBe(false);
  });

  it('leerCelda lee celdas[y][x] y da undefined fuera, sin mutar la entrada', () => {
    const celdas = congelar([
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
    ]);
    expect(leerCelda(celdas, 2, 0)).toBe(2);
    expect(leerCelda(celdas, 0, 2)).toBe(6);
    expect(leerCelda(celdas, 3, 0)).toBeUndefined();
    expect(leerCelda(celdas, 0, -1)).toBeUndefined();
    expect(celdas).toEqual([
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
    ]);
  });
});
