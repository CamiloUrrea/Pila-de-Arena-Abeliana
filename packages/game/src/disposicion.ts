// Geometría pura de la pantalla: dado el tamaño de la ventana y el lado, dónde va cada banda y cada celda.
import { TEMA } from './tema.ts';
import type { Tema } from './tema.ts';

export type Rect = { readonly x: number; readonly y: number; readonly ancho: number; readonly alto: number };

export type Disposicion = {
  readonly bandaSuperior: Rect;
  readonly bandaCentral: Rect;
  readonly bandaInferior: Rect;
  /** Rectángulo que ocupan todas las celdas, centrado en la banda central. */
  readonly tablero: Rect;
  /** Lado de cada celda (todas son cuadradas e iguales). */
  readonly celda: number;
  readonly hueco: number;
  /** Rectángulo de cada celda, indexado `celdas[y][x]` como la rejilla del núcleo. */
  readonly celdas: readonly (readonly Rect[])[];
};

/** Tamaño de ventana utilizable: negativo, NaN o infinito cuentan como 0. */
const medida = (valor: number): number => (Number.isFinite(valor) && valor > 0 ? valor : 0);

/**
 * Calcula la disposición para una ventana de `ancho × alto` píxeles lógicos y una rejilla de `lado × lado`.
 * El tablero es el mayor cuadrado que cabe en la banda central menos su margen, de modo que cabe siempre, sea la
 * ventana ancha, estrecha o muy pequeña. Una ventana degenerada da celdas de tamaño 0, nunca NaN.
 *
 * @throws RangeError si `lado` no es un entero mayor o igual que 1.
 */
export function disponer(ancho: number, alto: number, lado: number, tema: Tema = TEMA): Disposicion {
  if (!Number.isInteger(lado) || lado < 1) throw new RangeError(`lado debe ser un entero ≥ 1: ${lado}`);
  const w = medida(ancho);
  const h = medida(alto);
  const { bandas, proporciones } = tema;

  const altoSuperior = h * bandas.superior;
  const altoCentral = h * bandas.central;
  const bandaSuperior: Rect = { x: 0, y: 0, ancho: w, alto: altoSuperior };
  const bandaCentral: Rect = { x: 0, y: altoSuperior, ancho: w, alto: altoCentral };
  const bandaInferior: Rect = { x: 0, y: altoSuperior + altoCentral, ancho: w, alto: h - altoSuperior - altoCentral };

  const margen = Math.min(bandaCentral.ancho, bandaCentral.alto) * proporciones.margenTablero;
  const disponible = Math.min(bandaCentral.ancho - 2 * margen, bandaCentral.alto - 2 * margen);
  // lado · celda + (lado − 1) · hueco = disponible, con hueco = huecoCelda · celda.
  const celda = Math.max(0, disponible) / (lado + (lado - 1) * proporciones.huecoCelda);
  const hueco = celda * proporciones.huecoCelda;
  const tamano = lado * celda + (lado - 1) * hueco;
  const tablero: Rect = {
    x: bandaCentral.x + (bandaCentral.ancho - tamano) / 2,
    y: bandaCentral.y + (bandaCentral.alto - tamano) / 2,
    ancho: tamano,
    alto: tamano,
  };

  const celdas = Array.from({ length: lado }, (_, y) =>
    Array.from({ length: lado }, (_, x) => ({
      x: tablero.x + x * (celda + hueco),
      y: tablero.y + y * (celda + hueco),
      ancho: celda,
      alto: celda,
    })),
  );
  return { bandaSuperior, bandaCentral, bandaInferior, tablero, celda, hueco, celdas };
}
