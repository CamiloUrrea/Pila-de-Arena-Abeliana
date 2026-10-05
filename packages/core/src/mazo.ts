import { barajar } from './azar.ts';
import type { ManoRobada } from './eventos.ts';
import { TIPOS_GRANO } from './tipos.ts';
import type { Config, EstadoFlujo, GranoMano, TipoGrano } from './tipos.ts';

/**
 * Mazo inicial: los tipos en el orden de `TipoGrano` con las cantidades de `composicion` (`config.mazo`),
 * barajados con el flujo `mazo`.
 */
export function crearMazo(
  composicion: Config['mazo'],
  flujo: EstadoFlujo,
): { readonly mazo: readonly TipoGrano[]; readonly flujo: EstadoFlujo } {
  const tipos = TIPOS_GRANO.flatMap((tipo) => Array.from({ length: composicion[tipo] }, () => tipo));
  const [mazo, siguiente] = barajar(tipos, flujo);
  return { mazo, flujo: siguiente };
}

export type ResultadoRobo = {
  readonly mano: readonly GranoMano[];
  readonly mazo: readonly TipoGrano[];
  readonly usados: readonly TipoGrano[];
  readonly flujo: EstadoFlujo;
  readonly evento: ManoRobada;
};

/**
 * Roba `tamanoMano` granos de la cabeza del mazo, en orden, sin colocar.
 * Si el mazo alcanza, no consume el flujo. Si no, toma los que queden, baraja `usados` con el flujo `mazo`
 * para formar el mazo nuevo, completa la mano con su cabeza y deja `usados` vacío.
 *
 * Quien llame debe pasar antes la mano jugada a `usados`, para que entre en el reciclaje.
 * Sin granos suficientes entre mazo y usados, lanza `RangeError` (error de programación).
 */
export function robarMano(
  mazo: readonly TipoGrano[],
  usados: readonly TipoGrano[],
  tamanoMano: number,
  flujo: EstadoFlujo,
): ResultadoRobo {
  if (!Number.isSafeInteger(tamanoMano) || tamanoMano < 1) {
    throw new RangeError(`tamanoMano debe ser un entero mayor o igual que 1: ${tamanoMano}`);
  }
  if (mazo.length + usados.length < tamanoMano) {
    throw new RangeError(`no hay ${tamanoMano} granos entre mazo (${mazo.length}) y usados (${usados.length})`);
  }

  let tipos: readonly TipoGrano[];
  let resto: readonly TipoGrano[];
  let quedanUsados: readonly TipoGrano[];
  let siguiente: EstadoFlujo;
  if (mazo.length >= tamanoMano) {
    tipos = mazo.slice(0, tamanoMano);
    resto = mazo.slice(tamanoMano);
    quedanUsados = [...usados];
    siguiente = flujo;
  } else {
    const [reciclado, trasBarajar] = barajar(usados, flujo);
    const faltan = tamanoMano - mazo.length;
    tipos = [...mazo, ...reciclado.slice(0, faltan)];
    resto = reciclado.slice(faltan);
    quedanUsados = [];
    siguiente = trasBarajar;
  }

  return {
    mano: tipos.map((tipo) => ({ tipo, celda: null })),
    mazo: resto,
    usados: quedanUsados,
    flujo: siguiente,
    evento: { tipo: 'ManoRobada', tipos },
  };
}
