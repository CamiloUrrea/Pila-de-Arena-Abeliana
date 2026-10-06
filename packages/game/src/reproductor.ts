// Reproductor inmutable de una cascada: lleva el tiempo transcurrido y da el cuadro actual. Cada operación devuelve
// un reproductor nuevo; el render solo le pasa el `deltaMS` del ticker.
import { muestrear } from './cascada.ts';
import type { Cascada, Cuadro } from './cascada.ts';
import { TEMA } from './tema.ts';
import type { Tema } from './tema.ts';

export type Reproductor = {
  readonly cascada: Cascada;
  /** Tiempo de la cascada ya reproducido, en milisegundos al ritmo 1, entre 0 y su duración total. */
  readonly tMs: number;
  readonly terminado: boolean;
};

/** Un tiempo o un ritmo no utilizable (negativo, NaN o infinito) cuenta como 0. */
const valido = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);

/** Reproductor al principio de la cascada; una cascada sin pasos ya está terminada. */
export function crearReproductor(cascada: Cascada): Reproductor {
  return { cascada, tMs: 0, terminado: cascada.duracionTotal <= 0 };
}

/**
 * Avanza `dtMs` milisegundos de reloj a `ritmo` (1 por defecto; el ritmo ajustable llega en T3.3b). Un `dtMs` o un
 * ritmo negativo, NaN o infinito cuenta como 0. Tras terminar no cambia nada.
 */
export function avanzar(rep: Reproductor, dtMs: number, ritmo = 1): Reproductor {
  if (rep.terminado) return rep;
  const avance = valido(dtMs) * valido(ritmo);
  if (avance === 0) return rep;
  const tMs = Math.min(rep.cascada.duracionTotal, rep.tMs + avance);
  return { cascada: rep.cascada, tMs, terminado: tMs >= rep.cascada.duracionTotal };
}

/** Lleva el reproductor al final de la cascada. */
export function saltar(rep: Reproductor): Reproductor {
  return { cascada: rep.cascada, tMs: rep.cascada.duracionTotal, terminado: true };
}

export function cuadroActual(rep: Reproductor, tema: Tema = TEMA): Cuadro {
  return muestrear(rep.cascada, rep.tMs, tema);
}

export function terminado(rep: Reproductor): boolean {
  return rep.terminado;
}
