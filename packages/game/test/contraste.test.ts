// Calidad automática de la paleta: estas pruebas existen para que el arte definitivo no pueda dejar una paleta ilegible
// sin que salte un fallo. Usan la razón de contraste de WCAG 2 (luminancia relativa).
import { describe, expect, it } from 'vitest';
import { TEMA } from '../src/tema.ts';
import { describirCeldas } from '../src/vista.ts';

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

describe('contraste de la vista previa y de la mano (WCAG)', () => {
  // Superficies sobre las que puede caer el contorno de una celda inestable prevista: el fondo y las celdas estables.
  const superficies: [string, number | undefined][] = [
    ['el fondo', colores.fondo],
    ['la celda vacía', colores.carga[0]],
    ['la carga 1', colores.carga[1]],
    ['la carga 2', colores.carga[2]],
    ['la carga 3', colores.carga[3]],
  ];

  it.each(superficies)('el doble contorno de una inestable prevista se distingue sobre %s (al menos 3)', (_, superficie) => {
    // Con dos trazos, uno claro y otro oscuro, basta con que uno de los dos contraste.
    expect(superficie).toBeDefined();
    const { exterior, interior } = TEMA.contornoPrevisto;
    const s = superficie ?? colores.fondo;
    expect(Math.max(contraste(exterior, s), contraste(interior, s))).toBeGreaterThanOrEqual(3);
  });

  it.each([0, 1, 2, 3, 4, 5])('los puntos fantasma se distinguen sobre una celda con carga %i (al menos 3)', (carga) => {
    // Un fantasma siempre se dibuja sobre una celda, nunca sobre el fondo: se mide contra el color de esa celda.
    const [c] = describirCeldas([[carga]], 4, [[1]]);
    if (c === undefined) throw new Error('sin descripción');
    expect(contraste(c.colorTinta, c.color)).toBeGreaterThanOrEqual(3);
  });

  it.each(Object.entries(TEMA.fichas.tipos))('la ficha %s se distingue sobre el fondo (al menos 3)', (_, aspecto) => {
    expect(contraste(aspecto.color, colores.fondo)).toBeGreaterThanOrEqual(3);
  });

  it('el botón Deshacer activo destaca sobre el fondo (al menos 3) y su texto se lee (al menos 4,5)', () => {
    const { activo } = TEMA.boton;
    expect(contraste(activo.fondo, colores.fondo)).toBeGreaterThanOrEqual(3);
    expect(contraste(activo.texto, activo.fondo)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('contraste de la candidata y del mensaje de error (WCAG)', () => {
  /** Mezcla `color` con opacidad `alfa` sobre `fondo`, canal a canal en sRGB, como compone el lienzo. */
  const mezclar = (color: number, fondo: number, alfa: number): number =>
    [16, 8, 0].reduce((acc, s) => acc | (Math.round(((color >> s) & 0xff) * alfa + ((fondo >> s) & 0xff) * (1 - alfa)) << s), 0);

  it.each([0, 1, 2, 3, 4, 5])('los fantasmas de la candidata, tenues, se distinguen sobre una celda con carga %i (al menos 3)', (carga) => {
    const [c] = describirCeldas([[carga]], 4, [[1]], [[1]]);
    if (c === undefined) throw new Error('sin descripción');
    const { alfa } = TEMA.granos.candidata;
    expect(alfa).toBeLessThan(1);
    expect(contraste(mezclar(c.colorTinta, c.color, alfa), c.color)).toBeGreaterThanOrEqual(3);
  });

  it('los fantasmas de la candidata son más tenues que los de las colocaciones hechas', () => {
    expect(TEMA.granos.candidata.grosor).toBeLessThan(TEMA.granos.grosorFantasma);
  });

  it('el mensaje de error se lee sobre el fondo (al menos 4,5)', () => {
    expect(contraste(colores.error, colores.fondo)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('contraste de la animación y del botón Confirmar (WCAG)', () => {
  const superficies: [string, number | undefined][] = [
    ['el fondo', colores.fondo],
    ['la celda vacía', colores.carga[0]],
    ['la carga 1', colores.carga[1]],
    ['la carga 2', colores.carga[2]],
    ['la carga 3', colores.carga[3]],
    ['la celda inestable', colores.inestable],
  ];

  it('los granos en vuelo, relleno claro con contorno oscuro, se ven sobre el fondo y sobre cada celda (peor caso al menos 3)', () => {
    const { relleno, contorno } = TEMA.animacion.granoVuelo;
    // Basta con que el relleno o el contorno contraste con la superficie; se mide el peor caso de todas.
    const peor = Math.min(
      ...superficies.map(([, s]) => {
        const sup = s ?? colores.fondo;
        return Math.max(contraste(relleno, sup), contraste(contorno, sup));
      }),
    );
    expect(superficies.every(([, s]) => s !== undefined)).toBe(true);
    expect(peor).toBeGreaterThanOrEqual(3);
  });

  it('el botón Confirmar activo destaca sobre el fondo y su texto se lee (al menos 4,5)', () => {
    const { activo } = TEMA.botonPrimario;
    expect(contraste(activo.fondo, colores.fondo)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(activo.texto, activo.fondo)).toBeGreaterThanOrEqual(4.5);
  });
});
