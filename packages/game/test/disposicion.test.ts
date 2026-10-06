import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { botonConfirmarEn, botonDeshacerEn, celdaEn, disponer, disponerMano, fichaEn } from '../src/disposicion.ts';
import type { Disposicion, Rect } from '../src/disposicion.ts';
import { BANDAS_INICIALES, TEMA } from '../src/tema.ts';

/** Tolerancia de coma flotante, en píxeles. */
const EPS = 1e-6;

const LADOS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const VENTANAS: readonly (readonly [number, number])[] = [
  [1920, 1080],
  [800, 600],
  [400, 800],
  [300, 300],
  [120, 60],
];

const todas = (d: Disposicion): Rect[] => d.celdas.flat();

/** Comprueba todas las propiedades de una disposición. */
function comprobar(ancho: number, alto: number, lado: number): void {
  const d = disponer(ancho, alto, lado);
  const celdas = todas(d);
  const banda = d.bandaCentral;
  const margen = Math.min(banda.ancho, banda.alto) * TEMA.proporciones.margenTablero;

  // Una celda por posición, indexadas celdas[y][x].
  expect(d.celdas).toHaveLength(lado);
  for (const fila of d.celdas) expect(fila).toHaveLength(lado);

  // Cuadradas, iguales y de tamaño positivo.
  expect(d.celda).toBeGreaterThan(0);
  for (const c of celdas) {
    expect(c.ancho).toBe(d.celda);
    expect(c.alto).toBe(d.celda);
  }

  // Caben dentro de la banda central con su margen.
  for (const c of celdas) {
    expect(c.x).toBeGreaterThanOrEqual(banda.x + margen - EPS);
    expect(c.y).toBeGreaterThanOrEqual(banda.y + margen - EPS);
    expect(c.x + c.ancho).toBeLessThanOrEqual(banda.x + banda.ancho - margen + EPS);
    expect(c.y + c.alto).toBeLessThanOrEqual(banda.y + banda.alto - margen + EPS);
  }

  // No se solapan: dos celdas distintas están separadas al menos por el hueco en algún eje.
  expect(d.hueco).toBeGreaterThan(0);
  for (const [i, a] of celdas.entries()) {
    for (const b of celdas.slice(i + 1)) {
      const separacionX = Math.max(b.x - (a.x + a.ancho), a.x - (b.x + b.ancho));
      const separacionY = Math.max(b.y - (a.y + a.alto), a.y - (b.y + b.alto));
      expect(Math.max(separacionX, separacionY)).toBeGreaterThanOrEqual(d.hueco - EPS);
    }
  }

  // Centrado horizontalmente en la ventana.
  const izquierda = Math.min(...celdas.map((c) => c.x));
  const derecha = Math.max(...celdas.map((c) => c.x + c.ancho));
  expect(Math.abs(izquierda - (ancho - derecha))).toBeLessThan(EPS);

  // Determinista.
  expect(disponer(ancho, alto, lado)).toEqual(d);
}

