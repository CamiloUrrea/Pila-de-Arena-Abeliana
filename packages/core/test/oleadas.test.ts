import { describe, expect, it } from 'vitest';
import { resolverOleadas } from '../src/index.ts';
import type { Celdas, Evento, ParametrosOleadas, ResultadoOleadas } from '../src/index.ts';
import { congelar } from './ayudantes.ts';

const BASE: ParametrosOleadas = { lado: 3, umbral: 4, multiplicadorPorOleada: 10, topeOleadas: 1000 };

const suma = (celdas: Celdas): number => celdas.flat().reduce((a, b) => a + b, 0);

/** Resuelve, exige éxito y comprueba la coherencia entre eventos, totales y granos. */
function resolverBien(celdas: Celdas, parametros: Partial<ParametrosOleadas> = {}): ResultadoOleadas {
  const resultado = resolverOleadas(celdas, { ...BASE, lado: celdas.length, ...parametros });
  if (!resultado.ok) throw new Error(`se esperaba éxito: ${JSON.stringify(resultado.error)}`);
  const r = resultado.valor;
  const fuera = r.eventos.flatMap((e) => (e.tipo === 'GranoFuera' ? [e] : []));
  expect(fuera.reduce((total, e) => total + e.puntos, 0)).toBe(r.puntos);
  expect(fuera).toHaveLength(r.granosFuera);
  expect(r.eventos.filter((e) => e.tipo === 'Derrumbe')).toHaveLength(r.derrumbes);
  expect(suma(r.derrumbesPorCelda)).toBe(r.derrumbes);
  expect(suma(celdas)).toBe(suma(r.celdas) + r.granosFuera);
  expect(r.celdas.flat().every((v) => v >= 0 && v < 4)).toBe(true);
  return r;
}

const terminadas = (eventos: readonly Evento[]) =>
  eventos.flatMap((e) =>
    e.tipo === 'OleadaTerminada'
      ? [{ k: e.k, derrumbes: e.derrumbes, granosFuera: e.granosFuera, puntosGanados: e.puntosGanados }]
      : [],
  );

const EJEMPLO_B: Celdas = [
  [3, 3, 3],
  [3, 4, 3],
  [3, 3, 3],
];

