/** Tipos de grano del MVP. */
export type TipoGrano = 'normal' | 'pesado' | 'explosivo';

/** Fase de una ronda. */
export type Fase = 'colocando' | 'ganada' | 'perdida';

export const TIPOS_GRANO: readonly TipoGrano[] = ['normal', 'pesado', 'explosivo'];
export const FASES: readonly Fase[] = ['colocando', 'ganada', 'perdida'];

/** Configuración de una ronda. Puntos y multiplicadores en centésimas. */
export type Config = {
  readonly lado: number;
  readonly umbral: number;
  readonly tiradas: number;
  readonly tamanoMano: number;
  readonly siembra: { readonly min: number; readonly max: number };
  readonly mazo: Readonly<Record<TipoGrano, number>>;
  readonly meta: number;
  readonly multiplicadorPorOleada: number;
  readonly topeOleadas: number;
};

/** Estado de un flujo xoshiro128**: cuatro enteros sin signo de 32 bits, nunca todos cero. */
export type EstadoFlujo = readonly [number, number, number, number];

/** Flujos de azar con nombre. `bonus` se añade en H5. */
export type NombreFlujo = 'siembra' | 'mazo';

export const NOMBRES_FLUJO: readonly NombreFlujo[] = ['siembra', 'mazo'];

/** Estado de todos los flujos de azar de una ronda. */
export type EstadoRng = { readonly [N in NombreFlujo]: EstadoFlujo };

export type Coordenada = { readonly x: number; readonly y: number };

/** Grano de un tipo colocado en una celda. */
export type Colocacion = { readonly tipo: TipoGrano; readonly x: number; readonly y: number };

/** Granos que suma un tipo al colocarse: en la celda `(x + dx, y + dy)`, si cae dentro de la rejilla. */
export type AdicionGrano = { readonly dx: number; readonly dy: number; readonly cantidad: number };

/** Definición de un tipo de grano como datos, sin lógica. */
export type DefinicionGrano = { readonly tipo: TipoGrano; readonly adiciones: readonly AdicionGrano[] };

/** Grano de la mano; `celda` es su colocación provisional en esta tirada, o `null`. */
export type GranoMano = {
  readonly tipo: TipoGrano;
  readonly celda: Coordenada | null;
};

/** Matriz `lado × lado` indexada `celdas[y][x]`, por filas. */
export type Celdas = readonly (readonly number[])[];

/** Estado completo de una ronda: JSON plano y serializable. */
export type Estado = {
  readonly config: Config;
  readonly celdas: Celdas;
  readonly fase: Fase;
  readonly mano: readonly GranoMano[];
  /** Tipos restantes en orden de robo; la cabeza es el índice 0. */
  readonly mazo: readonly TipoGrano[];
  readonly usados: readonly TipoGrano[];
  readonly tiradasRestantes: number;
  /** Puntos acumulados en la ronda, en centésimas. */
  readonly puntos: number;
  /** Estado de cada flujo de azar con nombre. */
  readonly rng: EstadoRng;
};

export type Resultado<T, E> = { readonly ok: true; readonly valor: T } | { readonly ok: false; readonly error: E };

/** Error de validación: `campo` es la ruta del dato (por ejemplo `siembra.min` o `celdas[1][2]`). */
export type ErrorConfig = { readonly campo: string; readonly motivo: string };
export type ErrorEstado = { readonly campo: string; readonly motivo: string };

export type ErrorDeserializacion =
  | { readonly tipo: 'JsonInvalido'; readonly detalle: string }
  | { readonly tipo: 'FormatoDesconocido'; readonly detalle: string }
  | { readonly tipo: 'EstadoInvalido'; readonly campo: string; readonly motivo: string };
