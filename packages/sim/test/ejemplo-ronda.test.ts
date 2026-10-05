import { describe, expect, it } from 'vitest';
import { CONFIG_INICIAL, validarEstado } from '@pila/core';
import { jugarRonda, resumir } from '../src/index.ts';

describe('jugarRonda', () => {
  it('termina en una fase terminal y es reproducible para las semillas 1 a 200 con CONFIG_INICIAL', () => {
    for (let semilla = 1; semilla <= 200; semilla++) {
      const ronda = jugarRonda(semilla, CONFIG_INICIAL);
      expect(['ganada', 'perdida'], `semilla ${semilla}`).toContain(ronda.estado.fase);
      expect(ronda.reproducible, `semilla ${semilla}`).toBe(true);
      expect(validarEstado(ronda.estado).ok, `semilla ${semilla}`).toBe(true);
    }
  });

  it('dos llamadas con la misma semilla dan acciones, estado y eventos idénticos', () => {
    const a = jugarRonda(12345);
    const b = jugarRonda(12345);
    expect(b.acciones).toEqual(a.acciones);
    expect(b.estado).toEqual(a.estado);
    expect(b.eventos).toEqual(a.eventos);
  });

  it('el resumen termina indicando la reproducibilidad', () => {
    expect(resumir(jugarRonda(7)).split('\n').at(-1)).toBe('reproducible: sí');
  });
});