describe('disposición', () => {
  it('reparte la ventana en bandas de 12 %, 63 % y 25 %', () => {
    expect(BANDAS_INICIALES).toEqual({ superior: 0.12, central: 0.63, inferior: 0.25 });
    const d = disponer(1000, 1000, 3);
    expect([d.bandaSuperior.alto, d.bandaCentral.alto, d.bandaInferior.alto].map((v) => Math.round(v))).toEqual([120, 630, 250]);
    expect(d.bandaCentral.y).toBe(d.bandaSuperior.alto);
    expect(d.bandaInferior.y + d.bandaInferior.alto).toBeCloseTo(1000, 9);
  });

  for (const [ancho, alto] of VENTANAS) {
    it(`ventana ${ancho}×${alto}: las celdas caben, son cuadradas, no se solapan y están centradas (lados 1 a 9)`, () => {
      for (const lado of LADOS) comprobar(ancho, alto, lado);
    });
  }

  it('propiedad: con ventanas de 100 a 4000 en cada eje, para cualquier lado de 1 a 9', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 4000 }), fc.integer({ min: 100, max: 4000 }), fc.integer({ min: 1, max: 9 }), (a, h, lado) => {
        comprobar(a, h, lado);
      }),
    );
  });

  it.each<[number, number]>([
    [0, 0],
    [0, 800],
    [800, 0],
    [-5, 300],
    [Number.NaN, 300],
  ])('ventana degenerada %d×%d: celdas de tamaño 0, sin NaN ni excepciones', (ancho, alto) => {
    for (const lado of LADOS) {
      const d = disponer(ancho, alto, lado);
      expect(d.celda).toBe(0);
      // JSON.stringify escribe NaN e infinito como null.
      expect(JSON.stringify(d)).not.toContain('null');
      for (const c of todas(d)) for (const v of [c.x, c.y, c.ancho, c.alto]) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('rechaza un lado que no sea un entero ≥ 1', () => {
    expect(() => disponer(800, 600, 0)).toThrow(RangeError);
    expect(() => disponer(800, 600, 2.5)).toThrow(RangeError);
  });
});

/** Comprueba la disposición de la mano para una ventana y un número de fichas. */
function comprobarMano(ancho: number, alto: number, n: number): void {
  const d = disponerMano({ ancho, alto }, n);
  const banda = disponer(ancho, alto, 1).bandaInferior;
  const boton = d.deshacer;
  expect(d.banda).toEqual(banda);
  expect(d.fichas).toHaveLength(n);

  // El botón, con tamaño positivo, dentro de la banda.
  expect(boton.ancho).toBeGreaterThan(0);
  expect(boton.alto).toBeGreaterThan(0);
  expect(boton.x).toBeGreaterThanOrEqual(banda.x - EPS);
  expect(boton.y).toBeGreaterThanOrEqual(banda.y - EPS);
  expect(boton.x + boton.ancho).toBeLessThanOrEqual(banda.x + banda.ancho + EPS);
  expect(boton.y + boton.alto).toBeLessThanOrEqual(banda.y + banda.alto + EPS);

  for (const f of d.fichas) {
    // Fichas iguales, de radio positivo, enteras dentro de la banda y a la izquierda del botón.
    expect(f.radio).toBeGreaterThan(0);
    expect(f.radio).toBe(d.fichas[0]?.radio);
    expect(f.x - f.radio).toBeGreaterThanOrEqual(banda.x - EPS);
    expect(f.y - f.radio).toBeGreaterThanOrEqual(banda.y - EPS);
    expect(f.y + f.radio).toBeLessThanOrEqual(banda.y + banda.alto + EPS);
    expect(f.x + f.radio).toBeLessThanOrEqual(boton.x + EPS);
    // La descripción va debajo de las fichas.
    expect(d.descripcion.y).toBeGreaterThanOrEqual(f.y + f.radio - EPS);
  }
  // Sin solaparse entre sí.
  for (const [i, a] of d.fichas.entries()) {
    for (const b of d.fichas.slice(i + 1)) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.radio + b.radio - EPS);
  }
  // Fila centrada en la banda.
  const primera = d.fichas[0];
  const ultima = d.fichas.at(-1);
  if (primera !== undefined && ultima !== undefined) {
    expect(Math.abs((primera.x - primera.radio + ultima.x + ultima.radio) / 2 - (banda.x + banda.ancho / 2))).toBeLessThan(EPS);
  }
  // Confirmar: dentro de la banda, encima de Deshacer sin solaparse, y a la derecha de las fichas.
  const c = d.confirmar;
  expect(c.ancho).toBeGreaterThan(0);
  expect(c.alto).toBeGreaterThan(0);
  expect(c.x).toBeGreaterThanOrEqual(banda.x - EPS);
  expect(c.y).toBeGreaterThanOrEqual(banda.y - EPS);
  expect(c.x + c.ancho).toBeLessThanOrEqual(banda.x + banda.ancho + EPS);
  expect(c.y + c.alto).toBeLessThanOrEqual(banda.y + banda.alto + EPS);
  expect(c.y + c.alto).toBeLessThan(boton.y + EPS);
  for (const f of d.fichas) expect(f.x + f.radio).toBeLessThanOrEqual(c.x + EPS);
  // La descripción, dentro de la banda y sin tocar los botones.
  expect(d.descripcion.y).toBeGreaterThanOrEqual(boton.y + boton.alto - EPS);
  expect(d.descripcion.y).toBeGreaterThanOrEqual(c.y + c.alto - EPS);
  expect(d.descripcion.y + d.descripcion.alto).toBeLessThanOrEqual(banda.y + banda.alto + EPS);
}

