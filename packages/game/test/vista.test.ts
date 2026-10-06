import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CONFIG_INICIAL, crearRonda } from '@pila/core';
import { TEMA } from '../src/tema.ts';
import { describirCeldas } from '../src/vista.ts';
import type { CeldaDescrita } from '../src/vista.ts';

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

  it('el número de respaldo solo aparece con 10 granos o más', () => {
    expect(describirCeldas([[0, 3], [9, 10], [12, 9]], 99).map((c) => c.texto)).toEqual([
      undefined, undefined, undefined, '10', '12', undefined,
    ]);
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

/** Describe una sola celda con `carga` granos; el umbral alto evita que sea inestable. */
function unaCelda(carga: number): CeldaDescrita {
  const [c] = describirCeldas([[carga]], 99);
  if (c === undefined) throw new Error('sin descripción');
  return c;
}

const ordenar = (puntos: readonly { x: number; y: number }[]) =>
  puntos.map((p) => [p.x, p.y] as const).toSorted((a, b) => a[0] - b[0] || a[1] - b[1]);

describe('granos como puntos', () => {
  const D = TEMA.granos.desplazamiento;

  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])('con %i granos hay tantos puntos, distintos, dentro de la celda y sin tocarse', (n) => {
    const c = unaCelda(n);
    const r = c.radioGrano;
    expect(c.granos).toHaveLength(n);
    expect(c.texto).toBeUndefined();
    expect(r).toBeGreaterThan(0);
    for (const p of c.granos) {
      // El círculo entero cabe en el cuadrado de lado 1 centrado en el origen.
      expect(Math.abs(p.x) + r).toBeLessThanOrEqual(0.5);
      expect(Math.abs(p.y) + r).toBeLessThanOrEqual(0.5);
    }
    for (const [i, p] of c.granos.entries()) {
      for (const q of c.granos.slice(i + 1)) {
        const distancia = Math.hypot(p.x - q.x, p.y - q.y);
        expect(distancia).toBeGreaterThan(0);
        expect(distancia).toBeGreaterThanOrEqual(2 * r);
      }
    }
  });

  it('las disposiciones de 1 a 4 granos son las de un dado', () => {
    expect(ordenar(unaCelda(1).granos)).toEqual(ordenar([{ x: 0, y: 0 }]));
    expect(ordenar(unaCelda(2).granos)).toEqual(ordenar([{ x: -D, y: -D }, { x: D, y: D }]));
    expect(ordenar(unaCelda(3).granos)).toEqual(ordenar([{ x: -D, y: -D }, { x: 0, y: 0 }, { x: D, y: D }]));
    expect(ordenar(unaCelda(4).granos)).toEqual(
      ordenar([{ x: -D, y: -D }, { x: D, y: -D }, { x: -D, y: D }, { x: D, y: D }]),
    );
  });

  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])('la disposición de %i granos no cambia al girarla 180 grados', (n) => {
    const { granos } = unaCelda(n);
    // `+ 0` convierte −0 en 0 para que la comparación no dependa del signo del cero.
    const girados = granos.map((p) => ({ x: -p.x + 0, y: -p.y + 0 }));
    expect(ordenar(girados)).toEqual(ordenar(granos.map((p) => ({ x: p.x + 0, y: p.y + 0 }))));
  });

  it.each([10, 11, 25, 1000])('con %i granos no hay puntos y el número va como texto', (n) => {
    const c = unaCelda(n);
    expect(c.granos).toHaveLength(0);
    expect(c.texto).toBe(String(n));
  });

  it('una celda inestable también lleva sus puntos', () => {
    const [c] = describirCeldas([[UMBRAL]], UMBRAL);
    expect(c?.inestable).toBe(true);
    expect(c?.granos).toHaveLength(UMBRAL);
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
