import { DEFINICIONES_GRANOS } from './data/granos.ts';
import type { AdicionAplicada } from './eventos.ts';
import { dentro } from './rejilla.ts';
import type { Celdas, Colocacion } from './tipos.ts';

export type ResultadoAdiciones = { readonly celdas: Celdas; readonly eventos: readonly AdicionAplicada[] };

/**
 * Paso 1 de «Resolución de una tirada»: calcula el efecto de colocar granos sobre una rejilla, sin mutarla.
 * Suma lo que declara `DEFINICIONES_GRANOS` para cada colocación e ignora lo que cae fuera de la rejilla.
 * Es la misma función que usa `Confirmar`, así que sirve para previsualizar una mano sin duplicar las reglas.
 *
 * @param celdas Rejilla `lado × lado`, indexada `celdas[y][x]`. No se modifica.
 * @param colocaciones Granos colocados, con su tipo y su celda. Varios pueden compartir celda.
 * @returns La rejilla nueva y un `AdicionAplicada` por celda que recibe granos, con su total, por filas.
 * @throws RangeError si una colocación cae fuera de la rejilla (error de programación).
 */
export function aplicarAdiciones(celdas: Celdas, colocaciones: readonly Colocacion[]): ResultadoAdiciones {
  const lado = celdas.length;
  // Clave y · lado + x: ordenar por clave es recorrer por filas.
  const recibido = new Map<number, number>();
  for (const { tipo, x, y } of colocaciones) {
    if (!dentro(lado, x, y)) throw new RangeError(`colocación fuera de la rejilla: ${tipo} en (${x}, ${y})`);
    for (const { dx, dy, cantidad } of DEFINICIONES_GRANOS[tipo].adiciones) {
      if (!dentro(lado, x + dx, y + dy)) continue;
      const clave = (y + dy) * lado + (x + dx);
      recibido.set(clave, (recibido.get(clave) ?? 0) + cantidad);
    }
  }

  const eventos = [...recibido.entries()]
    .sort(([a], [b]) => a - b)
    .map(([clave, cantidad]): AdicionAplicada => ({
      tipo: 'AdicionAplicada',
      x: clave % lado,
      y: Math.floor(clave / lado),
      cantidad,
    }));
  const nuevas = celdas.map((fila, y) => fila.map((valor, x) => valor + (recibido.get(y * lado + x) ?? 0)));
  return { celdas: nuevas, eventos };
}
