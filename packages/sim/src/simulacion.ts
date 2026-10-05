import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Config, Evento } from '@pila/core';
import type { Bot } from './bot.ts';
import { MAX_ACCIONES_POR_DEFECTO, jugarConBot } from './jugar.ts';

/** Magnitudes de una tirada confirmada. Puntos en centésimas. */
export type RegistroTirada = {
  readonly oleadas: number;
  /** Tamaño de la avalancha: derrumbes de la tirada, sumando los de todas sus oleadas. */
  readonly derrumbes: number;
  readonly granosFuera: number;
  readonly puntosGanados: number;
};

/** Registro de una ronda simulada: lo necesario para las métricas de T2.4. */
export type RegistroRonda = {
  readonly semilla: number;
  readonly fase: 'ganada' | 'perdida';
  /** Puntos finales, en centésimas. */
  readonly puntos: number;
  /** Tiradas confirmadas. */
  readonly tiradas: number;
  readonly porTirada: readonly RegistroTirada[];
};

export type OpcionesRonda = { readonly maxAcciones?: number };

/** Resume por tirada los eventos de una ronda: oleadas, derrumbes, granos fuera y puntos de cada `Confirmar`. */
export function registrarTiradas(eventos: readonly Evento[]): RegistroTirada[] {
  const tiradas: RegistroTirada[] = [];
  let derrumbes = 0;
  for (const evento of eventos) {
    if (evento.tipo === 'TiradaConfirmada') derrumbes = 0;
    if (evento.tipo === 'Derrumbe') derrumbes++;
    if (evento.tipo === 'TiradaResuelta') {
      tiradas.push({
        oleadas: evento.oleadas,
        derrumbes,
        granosFuera: evento.granosFuera,
        puntosGanados: evento.puntosGanados,
      });
    }
  }
  return tiradas;
}

/**
 * Simula una ronda completa con un bot y devuelve su registro.
 *
 * @throws Error con la semilla y el bot si la ronda supera `opciones.maxAcciones` (10 000 por defecto),
 *   si el bot devuelve una acción rechazada o si la configuración es inválida.
 */
export function simularRonda(config: Config, semilla: number, bot: Bot, opciones: OpcionesRonda = {}): RegistroRonda {
  const { estado, eventos } = jugarConBot(config, semilla, bot, opciones.maxAcciones ?? MAX_ACCIONES_POR_DEFECTO);
  if (estado.fase === 'colocando') throw new Error(`la ronda no terminó (semilla ${semilla}, bot ${bot.nombre})`);
  const porTirada = registrarTiradas(eventos);
  return { semilla, fase: estado.fase, puntos: estado.puntos, tiradas: porTirada.length, porTirada };
}

/** Semilla de la ronda de índice global `indice`: `(semillaInicial + indice) mod 2^32`. */
export function semillaDeRonda(semillaInicial: number, indice: number): number {
  return (semillaInicial + indice) % 0x1_0000_0000;
}

/** Configuración con sus claves en el orden fijo de `Config`, para que el archivo no dependa de cómo se construyó. */
export function configOrdenada(config: Config): Config {
  return {
    lado: config.lado,
    umbral: config.umbral,
    tiradas: config.tiradas,
    tamanoMano: config.tamanoMano,
    siembra: { min: config.siembra.min, max: config.siembra.max },
    mazo: { normal: config.mazo.normal, pesado: config.mazo.pesado, explosivo: config.mazo.explosivo },
    meta: config.meta,
    multiplicadorPorOleada: config.multiplicadorPorOleada,
    topeOleadas: config.topeOleadas,
  };
}

export type ParametrosLote = {
  readonly config: Config;
  readonly bot: Bot;
  readonly semillaInicial: number;
  /** Índice global de la primera ronda del lote. */
  readonly desde: number;
  readonly rondas: number;
  /** Ruta del archivo JSONL; se crea su directorio si no existe y se sobrescribe. */
  readonly salida: string;
  readonly opciones?: OpcionesRonda;
};

export type ResumenLote = { readonly rondas: number; readonly ganadas: number; readonly perdidas: number };

/** Líneas que se agrupan antes de escribir: el archivo se escribe en streaming, sin acumular el lote. */
const LINEAS_POR_ESCRITURA = 256;

/**
 * Simula las rondas de índice global `desde` a `desde + rondas − 1` y las escribe en un archivo JSONL:
 * una cabecera y una línea por ronda, con claves en orden fijo y sin nada que cambie entre ejecuciones.
 * Los mismos parámetros dan el mismo archivo byte a byte.
 */
export function simularLote(parametros: ParametrosLote): ResumenLote {
  const { config, bot, semillaInicial, desde, rondas, salida } = parametros;
  mkdirSync(dirname(salida), { recursive: true });
  const archivo = openSync(salida, 'w');
  let ganadas = 0;
  try {
    const cabecera = {
      tipo: 'cabecera',
      formato: 1,
      bot: bot.nombre,
      config: configOrdenada(config),
      semillaInicial,
      desde,
      rondas,
    };
    let pendiente = `${JSON.stringify(cabecera)}\n`;
    let enCola = 0;
    for (let indice = desde; indice < desde + rondas; indice++) {
      const registro = simularRonda(config, semillaDeRonda(semillaInicial, indice), bot, parametros.opciones);
      if (registro.fase === 'ganada') ganadas++;
      const linea = {
        tipo: 'ronda',
        indice,
        semilla: registro.semilla,
        fase: registro.fase,
        puntos: registro.puntos,
        tiradas: registro.tiradas,
        porTirada: registro.porTirada.map((t) => ({
          oleadas: t.oleadas,
          derrumbes: t.derrumbes,
          granosFuera: t.granosFuera,
          puntosGanados: t.puntosGanados,
        })),
      };
      pendiente += `${JSON.stringify(linea)}\n`;
      if (++enCola >= LINEAS_POR_ESCRITURA) {
        writeSync(archivo, pendiente);
        pendiente = '';
        enCola = 0;
      }
    }
    if (pendiente !== '') writeSync(archivo, pendiente);
  } finally {
    closeSync(archivo);
  }
  return { rondas, ganadas, perdidas: rondas - ganadas };
}
