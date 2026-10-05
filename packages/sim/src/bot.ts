import { derivarFlujo } from '@pila/core';
import type { Accion, Estado, EstadoFlujo } from '@pila/core';

/**
 * Contrato de un bot: una función pura que elige una acción.
 *
 * `elegir` recibe el estado, las acciones legales (`accionesLegales(estado)`, nunca vacías) y el estado de su
 * propio flujo de azar, y devuelve la acción elegida y el flujo siguiente. No debe guardar estado entre
 * llamadas: todo lo que necesite recordar debe poder deducirlo del estado de la ronda o de su flujo.
 */
export type Bot = {
  readonly nombre: string;
  elegir(estado: Estado, acciones: readonly Accion[], azar: EstadoFlujo): readonly [Accion, EstadoFlujo];
};

/**
 * Semilla del flujo de azar del bot para la ronda con semilla `semilla`.
 *
 * Multiplica por la constante áurea de 32 bits, suma una constante y aplica el finalizador de MurmurHash3
 * (`fmix32`, todo con `Math.imul`). Es una biyección de 32 bits que no se parece a la identidad: así el flujo
 * del bot no coincide en la práctica con los flujos `siembra` y `mazo` del juego, que `derivarFlujo` obtiene
 * de la semilla de la ronda con un XOR del nombre. Un XOR o una suma simple con la semilla podrían coincidir
 * con la derivación del juego para otra semilla y correlacionar el bot con el mazo.
 */
export function semillaDelBot(semilla: number): number {
  let h = (Math.imul(semilla, 0x9e3779b1) + 0x7f4a7c15) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Flujo de azar inicial del bot en la ronda con semilla `semilla`. */
export function flujoDelBot(semilla: number): EstadoFlujo {
  return derivarFlujo(semillaDelBot(semilla), 'mazo');
}
