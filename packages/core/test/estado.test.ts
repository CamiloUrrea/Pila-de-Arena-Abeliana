import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CONFIG_INICIAL, validarEstado } from '../src/index.ts';
import type { Estado } from '../src/index.ts';
import { arbEstado, conMano, estadoDePrueba } from './ayudantes.ts';

/** Copia superficial con un campo sustituido por un valor fuera de su tipo. */
function conCampo(estado: Estado, campo: string, valor: unknown): Estado {
  const copia = { ...estado };
  Reflect.set(copia, campo, valor);
  return copia;
}

const base = estadoDePrueba();

/** Mano de cinco normales con los granos 0 y 2 colocados, primero el 2 y luego el 0. */
const colocada = conMano(
  base,
  [
    { tipo: 'normal', celda: { x: 0, y: 0 } },
    { tipo: 'normal', celda: null },
    { tipo: 'normal', celda: { x: 1, y: 1 } },
    { tipo: 'normal', celda: null },
    { tipo: 'normal', celda: null },
  ],
  [2, 0],
);

describe('validarEstado', () => {
  it('acepta estadoDePrueba', () => {
    expect(validarEstado(base)).toEqual({ ok: true, valor: base });
  });

  it.each<[string, Estado]>([
    ['ganada con puntos >= meta y tiradas restantes', estadoDePrueba({ fase: 'ganada', puntos: 1000, tiradasRestantes: 2 })],
    ['ganada en la última tirada', estadoDePrueba({ fase: 'ganada', puntos: 5000, tiradasRestantes: 0 })],
    ['perdida con puntos < meta y 0 tiradas', estadoDePrueba({ fase: 'perdida', puntos: 999, tiradasRestantes: 0 })],
    ['colocando con puntos < meta y 1 tirada', estadoDePrueba({ puntos: 999, tiradasRestantes: 1 })],
    ['granos colocados en cualquier orden', colocada],
  ])('acepta el estado coherente: %s', (_, estado) => {
    expect(validarEstado(estado)).toEqual({ ok: true, valor: estado });
  });

  it('acepta los estados generados', () => {
    fc.assert(fc.property(arbEstado, (estado) => validarEstado(estado).ok));
  });

  it.each<[string, Estado, string]>([
    ['config inválida', estadoDePrueba({ config: { ...CONFIG_INICIAL, umbral: 3 } }), 'config.umbral'],
    ['fase desconocida', conCampo(base, 'fase', 'pausada'), 'fase'],
    ['celda negativa', estadoDePrueba({ celdas: [[0, 0, 0], [0, -1, 0], [0, 0, 0]] }), 'celdas[1][1]'],
    ['celda no entera', estadoDePrueba({ celdas: [[0, 0, 0], [0, 0, 1.5], [0, 0, 0]] }), 'celdas[1][2]'],
    ['celda no segura', estadoDePrueba({ celdas: [[2 ** 53, 0, 0], [0, 0, 0], [0, 0, 0]] }), 'celdas[0][0]'],
    ['matriz con filas de menos', estadoDePrueba({ celdas: [[0, 0, 0], [0, 0, 0]] }), 'celdas'],
    ['matriz con una fila corta', estadoDePrueba({ celdas: [[0, 0, 0], [0, 0], [0, 0, 0]] }), 'celdas[1]'],
    ['tiradasRestantes negativo', estadoDePrueba({ tiradasRestantes: -1 }), 'tiradasRestantes'],
    ['puntos no entero', estadoDePrueba({ puntos: 0.5 }), 'puntos'],
    [
      'celda de mano fuera de la rejilla',
      estadoDePrueba({ mano: [...base.mano.slice(1), { tipo: 'normal', celda: { x: 3, y: 0 } }] }),
      'mano[4].celda',
    ],
    ['un grano de más en usados', estadoDePrueba({ usados: ['pesado'] }), 'mazo'],
    ['un grano de menos en el mazo', estadoDePrueba({ mazo: base.mazo.slice(1) }), 'mazo'],
    ['un tipo cambiado por otro', estadoDePrueba({ mazo: ['pesado', ...base.mazo.slice(1)] }), 'mazo'],
    ['un tipo desconocido', conCampo(base, 'usados', ['arcilla']), 'mazo'],
    ['un flujo todo ceros', estadoDePrueba({ rng: { siembra: [1, 2, 3, 4], mazo: [0, 0, 0, 0] } }), 'rng.mazo'],
    ['una palabra de 2^32', estadoDePrueba({ rng: { siembra: [2 ** 32, 2, 3, 4], mazo: [5, 6, 7, 8] } }), 'rng.siembra[0]'],
    ['una palabra negativa', estadoDePrueba({ rng: { siembra: [1, 2, -3, 4], mazo: [5, 6, 7, 8] } }), 'rng.siembra[2]'],
    ['una palabra no entera', estadoDePrueba({ rng: { siembra: [1, 2, 3, 4], mazo: [5, 6, 7, 8.5] } }), 'rng.mazo[3]'],
    ['un flujo de 3 palabras', conCampo(base, 'rng', { siembra: [1, 2, 3, 4], mazo: [5, 6, 7] }), 'rng.mazo'],
    ['un flujo de más', conCampo(base, 'rng', { ...base.rng, bonus: [1, 2, 3, 4] }), 'rng.bonus'],
    ['un flujo de menos', conCampo(base, 'rng', { siembra: [1, 2, 3, 4] }), 'rng.mazo'],
    ['ganada con puntos < meta', estadoDePrueba({ fase: 'ganada', puntos: 999 }), 'fase'],
    ['perdida con puntos >= meta', estadoDePrueba({ fase: 'perdida', puntos: 1000, tiradasRestantes: 0 }), 'fase'],
    ['perdida con tiradas restantes', estadoDePrueba({ fase: 'perdida', puntos: 0, tiradasRestantes: 1 }), 'fase'],
    ['colocando con puntos >= meta', estadoDePrueba({ puntos: 1000 }), 'fase'],
    ['colocando con 0 tiradas', estadoDePrueba({ tiradasRestantes: 0 }), 'fase'],
    ['ordenColocacion con repetidos', { ...colocada, ordenColocacion: [2, 0, 2] }, 'ordenColocacion[2]'],
    ['ordenColocacion con un índice fuera de la mano', { ...colocada, ordenColocacion: [2, 0, 5] }, 'ordenColocacion[2]'],
    ['ordenColocacion con un índice negativo', { ...colocada, ordenColocacion: [-1, 2, 0] }, 'ordenColocacion[0]'],
    ['ordenColocacion con un índice no entero', { ...colocada, ordenColocacion: [2, 0.5, 0] }, 'ordenColocacion[1]'],
    ['ordenColocacion con un grano sin celda', { ...colocada, ordenColocacion: [2, 0, 1] }, 'ordenColocacion[2]'],
    ['ordenColocacion que omite un grano colocado', { ...colocada, ordenColocacion: [2] }, 'ordenColocacion'],
  ])('rechaza %s', (_, estado, campo) => {
    const resultado = validarEstado(estado);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.campo).toBe(campo);
  });

  it('rechaza cualquier estado generado con la composición del mazo alterada', () => {
    fc.assert(
      fc.property(arbEstado, fc.constantFrom('normal', 'pesado', 'explosivo'), (estado, tipo) => {
        const alterado = { ...estado, usados: [...estado.usados, tipo] };
        expect(validarEstado(alterado).ok).toBe(false);
      }),
    );
  });
});