describe('disposición de la mano', () => {
  for (const [ancho, alto] of VENTANAS) {
    it(`ventana ${ancho}×${alto}: de 1 a 12 fichas caben en la banda inferior, centradas y sin solaparse`, () => {
      for (let n = 1; n <= 12; n++) comprobarMano(ancho, alto, n);
    });
  }

  it('propiedad: con ventanas de 100 a 4000 en cada eje y de 1 a 12 fichas', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 4000 }), fc.integer({ min: 100, max: 4000 }), fc.integer({ min: 1, max: 12 }), (a, h, n) => {
        comprobarMano(a, h, n);
      }),
    );
  });

  it.each<[number, number]>([
    [0, 0],
    [0, 800],
    [800, 0],
    [-5, 300],
    [Number.NaN, 300],
  ])('ventana degenerada %d×%d: tamaños 0, sin NaN ni excepciones', (ancho, alto) => {
    for (let n = 0; n <= 12; n++) {
      const d = disponerMano({ ancho, alto }, n);
      expect(JSON.stringify(d)).not.toContain('null');
      for (const f of d.fichas) expect(f.radio).toBe(0);
    }
  });

  it('sin fichas no hay fila, pero sí botón', () => {
    const d = disponerMano({ ancho: 800, alto: 600 }, 0);
    expect(d.fichas).toEqual([]);
    expect(d.deshacer.ancho).toBeGreaterThan(0);
  });
});

describe('selección por punto', () => {
  const centro = (r: Rect) => ({ x: r.x + r.ancho / 2, y: r.y + r.alto / 2 });

  it('celdaEn devuelve la celda de cada centro, para cada lado y varias ventanas', () => {
    for (const [ancho, alto] of VENTANAS) {
      for (const lado of LADOS) {
        const d = disponer(ancho, alto, lado);
        for (const [y, fila] of d.celdas.entries()) {
          for (const [x, r] of fila.entries()) expect(celdaEn(centro(r), d)).toEqual({ x, y });
        }
      }
    }
  });

  it('con una ventana asimétrica distingue x (columna) de y (fila)', () => {
    const d = disponer(1300, 700, 4);
    const r = d.celdas[0]?.[3];
    if (r === undefined) throw new Error('sin celda');
    // La celda de la columna 3 y la fila 0: un intercambio de ejes daría { x: 0, y: 3 }.
    expect(celdaEn({ x: r.x + 1, y: r.y + r.alto - 1 }, d)).toEqual({ x: 3, y: 0 });
    const s = d.celdas[2]?.[1];
    if (s === undefined) throw new Error('sin celda');
    expect(celdaEn(centro(s), d)).toEqual({ x: 1, y: 2 });
  });

  it('celdaEn devuelve null fuera del tablero y en los huecos entre celdas', () => {
    const d = disponer(800, 600, 3);
    const t = d.tablero;
    expect(celdaEn({ x: t.x - 1, y: t.y + 1 }, d)).toBeNull();
    expect(celdaEn({ x: t.x + 1, y: t.y - 1 }, d)).toBeNull();
    expect(celdaEn({ x: t.x + t.ancho, y: t.y + t.alto / 2 }, d)).toBeNull();
    expect(celdaEn({ x: t.x + t.ancho / 2, y: t.y + t.alto }, d)).toBeNull();
    expect(celdaEn({ x: 5, y: 5 }, d)).toBeNull();
    // Huecos: entre las columnas 0 y 1, y entre las filas 1 y 2.
    expect(celdaEn({ x: t.x + d.celda + d.hueco / 2, y: t.y + d.celda / 2 }, d)).toBeNull();
    expect(celdaEn({ x: t.x + d.celda / 2, y: t.y + 2 * d.celda + 1.5 * d.hueco }, d)).toBeNull();
  });

  it('celdaEn no encuentra nada con una ventana degenerada', () => {
    expect(celdaEn({ x: 0, y: 0 }, disponer(0, 0, 3))).toBeNull();
  });

  it('botonDeshacerEn acierta dentro del botón y falla fuera', () => {
    const d = disponerMano({ ancho: 800, alto: 600 }, 5);
    const b = d.deshacer;
    expect(botonDeshacerEn(centro(b), d)).toBe(true);
    expect(botonDeshacerEn({ x: b.x, y: b.y }, d)).toBe(true);
    expect(botonDeshacerEn({ x: b.x - 1, y: b.y + b.alto / 2 }, d)).toBe(false);
    expect(botonDeshacerEn({ x: b.x + b.ancho, y: b.y + b.alto / 2 }, d)).toBe(false);
    expect(botonDeshacerEn({ x: b.x + b.ancho / 2, y: b.y - 1 }, d)).toBe(false);
    expect(botonDeshacerEn({ x: b.x + b.ancho / 2, y: b.y + b.alto }, d)).toBe(false);
    const ficha = d.fichas[0];
    if (ficha === undefined) throw new Error('sin ficha');
    expect(botonDeshacerEn(ficha, d)).toBe(false);
  });
});

