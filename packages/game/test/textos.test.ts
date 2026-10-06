import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFINICIONES_GRANOS } from '@pila/core';
import { TEXTOS, describirDefinicion, describirGrano } from '../src/textos.ts';

describe('describirGrano', () => {
  it('describe los tres tipos del MVP a partir de DEFINICIONES_GRANOS', () => {
    expect(describirGrano('normal')).toBe('Normal: +1 en la celda');
    expect(describirGrano('pesado')).toBe('Pesado: +2 en la celda');
    expect(describirGrano('explosivo')).toBe('Explosivo: +1 en la celda y +1 en cada vecina');
  });

  it('se genera de los datos: si cambian las adiciones, cambia la frase', () => {
    const definiciones = { ...DEFINICIONES_GRANOS, normal: { tipo: 'normal', adiciones: [{ dx: 0, dy: 0, cantidad: 3 }] } };
    expect(describirGrano('normal', definiciones)).toBe('Normal: +3 en la celda');
  });

  it.each([
    [
      'cruz',
      [
        { dx: 0, dy: 0, cantidad: 2 },
        { dx: -1, dy: -1, cantidad: 1 },
        { dx: 1, dy: -1, cantidad: 1 },
        { dx: -1, dy: 1, cantidad: 1 },
        { dx: 1, dy: 1, cantidad: 1 },
      ],
      'Cruz: +2 en la celda y +1 en cada diagonal',
    ],
    [
      'cohete',
      [
        { dx: 0, dy: -1, cantidad: 1 },
        { dx: 0, dy: -1, cantidad: 1 },
      ],
      'Cohete: +2 arriba',
    ],
    [
      'gancho',
      [
        { dx: 0, dy: 0, cantidad: 1 },
        { dx: 1, dy: 0, cantidad: 1 },
        { dx: 0, dy: 1, cantidad: 2 },
      ],
      'Gancho: +1 en la celda, +1 a la derecha y +2 abajo',
    ],
    ['vacio', [], 'Vacio: sin efecto'],
    ['lejano', [{ dx: 2, dy: 0, cantidad: 1 }], 'Lejano: +1 grano en otra celda'],
    [
      'raro',
      [
        { dx: 0, dy: 0, cantidad: 1 },
        { dx: 3, dy: -2, cantidad: 2 },
      ],
      'Raro: +3 granos repartidos en 2 celdas',
    ],
  ])('una definición ficticia «%s» da una frase coherente o el respaldo genérico', (tipo, adiciones, frase) => {
    expect(describirDefinicion({ tipo, adiciones })).toBe(frase);
  });

  it('propiedad: con cualquier definición no lanza y empieza por el nombre del tipo', () => {
    const adicion = fc.record({
      dx: fc.integer({ min: -3, max: 3 }),
      dy: fc.integer({ min: -3, max: 3 }),
      cantidad: fc.integer({ min: -3, max: 5 }),
    });
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), fc.array(adicion, { maxLength: 10 }), (tipo, adiciones) => {
        const frase = describirDefinicion({ tipo, adiciones });
        expect(frase.startsWith(`${tipo.charAt(0).toUpperCase()}${tipo.slice(1)}: `)).toBe(true);
        expect(frase.length).toBeGreaterThan(tipo.length + 2);
      }),
    );
  });

  it('los textos fijos de la interfaz están en español', () => {
    expect(TEXTOS.deshacer).toBe('Deshacer');
    expect(TEXTOS.manoCompleta).toBe('Mano completa');
    expect(TEXTOS.informacion(42, 3)).toBe('semilla 42 · lado 3');
  });
});
