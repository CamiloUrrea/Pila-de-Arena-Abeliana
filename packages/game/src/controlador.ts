// Controlador puro de la interfaz, sobre la interfaz pública del núcleo: qué grano está seleccionado y qué acción
// de `core` dispara cada gesto. Nunca lanza ni muta; no conoce `Confirmar` (llega en T3.3).
import { aplicar } from '@pila/core';
import type { ErrorAccion, Estado, Evento, Resultado } from '@pila/core';

/** Estado de la interfaz: el estado del núcleo y el índice de la mano del grano seleccionado, o `null`. */
export type EstadoInterfaz = { readonly estado: Estado; readonly seleccionado: number | null };

/** Error del controlador: no hay grano seleccionado, o el error de `core` tal cual. */
export type ErrorControlador = { readonly tipo: 'SinGranoSeleccionado' } | ErrorAccion;

export type PasoInterfaz = { readonly ui: EstadoInterfaz; readonly eventos: readonly Evento[] };

/** Índice del grano sin colocar de menor índice, o `null` si están todos colocados. */
function primeroSinColocar(estado: Estado): number | null {
  const indice = estado.mano.findIndex((g) => g.celda === null);
  return indice === -1 ? null : indice;
}

/** Estado de interfaz inicial: selecciona el grano sin colocar de menor índice (o ninguno). */
export function iniciarControlador(estado: Estado): EstadoInterfaz {
  return { estado, seleccionado: primeroSinColocar(estado) };
}

/** Coloca el grano seleccionado en `(x, y)` y selecciona el siguiente sin colocar (el de menor índice). */
export function colocar(ui: EstadoInterfaz, x: number, y: number): Resultado<PasoInterfaz, ErrorControlador> {
  if (ui.seleccionado === null) return { ok: false, error: { tipo: 'SinGranoSeleccionado' } };
  const paso = aplicar(ui.estado, { tipo: 'Colocar', indiceMano: ui.seleccionado, x, y });
  if (!paso.ok) return paso;
  const { estado, eventos } = paso.valor;
  return { ok: true, valor: { ui: { estado, seleccionado: primeroSinColocar(estado) }, eventos } };
}

/** Deshace la colocación más reciente y selecciona el grano que acaba de quedar sin colocar. */
export function deshacer(ui: EstadoInterfaz): Resultado<PasoInterfaz, ErrorControlador> {
  const indiceMano = ui.estado.ordenColocacion.at(-1);
  const paso = aplicar(ui.estado, { tipo: 'Deshacer' });
  if (!paso.ok) return paso;
  const { estado, eventos } = paso.valor;
  return { ok: true, valor: { ui: { estado, seleccionado: indiceMano ?? primeroSinColocar(estado) }, eventos } };
}
