// Calidad automática de la paleta: estas pruebas existen para que el arte definitivo no pueda dejar una paleta ilegible
// sin que salte un fallo. Usan la razón de contraste de WCAG 2 (luminancia relativa).
import { describe, expect, it } from 'vitest';
import { TEMA } from '../src/tema.ts';

/** Luminancia relativa de WCAG de un color 0xRRGGBB. */
function luminancia(color: number): number {
  const canal = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal((color >> 16) & 0xff) + 0.7152 * canal((color >> 8) & 0xff) + 0.0722 * canal(color & 0xff);
}

/** Razón de contraste de WCAG, entre 1 y 21, independiente del orden. */
function contraste(a: number, b: number): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].toSorted((x, y) => y - x);
  return ((claro ?? 0) + 0.05) / ((oscuro ?? 0) + 0.05);
}

const { colores } = TEMA;
const celdasConColor: [string, number | undefined][] = [
  ['carga 1', colores.carga[1]],
  ['carga 2', colores.carga[2]],
  ['carga 3', colores.carga[3]],
  ['inestable', colores.inestable],
];

describe('contraste de la paleta (WCAG)', () => {
  it('la fórmula da los valores de referencia: negro contra blanco es 21 y un color contra sí mismo es 1', () => {
    expect(contraste(0x000000, 0xffffff)).toBeCloseTo(21, 5);
    expect(contraste(0xff2e93, 0xff2e93)).toBe(1);
  });

  it.each(celdasConColor)('los puntos se leen sobre la celda de %s (al menos 4,5)', (_, celda) => {
    expect(celda).toBeDefined();
    expect(contraste(colores.grano, celda ?? colores.grano)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(celdasConColor)('la celda de %s destaca sobre el fondo (al menos 3)', (_, celda) => {
    expect(celda).toBeDefined();
    expect(contraste(celda ?? colores.fondo, colores.fondo)).toBeGreaterThanOrEqual(3);
  });

  it('la celda vacía se distingue del fondo (al menos 1,2)', () => {
    const vacia = colores.carga[0];
    expect(vacia).toBeDefined();
    expect(contraste(vacia ?? colores.fondo, colores.fondo)).toBeGreaterThanOrEqual(1.2);
  });

  it('el texto de la banda superior se lee sobre el fondo (al menos 7)', () => {
    expect(contraste(colores.texto, colores.fondo)).toBeGreaterThanOrEqual(7);
  });
});
