// Vista previa pura de la mano colocada: lo que sumarían sus granos si se confirmara ahora. Usa la misma función
// del núcleo que `Confirmar` (`aplicarAdiciones`), así que no duplica ninguna regla de los granos.
import { aplicarAdiciones } from '@pila/core';
import type { Colocacion, Estado } from '@pila/core';

export type Prevision = {
  /** Rejilla tras sumar los granos colocados, antes de cualquier derrumbe. */
  readonly proyectada: Estado['celdas'];
  /** Granos que recibiría cada celda (`proyectada − celdas`, nunca negativo), indexados `[y][x]`. */
  readonly previstas: Estado['celdas'];
};

/** Calcula la vista previa de las colocaciones provisionales de la mano. No modifica `estado`. */
export function calcularPrevistas(estado: Estado): Prevision {
  const colocaciones: Colocacion[] = estado.mano.flatMap(({ tipo, celda }) =>
    celda === null ? [] : [{ tipo, x: celda.x, y: celda.y }],
  );
  const { celdas: proyectada } = aplicarAdiciones(estado.celdas, colocaciones);
  const previstas = proyectada.map((fila, y) => fila.map((valor, x) => Math.max(0, valor - (estado.celdas[y]?.[x] ?? 0))));
  return { proyectada, previstas };
}
