// Indicadores de la ronda, puros: el medidor de desborde, las tiradas restantes y los recuentos del mazo, más dos
// funciones de tiempo deterministas (suavizado y pulso) que el render usa con el tiempo del ticker.
import { DEFINICIONES_GRANOS } from '@pila/core';
import type { Estado, TipoGrano } from '@pila/core';
import type { Cuadro } from './cascada.ts';
import { TEMA } from './tema.ts';
import type { Tema } from './tema.ts';
import { formatearPuntos } from './textos.ts';

/** Los tipos de grano en el orden de los datos (`DEFINICIONES_GRANOS`). */
const TIPOS = Object.keys(DEFINICIONES_GRANOS) as TipoGrano[];

/** `puntos / meta` acotado a `[0, 1]`. Con `meta` menor que 1 o valores no finitos devuelve 0; nunca NaN. */
export function proporcionMedidor(puntos: number, meta: number): number {
  if (!Number.isFinite(puntos) || !Number.isFinite(meta) || meta < 1) return 0;
  return Math.min(1, Math.max(0, puntos / meta));
}

/** Color del relleno del medidor por tramos: menos de 0,5; de 0,5 a menos de 1; y 1 o más. */
export function colorMedidor(proporcion: number, tema: Tema = TEMA): number {
  const { bajo, medio, lleno } = tema.indicadores.medidor.relleno;
  if (proporcion >= 1) return lleno;
  if (proporcion >= 0.5) return medio;
  return bajo;
}

/**
 * Puntos que muestra el medidor: durante una cascada, los de antes de la tirada más los que lleva la tirada
 * (`cuadro.puntosTirada`, que suben al terminar cada oleada); fuera de ella, los del estado.
 */
export function puntosMostrados(puntosAntes: number, cuadro: Cuadro | null, puntosActuales: number): number {
  return cuadro === null ? puntosActuales : puntosAntes + cuadro.puntosTirada;
}

export type Indicadores = {
  readonly medidor: {
    readonly puntos: number;
    readonly meta: number;
    readonly proporcion: number;
    /** «P / M» con `formatearPuntos`. */
    readonly texto: string;
    readonly metaAlcanzada: boolean;
  };
  readonly tiradas: { readonly total: number; readonly restantes: number };
  /** Solo recuentos de lo que queda por robar: nunca el orden del mazo. */
  readonly mazo: { readonly total: number; readonly porTipo: Readonly<Record<TipoGrano, number>> };
};

/** Indicadores de un estado. `puntos` permite mostrar otros puntos que los del estado (durante una cascada). */
export function describirIndicadores(estado: Estado, puntos: number = estado.puntos): Indicadores {
  const { meta, tiradas } = estado.config;
  const porTipo = Object.fromEntries(TIPOS.map((t) => [t, 0])) as Record<TipoGrano, number>;
  for (const tipo of estado.mazo) porTipo[tipo] = (porTipo[tipo] ?? 0) + 1;
  return {
    medidor: {
      puntos,
      meta,
      proporcion: proporcionMedidor(puntos, meta),
      texto: `${formatearPuntos(puntos)} / ${formatearPuntos(meta)}`,
      metaAlcanzada: puntos >= meta,
    },
    tiradas: { total: tiradas, restantes: estado.tiradasRestantes },
    mazo: { total: estado.mazo.length, porTipo },
  };
}

/**
 * Qué fichas de tiradas van llenas, de izquierda a derecha: las primeras `restantes` (las que quedan) llenas y las
 * gastadas vacías. Valores fuera de rango se acotan.
 */
export function fichasTiradas({ total, restantes }: Indicadores['tiradas']): boolean[] {
  const n = Number.isInteger(total) && total > 0 ? total : 0;
  const llenas = Math.min(n, Math.max(0, Number.isFinite(restantes) ? Math.trunc(restantes) : 0));
  return Array.from({ length: n }, (_, i) => i < llenas);
}

/** Diferencia por debajo de la cual el suavizado llega al objetivo. */
const EPSILON = 1e-3;

/**
 * Suavizado exponencial determinista de `actual` hacia `objetivo` en `dtMs` milisegundos, con constante de tiempo
 * `constanteMs`. No se pasa del objetivo. Un `dtMs` negativo, NaN o infinito no cambia nada; con una constante no
 * positiva, o si la diferencia queda por debajo de un épsilon, devuelve el objetivo.
 */
export function suavizar(actual: number, objetivo: number, dtMs: number, constanteMs: number): number {
  if (!Number.isFinite(dtMs) || dtMs < 0) return actual;
  if (!Number.isFinite(constanteMs) || constanteMs <= 0) return objetivo;
  const siguiente = objetivo + (actual - objetivo) * Math.exp(-dtMs / constanteMs);
  return Math.abs(objetivo - siguiente) < EPSILON ? objetivo : siguiente;
}

/** Pulso periódico entre 0 y 1 (coseno elevado), 0 en `tMs = 0`. Con valores no utilizables devuelve 0. */
export function intensidadPulso(tMs: number, periodoMs: number): number {
  if (!Number.isFinite(tMs) || !Number.isFinite(periodoMs) || periodoMs <= 0) return 0;
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * tMs) / periodoMs);
}
