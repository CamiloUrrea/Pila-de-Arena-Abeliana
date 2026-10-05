import type { Celdas } from './tipos.ts';

/** Crea una rejilla nueva de `lado × lado` con todas las celdas a `valor`. */
export function crearRejilla(lado: number, valor = 0): number[][] {
  return Array.from({ length: lado }, () => Array.from({ length: lado }, () => valor));
}

/** Valor de la celda `(x, y)`, o `undefined` si cae fuera de la matriz. */
export function leerCelda(celdas: Celdas, x: number, y: number): number | undefined {
  return celdas[y]?.[x];
}

/** Indica si `(x, y)` son coordenadas enteras dentro de una rejilla de lado `lado`. */
export function dentro(lado: number, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < lado && y < lado;
}
