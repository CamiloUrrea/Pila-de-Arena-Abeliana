// Geometría pura de la pantalla: dado el tamaño de la ventana y el lado, dónde va cada banda y cada celda.
import { TEMA } from './tema.ts';
import type { Tema } from './tema.ts';

export type Rect = { readonly x: number; readonly y: number; readonly ancho: number; readonly alto: number };

/** Tamaño de la ventana en píxeles lógicos. */
export type Ventana = { readonly ancho: number; readonly alto: number };

export type Punto = { readonly x: number; readonly y: number };

/** Hueco circular de una ficha de la mano: centro y radio. */
export type Ficha = { readonly x: number; readonly y: number; readonly radio: number };

export type DisposicionMano = {
  readonly banda: Rect;
  /** Una ficha por grano de la mano, en orden, en una fila centrada en la banda. */
  readonly fichas: readonly Ficha[];
  /** Línea de texto bajo las fichas (la descripción del grano seleccionado). */
  readonly descripcion: Rect;
  readonly deshacer: Rect;
};

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

type Bandas = Pick<Disposicion, 'bandaSuperior' | 'bandaCentral' | 'bandaInferior'>;

/** Reparte la ventana en las tres bandas horizontales del tema. */
function repartirBandas(ancho: number, alto: number, tema: Tema): Bandas {
  const w = medida(ancho);
  const h = medida(alto);
  const altoSuperior = h * tema.bandas.superior;
  const altoCentral = h * tema.bandas.central;
  return {
    bandaSuperior: { x: 0, y: 0, ancho: w, alto: altoSuperior },
    bandaCentral: { x: 0, y: altoSuperior, ancho: w, alto: altoCentral },
    bandaInferior: { x: 0, y: altoSuperior + altoCentral, ancho: w, alto: h - altoSuperior - altoCentral },
  };
}

/**
 * Calcula la disposición para una ventana de `ancho × alto` píxeles lógicos y una rejilla de `lado × lado`.
 * El tablero es el mayor cuadrado que cabe en la banda central menos su margen, de modo que cabe siempre, sea la
 * ventana ancha, estrecha o muy pequeña. Una ventana degenerada da celdas de tamaño 0, nunca NaN.
 *
 * @throws RangeError si `lado` no es un entero mayor o igual que 1.
 */
export function disponer(ancho: number, alto: number, lado: number, tema: Tema = TEMA): Disposicion {
  if (!Number.isInteger(lado) || lado < 1) throw new RangeError(`lado debe ser un entero ≥ 1: ${lado}`);
  const { proporciones } = tema;
  const { bandaSuperior, bandaCentral, bandaInferior } = repartirBandas(ancho, alto, tema);

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

/**
 * Dispone la banda inferior para una mano de `numeroDeGranos` fichas: el botón Deshacer a la derecha, las fichas
 * en una fila centrada en la banda (con el mismo espacio libre a cada lado que ocupa el botón, para que la fila
 * quede centrada sin tocarlo) y la descripción debajo. Las fichas se escalan para caber con cualquier número y
 * cualquier forma de ventana; una ventana degenerada da tamaños 0, nunca NaN.
 */
export function disponerMano(ventana: Ventana, numeroDeGranos: number, tema: Tema = TEMA): DisposicionMano {
  const banda = repartirBandas(ventana.ancho, ventana.alto, tema).bandaInferior;
  const p = tema.mano;
  const n = Number.isInteger(numeroDeGranos) && numeroDeGranos > 0 ? numeroDeGranos : 0;

  const margen = Math.min(banda.ancho, banda.alto) * p.margen;
  const altoUtil = Math.max(0, banda.alto - 2 * margen);
  const altoFila = altoUtil * p.fila;
  const centroFila = banda.y + margen + altoFila / 2;

  const anchoBoton = Math.max(0, Math.min(banda.ancho * p.anchoBoton, altoUtil * p.anchoBotonPorAlto));
  const altoBoton = Math.min(anchoBoton * p.altoBoton, altoFila);
  const deshacer: Rect = {
    x: banda.x + banda.ancho - margen - anchoBoton,
    y: centroFila - altoBoton / 2,
    ancho: anchoBoton,
    alto: altoBoton,
  };

  // Ancho simétrico disponible para la fila: la banda menos el botón y sus márgenes a cada lado.
  const anchoFila = Math.max(0, banda.ancho - 2 * (2 * margen + anchoBoton));
  // n · 2r + (n − 1) · hueco · 2r = anchoFila, y 2r ≤ altoFila.
  const radio = n === 0 ? 0 : Math.min(altoFila / 2, anchoFila / (2 * n + 2 * (n - 1) * p.hueco));
  const paso = 2 * radio * (1 + p.hueco);
  const centro = banda.x + banda.ancho / 2;
  const fichas = Array.from({ length: n }, (_, i) => ({ x: centro + (i - (n - 1) / 2) * paso, y: centroFila, radio }));

  const descripcion: Rect = {
    x: banda.x + margen,
    y: banda.y + margen + altoFila,
    ancho: Math.max(0, banda.ancho - 2 * margen),
    alto: altoUtil - altoFila,
  };
  return { banda, fichas, descripcion, deshacer };
}

const contiene = (r: Rect, p: Punto): boolean => p.x >= r.x && p.x < r.x + r.ancho && p.y >= r.y && p.y < r.y + r.alto;

/** Celda bajo `punto` como `{ x, y }` (columna y fila de `celdas[y][x]`), o `null` fuera del tablero o en un hueco. */
export function celdaEn(punto: Punto, disposicion: Disposicion): Punto | null {
  for (const [y, fila] of disposicion.celdas.entries()) {
    for (const [x, r] of fila.entries()) if (contiene(r, punto)) return { x, y };
  }
  return null;
}

/** Si `punto` cae dentro del botón Deshacer. */
export function botonDeshacerEn(punto: Punto, mano: DisposicionMano): boolean {
  return contiene(mano.deshacer, punto);
}
