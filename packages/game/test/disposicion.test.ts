import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { disponer } from '../src/disposicion.ts';
import type { Disposicion, Rect } from '../src/disposicion.ts';
import { BANDAS_INICIALES, TEMA } from '../src/tema.ts';

/** Tolerancia de coma flotante, en píxeles. */
const EPS = 1e-6;

const LADOS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const VENTANAS: readonly (readonly [number, number])[] = [
  [1920, 1080],
  [800, 600],
  [400, 800],
  [300, 300],
  [120, 60],
];

const todas = (d: Disposicion): Rect[] => d.celdas.flat();

/** Comprueba todas las propiedades de una disposición. */
function comprobar(ancho: number, alto: number, lado: number): void {
  const d = disponer(ancho, alto, lado);
  const celdas = todas(d);
  const banda = d.bandaCentral;
  const margen = Math.min(banda.ancho, banda.alto) * TEMA.proporciones.margenTablero;

  // Una celda por posición, indexadas celdas[y][x].
  expect(d.celdas).toHaveLength(lado);
  for (const fila of d.celdas) expect(fila).toHaveLength(lado);

  // Cuadradas, iguales y de tamaño positivo.
  expect(d.celda).toBeGreaterThan(0);
  for (const c of celdas) {
    expect(c.ancho).toBe(d.celda);
    expect(c.alto).toBe(d.celda);
  }

  // Caben dentro de la banda central con su margen.
  for (const c of celdas) {
    expect(c.x).toBeGreaterThanOrEqual(banda.x + margen - EPS);
    expect(c.y).toBeGreaterThanOrEqual(banda.y + margen - EPS);
    expect(c.x + c.ancho).toBeLessThanOrEqual(banda.x + banda.ancho - margen + EPS);
    expect(c.y + c.alto).toBeLessThanOrEqual(banda.y + banda.alto - margen + EPS);
  }

  // No se solapan: dos celdas distintas están separadas al menos por el hueco en algún eje.
  expect(d.hueco).toBeGreaterThan(0);
  for (const [i, a] of celdas.entries()) {
    for (const b of celdas.slice(i + 1)) {
      const separacionX = Math.max(b.x - (a.x + a.ancho), a.x - (b.x + b.ancho));
      const separacionY = Math.max(b.y - (a.y + a.alto), a.y - (b.y + b.alto));
      expect(Math.max(separacionX, separacionY)).toBeGreaterThanOrEqual(d.hueco - EPS);
    }
  }

  // Centrado horizontalmente en la ventana.
  const izquierda = Math.min(...celdas.map((c) => c.x));
  const derecha = Math.max(...celdas.map((c) => c.x + c.ancho));
  expect(Math.abs(izquierda - (ancho - derecha))).toBeLessThan(EPS);

  // Determinista.
  expect(disponer(ancho, alto, lado)).toEqual(d);
}

describe('disposición', () => {
  it('reparte la ventana en bandas de 12 %, 63 % y 25 %', () => {
    expect(BANDAS_INICIALES).toEqual({ superior: 0.12, central: 0.63, inferior: 0.25 });
    const d = disponer(1000, 1000, 3);
    expect([d.bandaSuperior.alto, d.bandaCentral.alto, d.bandaInferior.alto].map((v) => Math.round(v))).toEqual([120, 630, 250]);
    expect(d.bandaCentral.y).toBe(d.bandaSuperior.alto);
    expect(d.bandaInferior.y + d.bandaInferior.alto).toBeCloseTo(1000, 9);
  });

  for (const [ancho, alto] of VENTANAS) {
    it(`ventana ${ancho}×${alto}: las celdas caben, son cuadradas, no se solapan y están centradas (lados 1 a 9)`, () => {
      for (const lado of LADOS) comprobar(ancho, alto, lado);
    });
  }

  it('propiedad: con ventanas de 100 a 4000 en cada eje, para cualquier lado de 1 a 9', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 4000 }), fc.integer({ min: 100, max: 4000 }), fc.integer({ min: 1, max: 9 }), (a, h, lado) => {
        comprobar(a, h, lado);
      }),
    );
  });

  it.each<[number, number]>([
    [0, 0],
    [0, 800],
    [800, 0],
    [-5, 300],
    [Number.NaN, 300],
  ])('ventana degenerada %d×%d: celdas de tamaño 0, sin NaN ni excepciones', (ancho, alto) => {
    for (const lado of LADOS) {
      const d = disponer(ancho, alto, lado);
      expect(d.celda).toBe(0);
      // JSON.stringify escribe NaN e infinito como null.
      expect(JSON.stringify(d)).not.toContain('null');
      for (const c of todas(d)) for (const v of [c.x, c.y, c.ancho, c.alto]) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('rechaza un lado que no sea un entero ≥ 1', () => {
    expect(() => disponer(800, 600, 0)).toThrow(RangeError);
    expect(() => disponer(800, 600, 2.5)).toThrow(RangeError);
  });
});
