// Ritmo de la animación de la cascada: un factor sobre el tiempo del reloj. Puro y sin estado.
import { formatearPuntos } from './textos.ts';

/** Ritmos permitidos, de menor a mayor. */
export const RITMOS: readonly number[] = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

export const RITMO_POR_DEFECTO = 1;

/** Índice del ritmo permitido más cercano a `ritmo` (el menor en caso de empate); NaN cuenta como el por defecto. */
function indiceMasCercano(ritmo: number): number {
  const objetivo = Number.isNaN(ritmo) ? RITMO_POR_DEFECTO : ritmo;
  let mejor = 0;
  for (const [i, r] of RITMOS.entries()) {
    if (Math.abs(r - objetivo) < Math.abs((RITMOS[mejor] ?? r) - objetivo)) mejor = i;
  }
  return mejor;
}

/**
 * El ritmo permitido siguiente (`+1`) o anterior (`−1`). En los extremos se queda; si `actual` no está en la lista,
 * parte del más cercano.
 */
export function siguienteRitmo(actual: number, direccion: 1 | -1): number {
  const indice = Math.min(RITMOS.length - 1, Math.max(0, indiceMasCercano(actual) + direccion));
  return RITMOS[indice] ?? RITMO_POR_DEFECTO;
}

/** «×1», «×0,5», «×1,5»: el ritmo con coma decimal y sin ceros sobrantes. */
export function formatearRitmo(ritmo: number): string {
  return `×${formatearPuntos(Math.round(ritmo * 100))}`;
}
