import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CONFIG_INICIAL, crearRonda } from '@pila/core';
import { TEMA } from '../src/tema.ts';
import { describirCeldas } from '../src/vista.ts';

const UMBRAL = CONFIG_INICIAL.umbral;

describe('describirCeldas', () => {
  it('respeta celdas[y][x] con una rejilla asimétrica (un intercambio de ejes se detectaría)', () => {
    // Fila 0 = [0, 1, 2]: la celda (x 2, y 0) tiene 2; la (x 0, y 2) tiene 3.
    const celdas = [
      [0, 1, 2],
      [0, 0, 0],
      [3, 0, 1],
    ];
    const d = describirCeldas(celdas, UMBRAL);
    expect(d).toHaveLength(9);
    const en = (x: number, y: number) => d.find((c) => c.x === x && c.y === y);
    expect(en(2, 0)?.carga).toBe(2);
    expect(en(0, 2)?.carga).toBe(3);
    expect(en(1, 0)?.carga).toBe(1);
    expect(en(0, 1)?.carga).toBe(0);
    // Orden por filas.
    expect(d.map((c) => [c.x, c.y])).toEqual([
      [0, 0], [1, 0], [2, 0],
      [0, 1], [1, 1], [2, 1],
      [0, 2], [1, 2], [2, 2],
    ]);
  });

  it('propiedad: cada celda descrita tiene la carga de celdas[y][x]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9 }).chain((lado) =>
          fc.array(fc.array(fc.integer({ min: 0, max: 7 }), { minLength: lado, maxLength: lado }), { minLength: lado, maxLength: lado }),
        ),
        (celdas) => {
          for (const c of describirCeldas(celdas, UMBRAL)) expect(c.carga).toBe(celdas[c.y]?.[c.x]);
        },
      ),
    );
  });

  it('las cargas 0, 1, 2 y 3 usan colores distintos del tema', () => {
    const d = describirCeldas([[0, 1, 2, 3]], UMBRAL);
    expect(d.map((c) => c.color)).toEqual(TEMA.colores.carga.slice(0, 4));
    expect(new Set(d.map((c) => c.color)).size).toBe(4);
    expect(d.every((c) => !c.inestable)).toBe(true);
  });

  it('una celda con umbral granos o más es inestable y usa el color de inestable', () => {
    const d = describirCeldas([[3, 4, 5, 9]], UMBRAL);
    expect(d.map((c) => c.inestable)).toEqual([false, true, true, true]);
    expect(d.slice(1).every((c) => c.color === TEMA.colores.inestable)).toBe(true);
    expect(TEMA.colores.carga).not.toContain(TEMA.colores.inestable);
  });

  it('el texto es la carga', () => {
    expect(describirCeldas([[0, 3], [7, 12]], UMBRAL).map((c) => c.texto)).toEqual(['0', '3', '7', '12']);
  });

  it('no muta su entrada', () => {
    const celdas = [
      [1, 2],
      [3, 4],
    ];
    const copia = structuredClone(celdas);
    describirCeldas(Object.freeze(celdas.map((f) => Object.freeze(f))), UMBRAL);
    expect(celdas).toEqual(copia);
  });
});

describe('integración con @pila/core', () => {
  it.each([0, 1, 2026, 123456789, 4294967295])('crearRonda con la semilla %i: una descripción por celda y ninguna inestable', (semilla) => {
    for (const lado of [1, 3, 5, 9]) {
      const ronda = crearRonda({ ...CONFIG_INICIAL, lado }, semilla);
      expect(ronda.ok).toBe(true);
      if (!ronda.ok) continue;
      const { celdas, config } = ronda.valor.estado;
      const d = describirCeldas(celdas, config.umbral);
      expect(d).toHaveLength(lado * lado);
      expect(d.some((c) => c.inestable)).toBe(false);
    }
  });
});
