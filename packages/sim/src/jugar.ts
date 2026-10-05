import { accionesLegales, aplicar, crearRonda } from '@pila/core';
import type { Accion, Config, Estado, Evento } from '@pila/core';
import { flujoDelBot } from './bot.ts';
import type { Bot } from './bot.ts';

export const MAX_ACCIONES_POR_DEFECTO = 10_000;

export type PartidaConBot = {
  readonly estado: Estado;
  readonly eventos: readonly Evento[];
  readonly acciones: readonly Accion[];
};

/**
 * Juega una ronda completa con un bot: `crearRonda`, y luego pide al bot una acción tras otra hasta la fase
 * terminal. El flujo de azar del bot sale de `flujoDelBot(semilla)`.
 *
 * @throws Error, con la semilla y el nombre del bot, si la configuración es inválida, si el bot devuelve una
 *   acción que `aplicar` rechaza o si la ronda supera `maxAcciones` acciones.
 */
export function jugarConBot(
  config: Config,
  semilla: number,
  bot: Bot,
  maxAcciones: number = MAX_ACCIONES_POR_DEFECTO,
): PartidaConBot {
  const contexto = `semilla ${semilla}, bot ${bot.nombre}`;
  const ronda = crearRonda(config, semilla);
  if (!ronda.ok) throw new Error(`configuración inválida (${contexto}): ${ronda.error.campo}: ${ronda.error.motivo}`);

  let estado = ronda.valor.estado;
  let azar = flujoDelBot(semilla);
  const eventos: Evento[] = [...ronda.valor.eventos];
  const acciones: Accion[] = [];
  while (estado.fase === 'colocando') {
    if (acciones.length >= maxAcciones) {
      throw new Error(`la ronda superó ${maxAcciones} acciones sin terminar (${contexto})`);
    }
    const [accion, siguiente] = bot.elegir(estado, accionesLegales(estado), azar);
    const paso = aplicar(estado, accion);
    if (!paso.ok) {
      throw new Error(`acción rechazada (${contexto}): ${JSON.stringify(accion)} → ${JSON.stringify(paso.error)}`);
    }
    azar = siguiente;
    acciones.push(accion);
    estado = paso.valor.estado;
    eventos.push(...paso.valor.eventos);
  }
  return { estado, eventos, acciones };
}