describe('fichaEn', () => {
  it('acierta en el centro de cada ficha, para 1 a 12 fichas y varias ventanas', () => {
    for (const [ancho, alto] of VENTANAS) {
      for (let n = 1; n <= 12; n++) {
        const d = disponerMano({ ancho, alto }, n);
        for (const [i, f] of d.fichas.entries()) expect(fichaEn({ x: f.x, y: f.y }, d)).toBe(i);
      }
    }
  });

  it('acierta cerca del borde de la ficha y falla justo fuera', () => {
    const d = disponerMano({ ancho: 1000, alto: 800 }, 5);
    const f = d.fichas[2];
    if (f === undefined) throw new Error('sin ficha');
    expect(fichaEn({ x: f.x + f.radio * 0.99, y: f.y }, d)).toBe(2);
    expect(fichaEn({ x: f.x, y: f.y - f.radio * 0.99 }, d)).toBe(2);
    expect(fichaEn({ x: f.x, y: f.y + f.radio * 1.01 }, d)).toBeNull();
    // La esquina del cuadrado que envuelve la ficha ya está fuera del círculo.
    expect(fichaEn({ x: f.x + f.radio * 0.9, y: f.y + f.radio * 0.9 }, d)).toBeNull();
  });

  it('devuelve null en los huecos entre fichas, fuera de la fila y en el botón', () => {
    const d = disponerMano({ ancho: 1000, alto: 800 }, 5);
    for (const [i, a] of d.fichas.entries()) {
      const b = d.fichas[i + 1];
      if (b !== undefined) expect(fichaEn({ x: (a.x + b.x) / 2, y: a.y }, d)).toBeNull();
    }
    expect(fichaEn({ x: 1, y: 1 }, d)).toBeNull();
    expect(fichaEn({ x: d.deshacer.x + d.deshacer.ancho / 2, y: d.deshacer.y + d.deshacer.alto / 2 }, d)).toBeNull();
  });

  it('con una ventana asimétrica distingue x de y', () => {
    // Las fichas quedan lejos de la diagonal x = y: un intercambio de coordenadas no encontraría ninguna.
    const d = disponerMano({ ancho: 2400, alto: 600 }, 4);
    for (const [i, f] of d.fichas.entries()) {
      expect(Math.abs(f.x - f.y)).toBeGreaterThan(2 * f.radio);
      expect(fichaEn({ x: f.x, y: f.y }, d)).toBe(i);
    }
  });

  it('con una ventana degenerada no encuentra ninguna ficha', () => {
    expect(fichaEn({ x: 0, y: 0 }, disponerMano({ ancho: 0, alto: 0 }, 5))).toBeNull();
  });
});

describe('botonConfirmarEn', () => {
  it('acierta dentro del botón y falla fuera, también en Deshacer', () => {
    const d = disponerMano({ ancho: 800, alto: 600 }, 5);
    const b = d.confirmar;
    expect(botonConfirmarEn({ x: b.x + b.ancho / 2, y: b.y + b.alto / 2 }, d)).toBe(true);
    expect(botonConfirmarEn({ x: b.x, y: b.y }, d)).toBe(true);
    expect(botonConfirmarEn({ x: b.x - 1, y: b.y + 1 }, d)).toBe(false);
    expect(botonConfirmarEn({ x: b.x + b.ancho, y: b.y + 1 }, d)).toBe(false);
    expect(botonConfirmarEn({ x: b.x + 1, y: b.y - 1 }, d)).toBe(false);
    expect(botonConfirmarEn({ x: b.x + 1, y: b.y + b.alto }, d)).toBe(false);
    const s = d.deshacer;
    expect(botonConfirmarEn({ x: s.x + s.ancho / 2, y: s.y + s.alto / 2 }, d)).toBe(false);
    expect(botonDeshacerEn({ x: b.x + b.ancho / 2, y: b.y + b.alto / 2 }, d)).toBe(false);
  });

  it('con una ventana asimétrica distingue x de y', () => {
    const d = disponerMano({ ancho: 2400, alto: 600 }, 4);
    const b = d.confirmar;
    const centro = { x: b.x + b.ancho / 2, y: b.y + b.alto / 2 };
    expect(botonConfirmarEn(centro, d)).toBe(true);
    // El punto con los ejes intercambiados queda fuera de la ventana y del botón.
    expect(botonConfirmarEn({ x: centro.y, y: centro.x }, d)).toBe(false);
  });
});
