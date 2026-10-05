import type { Accion } from '@pila/core';

export type Colocar = Extract<Accion, { readonly tipo: 'Colocar' }>;

/**
 * Las acciones `Colocar` legales del grano sin colocar de menor índice, en el orden de `accionesLegales`
 * (celdas por filas). Vacío si ya no queda ningún grano por colocar.
 */
export function colocacionesDelPrimerGrano(acciones: readonly Accion[]): Colocar[] {
  const colocar = acciones.filter((a): a is Colocar => a.tipo === 'Colocar');
  const primero = colocar[0]?.indiceMano;
  return colocar.filter((a) => a.indiceMano === primero);
}

/** La acción `Confirmar` de la lista; un error si no está, porque ningún bot debe construir acciones. */
export function confirmar(acciones: readonly Accion[]): Accion {
  const accion = acciones.find((a) => a.tipo === 'Confirmar');
  if (accion === undefined) throw new Error('no queda ningún Colocar legal y Confirmar no está entre las acciones');
  return accion;
}
