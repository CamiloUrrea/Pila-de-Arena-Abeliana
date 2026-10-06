// Controlador puro de la interfaz, sobre la interfaz pública del núcleo: qué grano está seleccionado y qué acción
// de `core` dispara cada gesto. Nunca lanza ni muta.
import { aplicar } from '@pila/core';
import type { ErrorAccion, Estado, Evento, Resultado } from '@pila/core';

/** Estado de la interfaz: el estado del núcleo y el índice de la mano del grano seleccionado, o `null`. */
export type EstadoInterfaz = { readonly estado: Estado; readonly seleccionado: number | null };

/** Error del controlador: uno propio de la interfaz, o el error de `core` tal cual. */
export type ErrorControlador =
  /** `colocar` sin grano seleccionado: todos los granos de la mano están colocados. */
  | { readonly tipo: 'SinGranoSeleccionado' }
  /** `seleccionar` con un índice que no es el de un grano de la mano sin colocar. */
  | { readonly tipo: 'GranoNoSeleccionable'; readonly indice: number }
  /** `deshacerDesdeFicha` con un grano colocado que no es el último colocado. */
  | { readonly tipo: 'NoEsLaUltimaColocacion'; readonly indice: number }
  /** `deshacerDesdeFicha` con un grano que no está colocado. */
  | { readonly tipo: 'GranoNoColocado'; readonly indice: number }
  | ErrorAccion;

export type PasoInterfaz = { readonly ui: EstadoInterfaz; readonly eventos: readonly Evento[] };

type ResultadoPaso = Resultado<PasoInterfaz, ErrorControlador>;

/** Paso de `confirmar`: además, el estado de antes, cuya rejilla es el punto de partida de la cascada. */
export type PasoConfirmar = PasoInterfaz & { readonly estadoAntes: Estado };

const sinColocar = (estado: Estado, indice: number): boolean => estado.mano[indice]?.celda === null;

/** Índice del grano sin colocar de menor índice, o `null` si están todos colocados. */
function primeroSinColocar(estado: Estado): number | null {
  const indice = estado.mano.findIndex((g) => g.celda === null);
  return indice === -1 ? null : indice;
}

/**
 * Grano que se selecciona tras colocar el `colocado`: el siguiente sin colocar con índice mayor; si no hay, el de
 * menor índice sin colocar; `null` si están todos colocados.
 */
function siguienteTrasColocar(estado: Estado, colocado: number): number | null {
  const mayor = estado.mano.findIndex((g, i) => i > colocado && g.celda === null);
  return mayor === -1 ? primeroSinColocar(estado) : mayor;
}

const ok = (estado: Estado, seleccionado: number | null, eventos: readonly Evento[]): ResultadoPaso => ({
  ok: true,
  valor: { ui: { estado, seleccionado }, eventos },
});

/** Estado de interfaz inicial: selecciona el grano sin colocar de menor índice (o ninguno). */
export function iniciarControlador(estado: Estado): EstadoInterfaz {
  return { estado, seleccionado: primeroSinColocar(estado) };
}

/** Selecciona el grano `indice` de la mano, que debe estar sin colocar; si no, `GranoNoSeleccionable`. */
export function seleccionar(ui: EstadoInterfaz, indice: number): ResultadoPaso {
  if (!Number.isInteger(indice) || !sinColocar(ui.estado, indice)) {
    return { ok: false, error: { tipo: 'GranoNoSeleccionable', indice } };
  }
  return ok(ui.estado, indice, []);
}

/**
 * Pasa a la siguiente (`+1`) o anterior (`−1`) ficha sin colocar, de forma circular, saltando las colocadas. Sin
 * granos sin colocar no hace nada. Nunca falla.
 */
export function ciclar(ui: EstadoInterfaz, direccion: 1 | -1): ResultadoPaso {
  const n = ui.estado.mano.length;
  // Sin selección se empieza fuera de la mano, para llegar al primero (+1) o al último (−1).
  const inicio = ui.seleccionado ?? (direccion === 1 ? -1 : n);
  for (let paso = 1; paso <= n; paso++) {
    const indice = (((inicio + direccion * paso) % n) + n) % n;
    if (sinColocar(ui.estado, indice)) return ok(ui.estado, indice, []);
  }
  return ok(ui.estado, ui.seleccionado, []);
}

/** Coloca el grano seleccionado en `(x, y)` y selecciona el siguiente según `siguienteTrasColocar`. */
export function colocar(ui: EstadoInterfaz, x: number, y: number): ResultadoPaso {
  if (ui.seleccionado === null) return { ok: false, error: { tipo: 'SinGranoSeleccionado' } };
  const paso = aplicar(ui.estado, { tipo: 'Colocar', indiceMano: ui.seleccionado, x, y });
  if (!paso.ok) return paso;
  const { estado, eventos } = paso.valor;
  return ok(estado, siguienteTrasColocar(estado, ui.seleccionado), eventos);
}

/** Deshace la colocación más reciente y selecciona el grano que acaba de quedar sin colocar. */
export function deshacer(ui: EstadoInterfaz): ResultadoPaso {
  const indiceMano = ui.estado.ordenColocacion.at(-1);
  const paso = aplicar(ui.estado, { tipo: 'Deshacer' });
  if (!paso.ok) return paso;
  const { estado, eventos } = paso.valor;
  return ok(estado, indiceMano ?? primeroSinColocar(estado), eventos);
}

/**
 * Deshace desde una ficha de la mano: si el grano `indice` es el último colocado, equivale a `deshacer`; si está
 * colocado pero no es el último, `NoEsLaUltimaColocacion`; si no está colocado, `GranoNoColocado`.
 */
export function deshacerDesdeFicha(ui: EstadoInterfaz, indice: number): ResultadoPaso {
  const grano = Number.isInteger(indice) ? ui.estado.mano[indice] : undefined;
  if (grano === undefined || grano.celda === null) return { ok: false, error: { tipo: 'GranoNoColocado', indice } };
  if (ui.estado.ordenColocacion.at(-1) !== indice) return { ok: false, error: { tipo: 'NoEsLaUltimaColocacion', indice } };
  return deshacer(ui);
}

/**
 * Confirma la tirada con `Confirmar` de `core`. En el estado de interfaz nuevo se selecciona el grano de menor
 * índice sin colocar de la mano nueva, o ninguno si la ronda terminó. Los errores del núcleo (`ManoIncompleta`,
 * `ResolucionNoTermino`…) se devuelven tal cual.
 */
export function confirmar(ui: EstadoInterfaz): Resultado<PasoConfirmar, ErrorControlador> {
  const paso = aplicar(ui.estado, { tipo: 'Confirmar' });
  if (!paso.ok) return paso;
  const { estado, eventos } = paso.valor;
  return { ok: true, valor: { ui: { estado, seleccionado: primeroSinColocar(estado) }, eventos, estadoAntes: ui.estado } };
}
