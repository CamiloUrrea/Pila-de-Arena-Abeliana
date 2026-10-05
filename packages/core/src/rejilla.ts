import type { Direccion } from './eventos.ts';
import type { Celdas } from './tipos.ts';

/** Direcciones de reparto en el orden de la especificación, con su desplazamiento (y crece hacia abajo). */
export const DIRECCIONES: readonly { readonly direccion: Direccion; readonly dx: number; readonly dy: number }[] = [
  { direccion: 'arriba', dx: 0, dy: -1 },
  { direccion: 'derecha', dx: 1, dy: 0 },
  { direccion: 'abajo', dx: 0, dy: 1 },
  { direccion: 'izquierda', dx: -1, dy: 0 },
];

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
