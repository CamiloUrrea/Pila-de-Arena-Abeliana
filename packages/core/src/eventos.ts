import type { Coordenada } from './tipos.ts';

/** Direcciones de reparto, en el orden de la especificación. */
export type Direccion = 'arriba' | 'derecha' | 'abajo' | 'izquierda';

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

/** Eventos del núcleo. Los demás eventos de la especificación llegan en T1.5 a T1.7. */
export type Evento = OleadaIniciada | Derrumbe | GranoFuera | OleadaTerminada;
