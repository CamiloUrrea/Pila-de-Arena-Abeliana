import type { Coordenada, TipoGrano } from './tipos.ts';

/** Direcciones de reparto, en el orden de la especificación. */
export type Direccion = 'arriba' | 'derecha' | 'abajo' | 'izquierda';

/** Mano robada, en orden de robo. */
export type ManoRobada = { readonly tipo: 'ManoRobada'; readonly tipos: readonly TipoGrano[] };

/** Colocación provisional de un grano de la mano; la rejilla no cambia hasta Confirmar. */
export type GranoColocado = {
  readonly tipo: 'GranoColocado';
  readonly indiceMano: number;
  readonly x: number;
  readonly y: number;
};

/** Se deshizo la última colocación de la tirada. */
export type ColocacionDeshecha = { readonly tipo: 'ColocacionDeshecha'; readonly indiceMano: number };

/** Empieza la resolución de la tirada número `numero` (desde 1). */
export type TiradaConfirmada = { readonly tipo: 'TiradaConfirmada'; readonly numero: number };

/** Fin de la resolución de una tirada. Puntos en centésimas. */
export type TiradaResuelta = {
  readonly tipo: 'TiradaResuelta';
  readonly oleadas: number;
  readonly granosFuera: number;
  readonly puntosGanados: number;
  readonly puntosTotales: number;
};

/** Granos que recibió la celda `(x, y)` en el paso 1, sumando todas las colocaciones. */
export type AdicionAplicada = {
  readonly tipo: 'AdicionAplicada';
  readonly x: number;
  readonly y: number;
  readonly cantidad: number;
};

export type OleadaIniciada = {
  readonly tipo: 'OleadaIniciada';
  readonly k: number;
  /** Celdas inestables al empezar la oleada, por filas. */
  readonly celdas: readonly Coordenada[];
};

export type Derrumbe = { readonly tipo: 'Derrumbe'; readonly k: number; readonly x: number; readonly y: number };

/** Grano que sale de la rejilla desde la celda `(x, y)`, que se derrumba. `puntos` en centésimas. */
export type GranoFuera = {
  readonly tipo: 'GranoFuera';
  readonly k: number;
  readonly x: number;
  readonly y: number;
  readonly direccion: Direccion;
  readonly puntos: number;
};

export type OleadaTerminada = {
  readonly tipo: 'OleadaTerminada';
  readonly k: number;
  readonly derrumbes: number;
  readonly granosFuera: number;
  /** Centésimas ganadas en esta oleada. */
  readonly puntosGanados: number;
};

/** Fin de la ronda con victoria. `puntos` en centésimas; los sobrantes sobre la meta se conservan. */
export type RondaGanada = { readonly tipo: 'RondaGanada'; readonly puntos: number };

/** Fin de la ronda con derrota. `puntos` en centésimas. */
export type RondaPerdida = { readonly tipo: 'RondaPerdida'; readonly puntos: number };

/** Los 12 eventos de la especificación. */
export type Evento =
  | ManoRobada
  | GranoColocado
  | ColocacionDeshecha
  | TiradaConfirmada
  | AdicionAplicada
  | OleadaIniciada
  | Derrumbe
  | GranoFuera
  | OleadaTerminada
  | TiradaResuelta
  | RondaGanada
  | RondaPerdida;
