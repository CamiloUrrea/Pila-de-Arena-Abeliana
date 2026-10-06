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

export type PrevisionConCandidata = Prevision & {
  /** Granos que añade solo la candidata, indexados `[y][x]`: la diferencia con la previsión sin ella. */
  readonly candidata: Estado['celdas'];
};

/**
 * Vista previa con una colocación hipotética: el grano `indiceSeleccionado` en `celda`, sumado a las colocaciones
 * provisionales ya hechas. No llama a `aplicar` ni modifica `estado`. Sin grano seleccionado (o si ya está
 * colocado), o con la celda fuera de la rejilla, devuelve lo mismo que `calcularPrevistas` y la candidata a cero.
 */
export function calcularPrevistasConCandidata(
  estado: Estado,
  indiceSeleccionado: number | null,
  celda: { readonly x: number; readonly y: number } | null,
): PrevisionConCandidata {
  const base = calcularPrevistas(estado);
  const grano = indiceSeleccionado === null ? undefined : estado.mano[indiceSeleccionado];
  const lado = estado.celdas.length;
  const dentro = (v: number): boolean => Number.isInteger(v) && v >= 0 && v < lado;
  if (grano === undefined || grano.celda !== null || celda === null || !dentro(celda.x) || !dentro(celda.y)) {
    return { ...base, candidata: base.previstas.map((fila) => fila.map(() => 0)) };
  }
  const { celdas: proyectada } = aplicarAdiciones(base.proyectada, [{ tipo: grano.tipo, x: celda.x, y: celda.y }]);
  const previstas = proyectada.map((fila, y) => fila.map((valor, x) => Math.max(0, valor - (estado.celdas[y]?.[x] ?? 0))));
  const candidata = proyectada.map((fila, y) => fila.map((valor, x) => valor - (base.proyectada[y]?.[x] ?? 0)));
  return { proyectada, previstas, candidata };
}
