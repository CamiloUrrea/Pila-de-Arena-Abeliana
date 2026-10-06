// Descripción pura de lo que se dibuja en cada celda, a partir de la matriz de celdas (no del estado entero), para
// poder reutilizarla con las rejillas intermedias de las animaciones.
import type { Estado } from '@pila/core';
import { TEMA } from './tema.ts';
import type { Tema } from './tema.ts';

export type CeldaDescrita = {
  /** Columna: la celda es `celdas[y][x]`. */
  readonly x: number;
  /** Fila. */
  readonly y: number;
  readonly carga: number;
  readonly texto: string;
  readonly color: number;
  /** La celda tiene `umbral` granos o más y se derrumbará. */
  readonly inestable: boolean;
};

/** Describe cada celda de la rejilla, por filas (y, luego x). No modifica `celdas`. */
export function describirCeldas(celdas: Estado['celdas'], umbral: number, tema: Tema = TEMA): CeldaDescrita[] {
  const { carga: colores, inestable: colorInestable } = tema.colores;
  return celdas.flatMap((fila, y) =>
    fila.map((carga, x) => {
      const inestable = carga >= umbral;
      const color = inestable ? colorInestable : (colores[Math.min(carga, colores.length - 1)] ?? colorInestable);
      return { x, y, carga, texto: String(carga), color, inestable };
    }),
  );
}
