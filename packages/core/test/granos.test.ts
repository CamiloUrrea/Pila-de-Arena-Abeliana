import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CONFIG_INICIAL, DEFINICIONES_GRANOS } from '../src/index.ts';
import { aplicarAdiciones } from '../src/adiciones.ts';
import { resolverOleadas } from '../src/oleadas.ts';
import { crearRejilla } from '../src/rejilla.ts';
import { TIPOS_GRANO } from '../src/tipos.ts';
import type { TipoGrano } from '../src/index.ts';
import type { Celdas, Colocacion } from '../src/tipos.ts';
import { congelar } from './ayudantes.ts';
import { sumarAdiciones } from './oraculos.ts';

const suma = (celdas: Celdas): number => celdas.flat().reduce((a, b) => a + b, 0);

/** Paso 1 y oleadas con los parámetros de CONFIG_INICIAL, exigiendo que la resolución termine. */
function tirada(celdas: Celdas, colocaciones: readonly Colocacion[]) {
  const adiciones = aplicarAdiciones(celdas, colocaciones);
  const resultado = resolverOleadas(adiciones.celdas, {
    lado: celdas.length,
    umbral: CONFIG_INICIAL.umbral,
    multiplicadorPorOleada: CONFIG_INICIAL.multiplicadorPorOleada,
    topeOleadas: CONFIG_INICIAL.topeOleadas,
  });
  if (!resultado.ok) throw new Error('la resolución no terminó');
  return { adiciones, oleadas: resultado.valor };
}