describe('resolverOleadas', () => {
  it('ejemplo de oro A: derrumbe en una esquina', () => {
    const r = resolverBien([
      [4, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
    expect(r.celdas).toEqual([
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, 0],
    ]);
    expect([r.oleadas, r.derrumbes, r.granosFuera, r.puntos]).toEqual([1, 1, 2, 200]);
    expect(r.eventos).toEqual([
      { tipo: 'OleadaIniciada', k: 1, celdas: [{ x: 0, y: 0 }] },
      { tipo: 'Derrumbe', k: 1, x: 0, y: 0 },
      { tipo: 'GranoFuera', k: 1, x: 0, y: 0, direccion: 'arriba', puntos: 100 },
      { tipo: 'GranoFuera', k: 1, x: 0, y: 0, direccion: 'izquierda', puntos: 100 },
      { tipo: 'OleadaTerminada', k: 1, derrumbes: 1, granosFuera: 2, puntosGanados: 200 },
    ]);
  });

  it('ejemplo de oro B: cascada completa', () => {
    const r = resolverBien(EJEMPLO_B);
    expect(r.celdas).toEqual([
      [1, 3, 1],
      [3, 0, 3],
      [1, 3, 1],
    ]);
    expect([r.oleadas, r.derrumbes, r.granosFuera, r.puntos]).toEqual([3, 10, 12, 1400]);
    expect(r.derrumbesPorCelda).toEqual([
      [1, 1, 1],
      [1, 2, 1],
      [1, 1, 1],
    ]);
    expect(terminadas(r.eventos)).toEqual([
      { k: 1, derrumbes: 1, granosFuera: 0, puntosGanados: 0 },
      { k: 2, derrumbes: 4, granosFuera: 4, puntosGanados: 440 },
      { k: 3, derrumbes: 5, granosFuera: 8, puntosGanados: 960 },
    ]);
    const iniciadas = r.eventos.flatMap((e) => (e.tipo === 'OleadaIniciada' ? [e.celdas] : []));
    expect(iniciadas).toEqual([
      [{ x: 1, y: 1 }],
      [
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: 2, y: 1 },
        { x: 1, y: 2 },
      ],
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 2 },
        { x: 2, y: 2 },
      ],
    ]);
    const oleada2 = r.eventos.filter((e) => (e.tipo === 'Derrumbe' || e.tipo === 'GranoFuera') && e.k === 2);
    expect(oleada2).toEqual([
      { tipo: 'Derrumbe', k: 2, x: 1, y: 0 },
      { tipo: 'GranoFuera', k: 2, x: 1, y: 0, direccion: 'arriba', puntos: 110 },
      { tipo: 'Derrumbe', k: 2, x: 0, y: 1 },
      { tipo: 'GranoFuera', k: 2, x: 0, y: 1, direccion: 'izquierda', puntos: 110 },
      { tipo: 'Derrumbe', k: 2, x: 2, y: 1 },
      { tipo: 'GranoFuera', k: 2, x: 2, y: 1, direccion: 'derecha', puntos: 110 },
      { tipo: 'Derrumbe', k: 2, x: 1, y: 2 },
      { tipo: 'GranoFuera', k: 2, x: 1, y: 2, direccion: 'abajo', puntos: 110 },
    ]);
  });

  it('una celda con 8 granos se derrumba una vez por oleada', () => {
    const r = resolverBien([[8]]);
    expect([r.oleadas, r.derrumbes, r.granosFuera, r.puntos]).toEqual([2, 2, 8, 840]);
    expect(r.celdas).toEqual([[0]]);
  });

  it('una celda con 7 granos se derrumba una vez', () => {
    const r = resolverBien([[7]]);
    expect([r.oleadas, r.derrumbes, r.granosFuera, r.puntos]).toEqual([1, 1, 4, 400]);
    expect(r.celdas).toEqual([[3]]);
  });

  it('aplica 100 + multiplicadorPorOleada × (k − 1) con otro multiplicador', () => {
    const r = resolverBien([[12]], { multiplicadorPorOleada: 15 });
    expect([r.oleadas, r.derrumbes, r.granosFuera, r.puntos]).toEqual([3, 3, 12, 1380]);
    expect(terminadas(r.eventos).map((t) => t.puntosGanados)).toEqual([400, 460, 520]);
  });

  it('una rejilla estable no cambia ni emite eventos', () => {
    const estable: Celdas = [
      [0, 1, 2],
      [3, 0, 1],
      [2, 3, 3],
    ];
    const r = resolverBien(estable);
    expect(r.celdas).toEqual(estable);
    expect(r.eventos).toEqual([]);
    expect([r.oleadas, r.derrumbes, r.granosFuera, r.puntos]).toEqual([0, 0, 0, 0]);
    expect(r.derrumbesPorCelda).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
  });

  it('con topeOleadas 2 el ejemplo B no termina; con 3 sí', () => {
    expect(resolverOleadas(EJEMPLO_B, { ...BASE, topeOleadas: 2 })).toEqual({
      ok: false,
      error: { tipo: 'ResolucionNoTermino', topeOleadas: 2 },
    });
    expect(resolverBien(EJEMPLO_B, { topeOleadas: 3 }).oleadas).toBe(3);
  });

  it('no muta la entrada', () => {
    const entrada = congelar([
      [3, 3, 3],
      [3, 4, 3],
      [3, 3, 3],
    ]);
    const r = resolverBien(entrada);
    expect(entrada).toEqual(EJEMPLO_B);
    expect(r.celdas).not.toBe(entrada);
  });
});
