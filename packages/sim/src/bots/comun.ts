import { DEFINICIONES_GRANOS } from '@pila/core';
import type { Accion, Estado, GranoMano, TipoGrano } from '@pila/core';

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

/** Grano de un tipo en una celda, para proyectar su efecto. */
export type GranoEnCelda = { readonly tipo: TipoGrano; readonly x: number; readonly y: number };

/**
 * Proyecta el paso 1 de la tirada: las celdas actuales más el efecto, según `DEFINICIONES_GRANOS`, de las
 * colocaciones provisionales y del grano candidato. Lo que cae fuera de la rejilla se ignora. No resuelve
 * derrumbes: es la carga que quedaría justo antes de las oleadas. Devuelve una rejilla nueva.
 */
export function proyectar(
  celdas: Estado['celdas'],
  provisionales: readonly GranoMano[],
  candidato: GranoEnCelda,
): number[][] {
  const lado = celdas.length;
  const proyectadas = celdas.map((fila) => [...fila]);
  const granos: GranoEnCelda[] = [];
  for (const grano of provisionales) {
    if (grano.celda !== null) granos.push({ tipo: grano.tipo, x: grano.celda.x, y: grano.celda.y });
  }
  granos.push(candidato);
  for (const { tipo, x, y } of granos) {
    for (const { dx, dy, cantidad } of DEFINICIONES_GRANOS[tipo].adiciones) {
      const fila = proyectadas[y + dy];
      const valor = fila?.[x + dx];
      if (fila !== undefined && valor !== undefined && x + dx >= 0 && x + dx < lado) fila[x + dx] = valor + cantidad;
    }
  }
  return proyectadas;
}

/** Distancia al centro de la rejilla, sin decimales: `|2x − (lado−1)| + |2y − (lado−1)|`. */
export function distanciaAlCentro(x: number, y: number, lado: number): number {
  return Math.abs(2 * x - (lado - 1)) + Math.abs(2 * y - (lado - 1));
}

/** La opción más cercana al centro; en empate, la primera por filas (el orden de `accionesLegales`). */
export function masCercanaAlCentro(opciones: readonly Colocar[], lado: number): Colocar | undefined {
  let mejor: Colocar | undefined;
  for (const opcion of opciones) {
    if (mejor === undefined || distanciaAlCentro(opcion.x, opcion.y, lado) < distanciaAlCentro(mejor.x, mejor.y, lado)) {
      mejor = opcion;
    }
  }
  return mejor;
}