describe('ejemplos de oro de punta a punta', () => {
  it('A: derrumbe en una esquina', () => {
    const { adiciones, oleadas } = tirada(
      [
        [3, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
      [{ tipo: 'normal', x: 0, y: 0 }],
    );
    expect(adiciones.eventos).toEqual([{ tipo: 'AdicionAplicada', x: 0, y: 0, cantidad: 1 }]);
    expect(oleadas.celdas).toEqual([
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, 0],
    ]);
    expect([oleadas.oleadas, oleadas.derrumbes, oleadas.granosFuera, oleadas.puntos]).toEqual([1, 1, 2, 200]);
  });

  it('B: cascada completa', () => {
    const { adiciones, oleadas } = tirada(crearRejilla(3, 3), [{ tipo: 'normal', x: 1, y: 1 }]);
    expect(suma(adiciones.celdas)).toBe(28);
    expect(oleadas.celdas).toEqual([
      [1, 3, 1],
      [3, 0, 3],
      [1, 3, 1],
    ]);
    expect([oleadas.oleadas, oleadas.derrumbes, oleadas.granosFuera, oleadas.puntos]).toEqual([3, 10, 12, 1400]);
    expect(suma(oleadas.celdas)).toBe(16);
  });

  it('C: explosivo en una esquina', () => {
    const { adiciones, oleadas } = tirada(crearRejilla(3), [{ tipo: 'explosivo', x: 0, y: 0 }]);
    expect(adiciones.eventos).toEqual([
      { tipo: 'AdicionAplicada', x: 0, y: 0, cantidad: 1 },
      { tipo: 'AdicionAplicada', x: 1, y: 0, cantidad: 1 },
      { tipo: 'AdicionAplicada', x: 0, y: 1, cantidad: 1 },
    ]);
    expect(oleadas.celdas).toEqual([
      [1, 1, 0],
      [1, 0, 0],
      [0, 0, 0],
    ]);
    expect(oleadas.oleadas).toBe(0);
    expect(oleadas.eventos).toEqual([]);
  });
});

describe('aplicarAdiciones', () => {
  it('el pesado suma 2', () => {
    const r = aplicarAdiciones(crearRejilla(3), [{ tipo: 'pesado', x: 2, y: 1 }]);
    expect(r.celdas).toEqual([
      [0, 0, 0],
      [0, 0, 2],
      [0, 0, 0],
    ]);
    expect(r.eventos).toEqual([{ tipo: 'AdicionAplicada', x: 2, y: 1, cantidad: 2 }]);
  });

  it('el explosivo en el centro suma 5, con eventos por filas', () => {
    const r = aplicarAdiciones(crearRejilla(3), [{ tipo: 'explosivo', x: 1, y: 1 }]);
    expect(r.celdas).toEqual([
      [0, 1, 0],
      [1, 1, 1],
      [0, 1, 0],
    ]);
    expect(r.eventos.map((e) => [e.x, e.y, e.cantidad])).toEqual([
      [1, 0, 1],
      [0, 1, 1],
      [1, 1, 1],
      [2, 1, 1],
      [1, 2, 1],
    ]);
  });

  it.each<[string, number, number, number, number]>([
    ['centro', 3, 1, 1, 5],
    ['borde', 3, 1, 0, 4],
    ['esquina', 3, 2, 2, 3],
    ['lado 1', 1, 0, 0, 1],
  ])('el explosivo en %s suma lo que cae dentro', (_, lado, x, y, total) => {
    const r = aplicarAdiciones(crearRejilla(lado), [{ tipo: 'explosivo', x, y }]);
    expect(suma(r.celdas)).toBe(total);
    expect(r.eventos).toHaveLength(total);
  });

  it('varios granos en la misma celda dan un solo evento con el total', () => {
    const r = aplicarAdiciones(crearRejilla(3), [
      { tipo: 'normal', x: 0, y: 2 },
      { tipo: 'pesado', x: 0, y: 2 },
      { tipo: 'explosivo', x: 1, y: 2 },
    ]);
    expect(r.eventos).toEqual([
      { tipo: 'AdicionAplicada', x: 1, y: 1, cantidad: 1 },
      { tipo: 'AdicionAplicada', x: 0, y: 2, cantidad: 4 },
      { tipo: 'AdicionAplicada', x: 1, y: 2, cantidad: 1 },
      { tipo: 'AdicionAplicada', x: 2, y: 2, cantidad: 1 },
    ]);
  });

  it.each<[number, number]>([
    [-1, 0],
    [0, 3],
    [3, 3],
    [0.5, 1],
  ])('una colocación en (%s, %s) lanza RangeError', (x, y) => {
    expect(() => aplicarAdiciones(crearRejilla(3), [{ tipo: 'normal', x, y }])).toThrow(RangeError);
  });

  const arbTirada = fc.integer({ min: 1, max: 9 }).chain((lado) => {
    const coordenada = fc.integer({ min: 0, max: lado - 1 });
    return fc.record({
      celdas: fc.array(fc.array(fc.integer({ min: 0, max: 3 }), { minLength: lado, maxLength: lado }), {
        minLength: lado,
        maxLength: lado,
      }),
      colocaciones: fc.array(
        fc.record({ tipo: fc.constantFrom<TipoGrano>(...TIPOS_GRANO), x: coordenada, y: coordenada }),
        { maxLength: 6 },
      ),
    });
  });

  it('coincide con el oráculo independiente sumarAdiciones', () => {
    fc.assert(
      fc.property(arbTirada, ({ celdas, colocaciones }) => {
        expect(aplicarAdiciones(celdas, colocaciones).celdas).toEqual(sumarAdiciones(celdas, celdas.length, colocaciones));
      }),
      { numRuns: 500 },
    );
  });

  it('las cantidades de los eventos suman la diferencia de granos, por filas y sin repetir celda', () => {
    fc.assert(
      fc.property(arbTirada, ({ celdas, colocaciones }) => {
        const r = aplicarAdiciones(celdas, colocaciones);
        expect(r.eventos.reduce((t, e) => t + e.cantidad, 0)).toBe(suma(r.celdas) - suma(celdas));
        const orden = r.eventos.map((e) => e.y * celdas.length + e.x);
        expect(orden).toEqual([...new Set(orden)].sort((a, b) => a - b));
        expect(r.eventos.every((e) => e.cantidad > 0)).toBe(true);
      }),
    );
  });

  it('no muta la entrada', () => {
    fc.assert(
      fc.property(arbTirada, ({ celdas, colocaciones }) => {
        const copia = celdas.map((fila) => [...fila]);
        const copiaColocaciones = colocaciones.map((c) => ({ ...c }));
        aplicarAdiciones(congelar(celdas), congelar(colocaciones));
        expect(celdas).toEqual(copia);
        expect(colocaciones).toEqual(copiaColocaciones);
      }),
    );
  });
});

describe('DEFINICIONES_GRANOS', () => {
  it('define cada TipoGrano con su propio tipo', () => {
    expect(Object.keys(DEFINICIONES_GRANOS).sort()).toEqual([...TIPOS_GRANO].sort());
    for (const tipo of TIPOS_GRANO) expect(DEFINICIONES_GRANOS[tipo].tipo).toBe(tipo);
  });

  it('son solo datos: sobreviven intactos a una ida y vuelta por JSON', () => {
    expect(JSON.parse(JSON.stringify(DEFINICIONES_GRANOS))).toEqual(DEFINICIONES_GRANOS);
  });

  it('tienen los valores de la especificación', () => {
    expect(DEFINICIONES_GRANOS.normal.adiciones).toEqual([{ dx: 0, dy: 0, cantidad: 1 }]);
    expect(DEFINICIONES_GRANOS.pesado.adiciones).toEqual([{ dx: 0, dy: 0, cantidad: 2 }]);
    expect(DEFINICIONES_GRANOS.explosivo.adiciones).toEqual([
      { dx: 0, dy: 0, cantidad: 1 },
      { dx: 0, dy: -1, cantidad: 1 },
      { dx: 1, dy: 0, cantidad: 1 },
      { dx: 0, dy: 1, cantidad: 1 },
      { dx: -1, dy: 0, cantidad: 1 },
    ]);
  });
});
