import fc from 'fast-check';
import { accionesLegales, aplicar, crearRonda } from '../src/index.ts';
import type { Accion, Config, Estado, Evento } from '../src/index.ts';

export type PasoPartida = {
  readonly accion: Accion;
  readonly antes: Estado;
  readonly despues: Estado;
  readonly eventos: readonly Evento[];
};

export type Partida = { readonly pasos: readonly PasoPartida[]; readonly final: Estado };

/**
 * Bot de prueba: en cada paso elige de `accionesLegales` con los enteros dados (en ciclo), con como máximo
 * `maxDeshacer` acciones `Deshacer` por partida, y juega hasta una fase terminal.
 */
export function jugar(inicial: Estado, enteros: readonly number[], maxDeshacer = 3): Partida {
  const pasos: PasoPartida[] = [];
  let estado = inicial;
  let deshechos = 0;
  while (estado.fase === 'colocando') {
    if (pasos.length > 10_000) throw new Error('la partida no termina');
    const legales = accionesLegales(estado).filter((a) => a.tipo !== 'Deshacer' || deshechos < maxDeshacer);
    const accion = legales[(enteros[pasos.length % enteros.length] ?? 0) % legales.length];
    if (accion === undefined) throw new Error('no hay acciones legales en fase colocando');
    const paso = aplicar(estado, accion);
    if (!paso.ok) throw new Error(`acción legal rechazada: ${JSON.stringify(paso.error)}`);
    if (accion.tipo === 'Deshacer') deshechos++;
    pasos.push({ accion, antes: estado, despues: paso.valor.estado, eventos: paso.valor.eventos });
    estado = paso.valor.estado;
  }
  return { pasos, final: estado };
}

export type Escenario = {
  readonly config: Config;
  readonly semilla: number;
  readonly enteros: readonly number[];
  /** Entero libre para elegir un paso intermedio de la partida. */
  readonly corte: number;
};

/**
 * Partidas aleatorias: lado 1 a 5, tiradas 1 a 6, tamanoMano 1 a 6, mazo con al menos tamanoMano granos,
 * multiplicador 0 a 50 y meta variable.
 */
export const arbEscenario: fc.Arbitrary<Escenario> = fc
  .record({
    lado: fc.integer({ min: 1, max: 5 }),
    tiradas: fc.integer({ min: 1, max: 6 }),
    tamanoMano: fc.integer({ min: 1, max: 6 }),
    siembraMax: fc.integer({ min: 0, max: 3 }),
    mazo: fc.record({
      normal: fc.integer({ min: 0, max: 12 }),
      pesado: fc.integer({ min: 0, max: 12 }),
      explosivo: fc.integer({ min: 0, max: 12 }),
    }),
    meta: fc.integer({ min: 1, max: 3000 }),
    multiplicadorPorOleada: fc.integer({ min: 0, max: 50 }),
    semilla: fc.integer({ min: 0, max: 0xffffffff }),
    enteros: fc.array(fc.nat(), { minLength: 1, maxLength: 64 }),
    corte: fc.nat(),
  })
  .filter((r) => r.mazo.normal + r.mazo.pesado + r.mazo.explosivo >= r.tamanoMano)
  .map((r) => ({
    config: {
      lado: r.lado,
      umbral: 4,
      tiradas: r.tiradas,
      tamanoMano: r.tamanoMano,
      siembra: { min: 0, max: r.siembraMax },
      mazo: r.mazo,
      meta: r.meta,
      multiplicadorPorOleada: r.multiplicadorPorOleada,
      topeOleadas: 1000,
    },
    semilla: r.semilla,
    enteros: r.enteros,
    corte: r.corte,
  }));

/** Crea la ronda del escenario, exigiendo una configuración válida. */
export function rondaDe(escenario: Escenario): { readonly estado: Estado; readonly eventos: readonly Evento[] } {
  const ronda = crearRonda(escenario.config, escenario.semilla);
  if (!ronda.ok) throw new Error(`configuración inválida: ${JSON.stringify(ronda.error)}`);
  return ronda.valor;
}
