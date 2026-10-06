import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { construirCascada, muestrear } from '../src/cascada.ts';
import type { Cascada } from '../src/cascada.ts';
import { avanzar, crearReproductor, cuadroActual, saltar, terminado } from '../src/reproductor.ts';
import { jugar } from './bot.ts';

/** Una cascada real con oleadas, de una partida del bot. */
function cascadaReal(): Cascada {
  for (const t of jugar(3, 2026, 1)) {
    const { lado, umbral, multiplicadorPorOleada } = t.antes.config;
    const r = construirCascada(t.antes.celdas, t.eventos, lado, umbral, multiplicadorPorOleada);
    if (r.ok && r.valor.pasos.some((p) => p.tipo === 'derrumbe')) return r.valor;
  }
  throw new Error('sin cascada con derrumbes');
}

const congelar = <T>(valor: T): T => {
  if (typeof valor === 'object' && valor !== null) {
    for (const v of Object.values(valor)) congelar(v);
    Object.freeze(valor);
  }
  return valor;
};

describe('reproductor', () => {
  const cascada = congelar(cascadaReal());

  it('empieza en 0, sin terminar, con el cuadro inicial', () => {
    const rep = crearReproductor(cascada);
    expect(rep.tMs).toBe(0);
    expect(terminado(rep)).toBe(false);
    expect(cuadroActual(rep)).toEqual(muestrear(cascada, 0));
  });

  it('avanzar acumula tiempo y termina al llegar a la duración total', () => {
    let rep = crearReproductor(cascada);
    rep = avanzar(rep, 100);
    rep = avanzar(rep, 50);
    expect(rep.tMs).toBe(150);
    expect(cuadroActual(rep)).toEqual(muestrear(cascada, 150));
    rep = avanzar(rep, cascada.duracionTotal);
    expect(rep.tMs).toBe(cascada.duracionTotal);
    expect(terminado(rep)).toBe(true);
    expect(cuadroActual(rep).celdas).toEqual(cascada.celdasFinales);
  });

  it('saltar lo lleva al final y queda terminado', () => {
    const rep = saltar(avanzar(crearReproductor(cascada), 10));
    expect(terminado(rep)).toBe(true);
    expect(rep.tMs).toBe(cascada.duracionTotal);
    expect(cuadroActual(rep).terminado).toBe(true);
    expect(cuadroActual(rep).celdas).toEqual(cascada.celdasFinales);
  });

  it('avanzar después de terminar no cambia nada', () => {
    const fin = saltar(crearReproductor(cascada));
    expect(avanzar(fin, 500)).toBe(fin);
    expect(avanzar(fin, 500, 3)).toBe(fin);
  });

  it.each([-5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0])('un dtMs de %d cuenta como 0', (dt) => {
    const rep = avanzar(crearReproductor(cascada), 40);
    const despues = avanzar(rep, dt);
    expect(despues.tMs).toBe(40);
    expect(terminado(despues)).toBe(false);
  });

  it('el ritmo multiplica el tiempo y un ritmo inválido cuenta como 0', () => {
    const rep = crearReproductor(cascada);
    expect(avanzar(rep, 10, 2).tMs).toBe(20);
    expect(avanzar(rep, 10).tMs).toBe(10);
    expect(avanzar(rep, 10, Number.NaN).tMs).toBe(0);
    expect(avanzar(rep, 10, -1).tMs).toBe(0);
  });

  it('una cascada sin pasos ya está terminada', () => {
    const vacia: Cascada = {
      pasos: [],
      duracionTotal: 0,
      celdasAntes: [[1]],
      celdasFinales: [[1]],
      multiplicadorPorOleada: 50,
      puntosGanados: 0,
    };
    expect(terminado(crearReproductor(vacia))).toBe(true);
  });

  it('propiedad: es inmutable y avanzar a trozos equivale a avanzar de una vez', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 400 }), { maxLength: 20 }), (pasos) => {
        const inicial = congelar(crearReproductor(cascada));
        let rep = inicial;
        for (const dt of pasos) rep = congelar(avanzar(rep, dt));
        expect(inicial.tMs).toBe(0);
        const total = pasos.reduce((a, b) => a + b, 0);
        expect(rep.tMs).toBe(Math.min(total, cascada.duracionTotal));
        expect(terminado(rep)).toBe(total >= cascada.duracionTotal);
      }),
    );
  });
});
