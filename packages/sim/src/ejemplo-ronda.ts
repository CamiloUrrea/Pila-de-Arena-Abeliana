import { isDeepStrictEqual } from 'node:util';
import { CONFIG_INICIAL, reproducir } from '@pila/core';
import type { Accion, Config, Estado, Evento } from '@pila/core';
import { BOT_CICLICO } from './bots/ciclico.ts';
import { jugarConBot } from './jugar.ts';

/** Resultado de jugar una ronda de ejemplo y reproducirla. */
export type RondaJugada = {
  readonly semilla: number;
  readonly config: Config;
  /** Estado final, en fase `ganada` o `perdida`. */
  readonly estado: Estado;
  /** Eventos de `crearRonda` seguidos de los de cada acción. */
  readonly eventos: readonly Evento[];
  readonly acciones: readonly Accion[];
  /** Si `reproducir` con la misma configuración, semilla y acciones da exactamente el mismo estado y eventos. */
  readonly reproducible: boolean;
};

/**
 * Juega una ronda completa con un bot determinista sin azar propio y comprueba que es reproducible.
 *
 * Usa `BOT_CICLICO`: coloca cada grano sin colocar en la siguiente celda de un recorrido cíclico por filas
 * (el recorrido continúa entre tiradas) y confirma cuando la mano está completa.
 *
 * @param semilla Semilla de 32 bits sin signo de la ronda.
 * @param config Configuración de la ronda; por defecto `CONFIG_INICIAL`.
 * @returns La partida jugada, sus acciones y si `reproducir` la repite exactamente.
 * @throws Error si la configuración es inválida o una acción del bot es rechazada; RangeError si la semilla no es válida.
 */
export function jugarRonda(semilla: number, config: Config = CONFIG_INICIAL): RondaJugada {
  const { estado, eventos, acciones } = jugarConBot(config, semilla, BOT_CICLICO);

  const repeticion = reproducir(config, semilla, acciones);
  const reproducible = repeticion.ok && isDeepStrictEqual(repeticion.valor, { estado, eventos });
  return { semilla, config, estado, eventos, acciones, reproducible };
}

/** Texto del resumen de una ronda jugada: configuración, tiradas, fase, acciones, eventos y reproducibilidad. */
export function resumir(ronda: RondaJugada): string {
  const { config } = ronda;
  const lineas = [`semilla: ${ronda.semilla}`, `configuración: ${JSON.stringify(config)}`];
  let tirada = 0;
  for (const evento of ronda.eventos) {
    if (evento.tipo === 'TiradaConfirmada') tirada = evento.numero;
    if (evento.tipo === 'TiradaResuelta') {
      lineas.push(
        `tirada ${tirada}: ${evento.oleadas} oleadas, ${evento.granosFuera} granos fuera, ` +
          `+${evento.puntosGanados} → ${evento.puntosTotales} / ${config.meta} centésimas`,
      );
    }
  }
  lineas.push(`fase final: ${ronda.estado.fase}`, `acciones: ${ronda.acciones.length}`, `eventos: ${ronda.eventos.length}`);
  const porTipo = new Map<string, number>();
  for (const evento of ronda.eventos) porTipo.set(evento.tipo, (porTipo.get(evento.tipo) ?? 0) + 1);
  for (const [tipo, n] of porTipo) lineas.push(`  ${tipo}: ${n}`);
  lineas.push(`reproducible: ${ronda.reproducible ? 'sí' : 'NO'}`);
  return lineas.join('\n');
}

// Uso: pnpm --filter @pila/sim ejemplo -- <semilla>
if (import.meta.main) {
  const argumento = process.argv.slice(2).find((a) => a !== '--') ?? '1';
  const semilla = Number(argumento);
  if (!Number.isInteger(semilla) || semilla < 0 || semilla > 0xffffffff) {
    console.error(`semilla inválida: ${argumento} (debe ser un entero de 0 a 4294967295)`);
    process.exit(2);
  }
  const ronda = jugarRonda(semilla);
  console.log(resumir(ronda));
  if (!ronda.reproducible) process.exitCode = 1;
}
