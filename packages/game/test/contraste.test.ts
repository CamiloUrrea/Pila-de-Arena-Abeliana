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

describe('contraste de los puntos flotantes, la etiqueta y el ritmo (WCAG)', () => {
  const superficies: (number | undefined)[] = [colores.fondo, ...colores.carga, colores.inestable];

  it('el relleno de los puntos flotantes se lee sobre el fondo (al menos 4,5)', () => {
    expect(contraste(TEMA.animacion.popups.relleno, colores.fondo)).toBeGreaterThanOrEqual(4.5);
  });

  it('con su contorno, los puntos flotantes se leen sobre cada color de celda (peor caso al menos 3)', () => {
    const { relleno, contorno } = TEMA.animacion.popups;
    expect(superficies.every((s) => s !== undefined)).toBe(true);
    const peor = Math.min(...superficies.map((s) => Math.max(contraste(relleno, s ?? 0), contraste(contorno, s ?? 0))));
    expect(peor).toBeGreaterThanOrEqual(3);
  });

  it('la etiqueta de cadena, también su multiplicador resaltado, se lee sobre el fondo (al menos 7)', () => {
    const { color, resaltado } = TEMA.bandaSuperior.etiqueta;
    expect(contraste(color, colores.fondo)).toBeGreaterThanOrEqual(7);
    expect(contraste(resaltado, colores.fondo)).toBeGreaterThanOrEqual(7);
  });

  it('el texto del ritmo se lee sobre el fondo (al menos 4,5)', () => {
    expect(contraste(TEMA.bandaSuperior.ritmo.color, colores.fondo)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('contraste de los indicadores (WCAG)', () => {
  const { medidor, tiradas, mazo, cargada } = TEMA.indicadores;

  it.each(Object.entries(medidor.relleno))('el relleno %s del medidor contra la barra (al menos 3)', (_, color) => {
    expect(contraste(color, medidor.barra)).toBeGreaterThanOrEqual(3);
  });

  it('la barra del medidor se distingue del fondo (al menos 1,2)', () => {
    expect(contraste(medidor.barra, colores.fondo)).toBeGreaterThanOrEqual(1.2);
  });

  it('el texto del medidor y el del mazo contra el fondo (al menos 4,5)', () => {
    expect(contraste(medidor.texto, colores.fondo)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(mazo.texto, colores.fondo)).toBeGreaterThanOrEqual(4.5);
  });

  it('las fichas de tiradas, llenas y vacías, contra el fondo (al menos 3)', () => {
    expect(contraste(tiradas.llena, colores.fondo)).toBeGreaterThanOrEqual(3);
    expect(contraste(tiradas.vacia, colores.fondo)).toBeGreaterThanOrEqual(3);
  });

  it('el contorno de celda cargada contra la celda de carga 3 y contra el fondo (al menos 3)', () => {
    expect(contraste(cargada.color, colores.carga[3] ?? 0)).toBeGreaterThanOrEqual(3);
    expect(contraste(cargada.color, colores.fondo)).toBeGreaterThanOrEqual(3);
  });

  it('en el punto más tenue del pulso, el contorno sigue viéndose sobre el fondo, donde se dibuja (al menos 3)', () => {
    const mezcla = [16, 8, 0].reduce(
      (acc, s) => acc | (Math.round(((cargada.color >> s) & 0xff) * cargada.alfaMinima + ((colores.fondo >> s) & 0xff) * (1 - cargada.alfaMinima)) << s),
      0,
    );
    expect(contraste(mezcla, colores.fondo)).toBeGreaterThanOrEqual(3);
  });
});

describe('contraste del fin de ronda (WCAG)', () => {
  const { velo, titulo, texto } = TEMA.finDeRonda;
  const { activo } = TEMA.botonPrimario;
  /** El velo es semitransparente: se mide contra su mezcla sobre el fondo y sobre cada color de celda (peor caso). */
  const mezclar = (color: number, debajo: number, alfa: number): number =>
    [16, 8, 0].reduce((acc, s) => acc | (Math.round(((color >> s) & 0xff) * alfa + ((debajo >> s) & 0xff) * (1 - alfa)) << s), 0);
  const velos = [colores.fondo, ...colores.carga, colores.inestable].map((debajo) => mezclar(velo.color, debajo ?? 0, velo.opacidad));
  const peor = (color: number): number => Math.min(...velos.map((v) => contraste(color, v)));

  it('el título de ganada y el de perdida contra el velo (al menos 4,5)', () => {
    expect(peor(titulo.ganada)).toBeGreaterThanOrEqual(4.5);
    expect(peor(titulo.perdida)).toBeGreaterThanOrEqual(4.5);
  });

  it('el texto del resultado contra el velo (al menos 4,5)', () => {
    expect(peor(texto)).toBeGreaterThanOrEqual(4.5);
  });

  it('las estadísticas de la sesión y la pista de copiar contra el velo (al menos 4,5)', () => {
    expect(peor(TEMA.finDeRonda.secundario)).toBeGreaterThanOrEqual(4.5);
  });

  it('el botón «Otra ronda» sobre el velo (al menos 3) y su texto sobre el botón (al menos 4,5)', () => {
    expect(peor(activo.fondo)).toBeGreaterThanOrEqual(3);
    expect(contraste(activo.texto, activo.fondo)).toBeGreaterThanOrEqual(4.5);
  });
});
