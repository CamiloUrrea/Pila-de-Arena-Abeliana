// Descripción pura de lo que se dibuja en cada celda, a partir de la matriz de celdas (no del estado entero), para
// poder reutilizarla con las rejillas intermedias de las animaciones.
import type { Estado } from '@pila/core';
import { TEMA } from './tema.ts';
import type { Tema } from './tema.ts';

/** Centro de un punto de grano, relativo al centro de la celda y en fracciones de su lado (entre −0,5 y 0,5). */
export type PuntoGrano = {
  readonly x: number;
  readonly y: number;
  /** Grano previsto por la vista previa, todavía no en la rejilla: se dibuja hueco, solo el contorno. */
  readonly fantasma: boolean;
};

export type CeldaDescrita = {
  /** Columna: la celda es `celdas[y][x]`. */
  readonly x: number;
  /** Fila. */
  readonly y: number;
  readonly carga: number;
  /** Granos que la vista previa sumaría a esta celda. */
  readonly previstos: number;
  /**
   * Un punto por grano, contando los previstos (`carga + previstos`): los primeros `carga` son sólidos y el resto
   * fantasma. Vacío con 0 granos y con demasiados para dibujarlos (ver `texto`).
   */
  readonly granos: readonly PuntoGrano[];
  /** Radio común de los puntos, en fracciones del lado de la celda. */
  readonly radioGrano: number;
  /** Número de respaldo con el total (`carga + previstos`): solo cuando no cabe en puntos. */
  readonly texto: string | undefined;
  readonly color: number;
  /**
   * Color de lo que se pinta sobre la celda y puede caer en la vacía: el contorno de los puntos fantasma y el número
   * de respaldo. Es `colores.grano`, salvo en la celda vacía, donde se usa `colores.fantasmaSobreVacia`.
   */
  readonly colorTinta: number;
  /** La celda tiene `umbral` granos o más y se derrumbará. */
  readonly inestable: boolean;
  /** La celda es estable ahora, pero los granos previstos la llevarían a `umbral` o más. */
  readonly inestablePrevista: boolean;
};

// Fila o columna exterior negativa (N) y positiva (P), en unidades del desplazamiento.
const N = -1;
const P = 1;
const CENTRO = [0, 0] as const;
const DIAGONAL = [[N, N], [P, P]] as const;
const ESQUINAS = [[N, N], [P, N], [N, P], [P, P]] as const;
const COLUMNAS = [[N, N], [N, 0], [N, P], [P, N], [P, 0], [P, P]] as const;
const ANILLO = [[N, N], [0, N], [P, N], [N, 0], [P, 0], [N, P], [0, P], [P, P]] as const;

/**
 * Disposición tipo dado para 0 a 9 granos, en unidades del desplazamiento del tema. El índice es la cantidad de
 * granos; una carga mayor no tiene disposición y se muestra con el número.
 */
export const PATRONES_GRANOS: readonly (readonly (readonly [number, number])[])[] = [
  [],
  [CENTRO],
  DIAGONAL,
  [...DIAGONAL, CENTRO],
  ESQUINAS,
  [...ESQUINAS, CENTRO],
  COLUMNAS,
  [...COLUMNAS, CENTRO],
  ANILLO,
  [...ANILLO, CENTRO],
];

/**
 * Describe cada celda de la rejilla, por filas (y, luego x). `previstas` son los granos que la vista previa sumaría
 * a cada celda, indexados `[y][x]` (ver `calcularPrevistas`); sin ella no hay nada previsto. No modifica la entrada.
 */
export function describirCeldas(
  celdas: Estado['celdas'],
  umbral: number,
  previstas?: Estado['celdas'],
  tema: Tema = TEMA,
): CeldaDescrita[] {
  const { carga: colores, inestable: colorInestable, grano, fantasmaSobreVacia } = tema.colores;
  const { desplazamiento, radio } = tema.granos;
  return celdas.flatMap((fila, y) =>
    fila.map((carga, x) => {
      const previstos = Math.max(0, previstas?.[y]?.[x] ?? 0);
      const total = carga + previstos;
      const inestable = carga >= umbral;
      const color = inestable ? colorInestable : (colores[Math.min(carga, colores.length - 1)] ?? colorInestable);
      const patron = PATRONES_GRANOS[total];
      const granos = (patron ?? []).map(([px, py], i) => ({
        x: px * desplazamiento,
        y: py * desplazamiento,
        fantasma: i >= carga,
      }));
      const texto = patron === undefined ? String(total) : undefined;
      return {
        x,
        y,
        carga,
        previstos,
        granos,
        radioGrano: radio,
        texto,
        color,
        colorTinta: carga === 0 ? fantasmaSobreVacia : grano,
        inestable,
        inestablePrevista: !inestable && total >= umbral,
      };
    }),
  );
}
