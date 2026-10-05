import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { CONFIG_INICIAL, validarConfig } from '@pila/core';
import type { Config, TipoGrano } from '@pila/core';
import { BOTS } from './bots/index.ts';
import { simularLote } from './simulacion.ts';

/** Campos numéricos de primer nivel que admite `--set campo=valor`. */
type CampoSet = 'lado' | 'umbral' | 'tiradas' | 'tamanoMano' | 'meta' | 'multiplicadorPorOleada' | 'topeOleadas';
const CAMPOS_SET: readonly CampoSet[] = ['lado', 'umbral', 'tiradas', 'tamanoMano', 'meta', 'multiplicadorPorOleada', 'topeOleadas'];
const TIPOS: readonly TipoGrano[] = ['normal', 'pesado', 'explosivo'];

/** Error de uso o de configuración: se informa con su mensaje y código de salida 2. */
class ErrorDeUso extends Error {}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function numero(valor: unknown, campo: string): number {
  if (typeof valor !== 'number') throw new ErrorDeUso(`--config: ${campo} debe ser un número`);
  return valor;
}

function esCampoSet(campo: string): campo is CampoSet {
  return CAMPOS_SET.some((c) => c === campo);
}

/** Aplica las anulaciones parciales de `--config`, con fusión profunda en `siembra` y `mazo`. */
export function fusionarConfig(base: Config, anulaciones: unknown): Config {
  if (!esObjeto(anulaciones)) throw new ErrorDeUso('--config: el archivo debe contener un objeto JSON');
  let config: Config = base;
  for (const [campo, valor] of Object.entries(anulaciones)) {
    if (campo === 'siembra') {
      if (!esObjeto(valor)) throw new ErrorDeUso('--config: siembra debe ser un objeto');
      let siembra = config.siembra;
      for (const [clave, v] of Object.entries(valor)) {
        if (clave !== 'min' && clave !== 'max') throw new ErrorDeUso(`--config: campo desconocido siembra.${clave}`);
        siembra = { ...siembra, [clave]: numero(v, `siembra.${clave}`) };
      }
      config = { ...config, siembra };
    } else if (campo === 'mazo') {
      if (!esObjeto(valor)) throw new ErrorDeUso('--config: mazo debe ser un objeto');
      let mazo = config.mazo;
      for (const [clave, v] of Object.entries(valor)) {
        const tipo = TIPOS.find((t) => t === clave);
        if (tipo === undefined) throw new ErrorDeUso(`--config: campo desconocido mazo.${clave}`);
        mazo = { ...mazo, [tipo]: numero(v, `mazo.${clave}`) };
      }
      config = { ...config, mazo };
    } else if (esCampoSet(campo)) {
      config = { ...config, [campo]: numero(valor, campo) };
    } else {
      throw new ErrorDeUso(`--config: campo desconocido ${campo}`);
    }
  }
  return config;
}

/** Aplica una anulación `--set campo=valor` sobre un campo numérico de primer nivel. */
export function aplicarSet(config: Config, asignacion: string): Config {
  const igual = asignacion.indexOf('=');
  const campo = asignacion.slice(0, igual);
  const texto = asignacion.slice(igual + 1);
  if (igual < 0 || !esCampoSet(campo)) {
    throw new ErrorDeUso(`--set ${asignacion}: el campo debe ser uno de ${CAMPOS_SET.join(', ')} (formato campo=valor)`);
  }
  const valor = Number(texto);
  if (texto.trim() === '' || Number.isNaN(valor)) throw new ErrorDeUso(`--set ${asignacion}: el valor debe ser un número`);
  return { ...config, [campo]: valor };
}

function entero(texto: string | undefined, opcion: string, porDefecto: number | undefined, min: number, max: number): number {
  if (texto === undefined) {
    if (porDefecto === undefined) throw new ErrorDeUso(`falta la opción obligatoria --${opcion}`);
    return porDefecto;
  }
  const valor = Number(texto);
  if (texto.trim() === '' || !Number.isInteger(valor) || valor < min || valor > max) {
    throw new ErrorDeUso(`--${opcion} debe ser un entero de ${min} a ${max}: ${texto}`);
  }
  return valor;
}

