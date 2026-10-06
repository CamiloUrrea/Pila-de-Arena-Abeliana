import { describe, expect, it } from 'vitest';
import { construirCascada } from '../src/cascada.ts';
import type { Cascada } from '../src/cascada.ts';
import { avanzar, crearReproductor } from '../src/reproductor.ts';
import { RITMOS, RITMO_POR_DEFECTO, formatearRitmo, siguienteRitmo } from '../src/ritmo.ts';
import { jugar } from './bot.ts';

describe('siguienteRitmo', () => {
  it('la lista permitida es la fijada y el ritmo por defecto es 1', () => {
    expect(RITMOS).toEqual([0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]);
    expect(RITMO_POR_DEFECTO).toBe(1);
  });

  it('recorre toda la lista hacia arriba y hacia abajo', () => {
    for (const [i, r] of RITMOS.entries()) {
      expect(siguienteRitmo(r, 1)).toBe(RITMOS[Math.min(i + 1, RITMOS.length - 1)]);
      expect(siguienteRitmo(r, -1)).toBe(RITMOS[Math.max(i - 1, 0)]);
    }
  });

  it('en los extremos se queda', () => {
    expect(siguienteRitmo(4, 1)).toBe(4);
    expect(siguienteRitmo(0.25, -1)).toBe(0.25);
  });

  it.each<[number, number, number]>([
    [1.2, 1.5, 0.75],
    [1.3, 2, 1],
    [10, 4, 3],
    [0.1, 0.5, 0.25],
    [-3, 0.5, 0.25],
    [Number.NaN, 1.5, 0.75],
  ])('desde %d, que no está en la lista, parte del más cercano: +1 → %d y −1 → %d', (actual, arriba, abajo) => {
    expect(siguienteRitmo(actual, 1)).toBe(arriba);
    expect(siguienteRitmo(actual, -1)).toBe(abajo);
  });
});

describe('formatearRitmo', () => {
  it.each<[number, string]>([
    [1, '×1'],
    [0.5, '×0,5'],
    [0.25, '×0,25'],
    [0.75, '×0,75'],
    [1.5, '×1,5'],
    [2, '×2'],
    [4, '×4'],
  ])('%d → %s', (r, texto) => {
    expect(formatearRitmo(r)).toBe(texto);
  });
});

describe('el reproductor con ritmo', () => {
  const cascada = ((): Cascada => {
    for (const t of jugar(3, 2026, 1)) {
      const { lado, umbral, multiplicadorPorOleada } = t.antes.config;
      const r = construirCascada(t.antes.celdas, t.eventos, lado, umbral, multiplicadorPorOleada);
      if (r.ok && r.valor.duracionTotal > 1000) return r.valor;
    }
    throw new Error('sin cascada larga');
  })();

  it('con ritmo 2 avanza el doble que con 1, y con 0,5 la mitad', () => {
    const rep = crearReproductor(cascada);
    const normal = avanzar(rep, 100, 1).tMs;
    expect(normal).toBe(100);
    expect(avanzar(rep, 100, 2).tMs).toBe(2 * normal);
    expect(avanzar(rep, 100, 0.5).tMs).toBe(normal / 2);
    expect(avanzar(rep, 100, 4).tMs).toBe(400);
  });

  it.each([-1, Number.NaN, 0, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('con un ritmo %d no avanza', (ritmo) => {
    const rep = crearReproductor(cascada);
    expect(avanzar(rep, 100, ritmo)).toBe(rep);
  });
});