export type Salidas = { readonly escribir: (linea: string) => void; readonly error: (linea: string) => void };

const CONSOLA: Salidas = { escribir: (l) => console.log(l), error: (l) => console.error(l) };

/**
 * Línea de comandos del simulador. Devuelve el código de salida: 0 si todo fue bien, 2 ante un error de uso o
 * de configuración (incluido un bot desconocido) y 1 si la simulación falla.
 */
export function principal(argv: readonly string[], salidas: Salidas = CONSOLA): number {
  try {
    // pnpm pasa el separador `--` tal cual; si no se quita, parseArgs trataría todo como posicional.
    const args = argv[0] === '--' ? argv.slice(1) : [...argv];
    const { values } = parseArgs({
      args,
      options: {
        bot: { type: 'string' },
        rondas: { type: 'string' },
        semilla: { type: 'string' },
        desde: { type: 'string' },
        salida: { type: 'string' },
        config: { type: 'string' },
        set: { type: 'string', multiple: true },
      },
      strict: true,
      allowPositionals: false,
    });

    if (values.bot === undefined) throw new ErrorDeUso(`falta --bot; disponibles: ${Object.keys(BOTS).join(', ')}`);
    const bot = BOTS[values.bot];
    if (bot === undefined) {
      throw new ErrorDeUso(`bot desconocido: ${values.bot}; disponibles: ${Object.keys(BOTS).join(', ')}`);
    }
    const rondas = entero(values.rondas, 'rondas', undefined, 1, Number.MAX_SAFE_INTEGER);
    const semillaInicial = entero(values.semilla, 'semilla', 1, 0, 0xffffffff);
    const desde = entero(values.desde, 'desde', 0, 0, Number.MAX_SAFE_INTEGER);

    let config: Config = CONFIG_INICIAL;
    if (values.config !== undefined) {
      let json: unknown;
      try {
        json = JSON.parse(readFileSync(values.config, 'utf8'));
      } catch (error) {
        throw new ErrorDeUso(`--config ${values.config}: ${error instanceof Error ? error.message : String(error)}`);
      }
      config = fusionarConfig(config, json);
    }
    for (const asignacion of values.set ?? []) config = aplicarSet(config, asignacion);
    const valida = validarConfig(config);
    if (!valida.ok) throw new ErrorDeUso(`configuración inválida: ${valida.error.campo}: ${valida.error.motivo}`);

    const salida = resolve(values.salida ?? join('resultados', `${bot.nombre}-${semillaInicial}-${desde}-${rondas}.jsonl`));
    const inicio = performance.now();
    const resumen = simularLote({ config, bot, semillaInicial, desde, rondas, salida });
    const segundos = (performance.now() - inicio) / 1000;

    salidas.escribir(`bot: ${bot.nombre}`);
    salidas.escribir(`rondas: ${resumen.rondas} (índices ${desde} a ${desde + rondas - 1}, semilla inicial ${semillaInicial})`);
    salidas.escribir(`ganadas: ${resumen.ganadas}`);
    salidas.escribir(`perdidas: ${resumen.perdidas}`);
    salidas.escribir(`ganadas (%): ${((100 * resumen.ganadas) / resumen.rondas).toFixed(2)} %`);
    salidas.escribir(`archivo: ${salida}`);
    salidas.escribir(`tiempo: ${segundos.toFixed(2)} s`);
    salidas.escribir(`rondas por segundo: ${Math.round(resumen.rondas / segundos)}`);
    return 0;
  } catch (error) {
    if (error instanceof ErrorDeUso || (error instanceof TypeError && 'code' in error)) {
      salidas.error(`error: ${error.message}`);
      return 2;
    }
    salidas.error(`error en la simulación: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

// Uso: pnpm --filter @pila/sim simular -- --bot ciclico --rondas 1000 [--semilla 1] [--desde 0] [--salida f.jsonl]
//      [--config anulaciones.json] [--set campo=valor ...]
if (import.meta.main) process.exitCode = principal(process.argv.slice(2));
