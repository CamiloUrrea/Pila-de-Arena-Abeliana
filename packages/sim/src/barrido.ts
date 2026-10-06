import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { CONFIG_INICIAL, validarConfig } from '@pila/core';
import type { Config } from '@pila/core';
import type { Bot } from './bot.ts';
import { BOTS } from './bots/index.ts';
import {
  Grupo,
  analizarAvalanchas,
  decimal,
  intervalo,
  marcaHabilidad,
  opcional,
  pares,
  porcentaje,
  puntos,
  puntosPorcentuales,
  tabla,
  tasa,
  ventajaDeHabilidad,
} from './informe.ts';
import { configOrdenada, semillaDeRonda, simularRonda } from './simulacion.ts';

/**
 * Meta inalcanzable con la que se simula el potencial. Ningún bot mira la meta y los puntos nunca bajan, así que
 * la ronda de una semilla con meta M se gana si y solo si su potencial es mayor o igual que M.
 */
export const META_INALCANZABLE = 1_000_000;

/** Objetivos de tasa de victoria del aleatorio por defecto. */
export const OBJETIVOS_POR_DEFECTO: readonly number[] = [0.7, 0.5, 0.3];

/** Error de uso: se informa con su mensaje y código de salida 2. */
export class ErrorDeBarrido extends Error {}

/** Potencial de un bot en una configuración: puntos finales por semilla con meta inalcanzable, y sus métricas. */
export type Potencial = {
  readonly bot: string;
  /** Puntos finales de cada semilla, en centésimas. */
  readonly porSemilla: ReadonlyMap<number, number>;
  /** Acumulador del informe con las mismas rondas: puntos, avalanchas y oleadas. */
  readonly grupo: Grupo;
};

/**
 * Simula `rondas` rondas en memoria (semillas `semillaDeRonda(semillaInicial, i)`) con una configuración cuya meta
 * debe ser inalcanzable.
 *
 * @throws Error si alguna ronda se gana: la meta no era inalcanzable y el potencial estaría truncado.
 */
export function simularPotencial(config: Config, bot: Bot, semillaInicial: number, rondas: number): Potencial {
  const ordenada = configOrdenada(config);
  const grupo = new Grupo(bot.nombre, ordenada, JSON.stringify(ordenada));
  const porSemilla = new Map<number, number>();
  for (let indice = 0; indice < rondas; indice++) {
    const r = simularRonda(config, semillaDeRonda(semillaInicial, indice), bot);
    if (r.fase === 'ganada') {
      throw new Error(`la meta ${config.meta} no es inalcanzable: el bot ${bot.nombre} gana la semilla ${r.semilla}`);
    }
    porSemilla.set(r.semilla, r.puntos);
    grupo.agregar({ semilla: r.semilla, ganada: false, puntos: r.puntos, porTirada: [...r.porTirada] }, `semilla ${r.semilla}`);
  }
  return { bot: bot.nombre, porSemilla, grupo };
}

/** Victorias por semilla con la meta dada, derivadas del potencial: se gana si y solo si potencial ≥ meta. */
export function victoriasConMeta(potencial: ReadonlyMap<number, number>, meta: number): Map<number, boolean> {
  const victorias = new Map<number, boolean>();
  for (const [semilla, puntosFinales] of potencial) victorias.set(semilla, puntosFinales >= meta);
  return victorias;
}

/**
 * Posición ⌈objetivo · n⌉ (desde 1), calculada de forma exacta sobre la escritura decimal del objetivo para que,
 * por ejemplo, 0,7 · 20000 dé 14000 y no 14001 por el redondeo binario.
 */
export function posicionObjetivo(objetivo: number, n: number): number {
  const texto = String(objetivo);
  if (/e/i.test(texto)) return Math.ceil(objetivo * n);
  const [entera = '', fraccion = ''] = texto.split('.');
  const denominador = 10 ** fraccion.length;
  const numerador = Number(entera + fraccion) * n + denominador - 1;
  return (numerador - (numerador % denominador)) / denominador;
}

/**
 * Meta objetivo: el mayor entero M (en centésimas) para el que la fracción de potenciales ≥ M es al menos
 * `objetivo`. Es el elemento de posición ⌈objetivo · n⌉ (desde 1) de los potenciales ordenados de mayor a menor.
 */
export function metaObjetivo(potenciales: readonly number[], objetivo: number): number {
  if (potenciales.length === 0) throw new RangeError('no hay potenciales');
  if (!(objetivo > 0 && objetivo <= 1)) throw new RangeError(`el objetivo debe estar en (0, 1]: ${objetivo}`);
  const ordenados = [...potenciales].sort((a, b) => b - a);
  const meta = ordenados[posicionObjetivo(objetivo, ordenados.length) - 1];
  if (meta === undefined) throw new RangeError(`posición fuera de rango para el objetivo ${objetivo}`);
  return meta;
}

export type ParametrosBarrido = {
  readonly lados: readonly number[];
  readonly multiplicadores: readonly number[];
  readonly rondas: number;
  readonly semillaInicial: number;
  readonly objetivos: readonly number[];
  /** Avisos de progreso (no forman parte de la salida). */
  readonly progreso?: ((linea: string) => void) | undefined;
};

type Combinacion = { readonly lado: number; readonly multiplicador: number; readonly potenciales: readonly Potencial[] };

/** Configuración de una combinación: `CONFIG_INICIAL` con el lado, el multiplicador y la meta inalcanzable. */
export function configDeBarrido(lado: number, multiplicador: number): Config {
  const config: Config = { ...CONFIG_INICIAL, lado, multiplicadorPorOleada: multiplicador, meta: META_INALCANZABLE };
  const valida = validarConfig(config);
  if (!valida.ok) {
    throw new ErrorDeBarrido(`configuración inválida (lado ${lado}, multiplicador ${multiplicador}): ${valida.error.campo}: ${valida.error.motivo}`);
  }
  return config;
}

/** Ejecuta el barrido y devuelve su informe en Markdown, determinista (sin marcas de tiempo). */
export function barrer(p: ParametrosBarrido): string {
  const bots = Object.keys(BOTS).sort();
  const combinaciones: Combinacion[] = [];
  for (const lado of p.lados) {
    for (const multiplicador of p.multiplicadores) {
      const config = configDeBarrido(lado, multiplicador);
      const potenciales = bots.map((nombre) => {
        const bot = BOTS[nombre];
        if (bot === undefined) throw new Error(`bot desconocido: ${nombre}`);
        const inicio = performance.now();
        const potencial = simularPotencial(config, bot, p.semillaInicial, p.rondas);
        p.progreso?.(`lado ${lado}, multiplicador ${multiplicador}, ${nombre}: ${((performance.now() - inicio) / 1000).toFixed(1)} s`);
        return potencial;
      });
      combinaciones.push({ lado, multiplicador, potenciales });
    }
  }
  return renderizarBarrido(p, bots, combinaciones);
}

function renderizarBarrido(p: ParametrosBarrido, bots: readonly string[], combinaciones: readonly Combinacion[]): string {
  const l: string[] = ['# Barrido de configuraciones', ''];
  l.push(
    `Base: \`CONFIG_INICIAL\` con \`lado\` y \`multiplicadorPorOleada\` variables y \`meta\` ${META_INALCANZABLE} (inalcanzable). ` +
      `${p.rondas} rondas por bot y configuración, semilla inicial ${p.semillaInicial}. Bots: ${bots.join(', ')}.`,
    '',
    'Potencial: puntos finales de una semilla con la meta inalcanzable. Como ningún bot mira la meta y los puntos nunca bajan, ' +
      'la ronda de esa semilla con meta M se gana si y solo si su potencial es mayor o igual que M.',
    '',
  );

  l.push('## A) Potencial', '', 'Puntos potenciales por ronda, en puntos (centésimas entre 100).', '');
  l.push(
    ...tabla(
      ['Lado', 'Multiplicador', 'Bot', 'Media', 'Desviación'],
      combinaciones.flatMap((c) =>
        c.potenciales.map((pot) => [
          String(c.lado),
          String(c.multiplicador),
          pot.bot,
          puntos(pot.grupo.puntos.media),
          opcional(pot.grupo.puntos.desviacion, puntos),
        ]),
      ),
    ),
    '',
  );

  const metas = combinaciones.map((c) => {
    const aleatorio = c.potenciales.find((pot) => pot.bot === 'aleatorio');
    if (aleatorio === undefined) throw new Error('el barrido necesita el bot aleatorio');
    return p.objetivos.map((objetivo) => metaObjetivo([...aleatorio.porSemilla.values()], objetivo));
  });

  l.push(
    '## B) Metas objetivo',
    '',
    'Mayor meta con la que el aleatorio gana al menos la fracción objetivo de las rondas: el elemento de posición ⌈objetivo · n⌉ de sus potenciales ordenados de mayor a menor. En puntos.',
    '',
  );
  l.push(
    ...tabla(
      ['Lado', 'Multiplicador', 'Objetivo', 'Meta'],
      combinaciones.flatMap((c, i) =>
        p.objetivos.map((objetivo, j) => [String(c.lado), String(c.multiplicador), porcentaje(objetivo), puntos(metas[i]?.[j] ?? 0)]),
      ),
    ),
    '',
  );

  l.push(
    '## C) Habilidad',
    '',
    'Tasa de victoria de cada bot con la meta objetivo, derivada de los potenciales, y ventaja del mejor de avaro y cargador sobre el aleatorio, emparejada por semilla, con su intervalo al 95 % y la marca de la alarma (f).',
    '',
  );
  l.push(
    ...tabla(
      ['Lado', 'Multiplicador', 'Objetivo', 'Meta', ...bots, 'Mejor', 'Pares', 'Ventaja', 'IC 95 %', 'Alarma (f)'],
      combinaciones.flatMap((c, i) =>
        p.objetivos.map((objetivo, j) => {
          const meta = metas[i]?.[j] ?? 0;
          const resultados = c.potenciales.map((pot) => ({ bot: pot.bot, porSemilla: victoriasConMeta(pot.porSemilla, meta) }));
          const h = ventajaDeHabilidad(resultados);
          const fila = [
            String(c.lado),
            String(c.multiplicador),
            porcentaje(objetivo),
            puntos(meta),
            ...bots.map((bot) => {
              const r = resultados.find((x) => x.bot === bot);
              return r === undefined ? '—' : porcentaje(tasa(r.porSemilla));
            }),
          ];
          if (h === undefined) return [...fila, '—', '—', '—', '—', '—'];
          return [
            ...fila,
            h.mejor,
            pares(h.diferencia.n, h.mejor, h.semillasMejor, 'aleatorio', h.semillasAleatorio),
            puntosPorcentuales(h.diferencia.media),
            h.diferencia.intervalo === undefined ? '—' : intervalo(h.diferencia.intervalo, puntosPorcentuales),
            marcaHabilidad(h),
          ];
        }),
      ),
    ),
    '',
  );

  const primero = p.multiplicadores[0];
  l.push(
    '## D) Avalanchas',
    '',
    `Por lado, con multiplicador ${primero} (el multiplicador no cambia las avalanchas). Tamaño de una avalancha: derrumbes de una tirada, sobre las tiradas con al menos un derrumbe; percentiles por rango más cercano. «Top 10 %»: parte del total de derrumbes que causa el 10 % de avalanchas más grandes.`,
    '',
  );
  l.push(
    ...tabla(
      ['Lado', 'Bot', 'Media', 'Mediana', 'P90', 'Máximo', 'Top 10 %', 'Oleadas máximas'],
      combinaciones
        .filter((c) => c.multiplicador === primero)
        .flatMap((c) =>
          c.potenciales.map((pot) => {
            const v = analizarAvalanchas(pot.grupo);
            return [
              String(c.lado),
              pot.bot,
              opcional(v.media, (x) => decimal(x, 2)),
              opcional(v.mediana, String),
              opcional(v.percentil90, String),
              opcional(v.maximo, String),
              porcentaje(v.parteDelDiezPorCiento),
              String(pot.grupo.oleadasMaximas),
            ];
          }),
        ),
    ),
  );
  return `${l.join('\n')}\n`;
}

// ---------------------------------------------------------------------------------------------------------------
// Línea de comandos.

function lista<T>(texto: string | undefined, opcion: string, convertir: (parte: string) => T | undefined, requisito: string): T[] {
  if (texto === undefined) throw new ErrorDeBarrido(`falta la opción obligatoria --${opcion}`);
  const partes = texto.split(',').map((x) => x.trim());
  const valores: T[] = [];
  for (const parte of partes) {
    const valor = parte === '' ? undefined : convertir(parte);
    if (valor === undefined) throw new ErrorDeBarrido(`--${opcion}: «${parte}» no es válido; ${requisito}`);
    if (valores.includes(valor)) throw new ErrorDeBarrido(`--${opcion}: el valor ${parte} está repetido`);
    valores.push(valor);
  }
  return valores;
}

const enteroEntre =
  (min: number, max: number) =>
  (parte: string): number | undefined => {
    const valor = Number(parte);
    return Number.isInteger(valor) && valor >= min && valor <= max ? valor : undefined;
  };

const fraccionAbierta = (parte: string): number | undefined => {
  const valor = Number(parte);
  return Number.isFinite(valor) && valor > 0 && valor < 1 ? valor : undefined;
};

function unEntero(texto: string | undefined, opcion: string, porDefecto: number | undefined, min: number, max: number): number {
  if (texto === undefined) {
    if (porDefecto === undefined) throw new ErrorDeBarrido(`falta la opción obligatoria --${opcion}`);
    return porDefecto;
  }
  const valor = texto.trim() === '' ? undefined : enteroEntre(min, max)(texto);
  if (valor === undefined) throw new ErrorDeBarrido(`--${opcion} debe ser un entero de ${min} a ${max}: ${texto}`);
  return valor;
}

export type Salidas = {
  readonly escribir: (texto: string) => void;
  readonly error: (linea: string) => void;
  readonly progreso?: ((linea: string) => void) | undefined;
};

const CONSOLA: Salidas = {
  escribir: (t) => process.stdout.write(t),
  error: (l) => console.error(l),
  progreso: (l) => console.error(l),
};

/**
 * Línea de comandos del barrido. Devuelve 0 si todo fue bien, 2 ante un error de uso o una configuración
 * inválida y 1 si la simulación falla.
 */
export function principal(argv: readonly string[], salidas: Salidas = CONSOLA): number {
  try {
    const args = argv[0] === '--' ? argv.slice(1) : [...argv];
    let values;
    try {
      ({ values } = parseArgs({
        args,
        options: {
          lados: { type: 'string' },
          multiplicadores: { type: 'string' },
          rondas: { type: 'string' },
          semilla: { type: 'string' },
          objetivos: { type: 'string' },
          salida: { type: 'string' },
        },
        strict: true,
        allowPositionals: false,
      }));
    } catch (error) {
      throw new ErrorDeBarrido(error instanceof Error ? error.message : String(error));
    }
    const lados = lista(values.lados, 'lados', enteroEntre(1, 8), 'cada lado debe ser un entero de 1 a 8');
    const multiplicadores = lista(
      values.multiplicadores,
      'multiplicadores',
      enteroEntre(0, Number.MAX_SAFE_INTEGER),
      'cada multiplicador debe ser un entero mayor o igual que 0 (en centésimas)',
    );
    const rondas = unEntero(values.rondas, 'rondas', undefined, 1, Number.MAX_SAFE_INTEGER);
    const semillaInicial = unEntero(values.semilla, 'semilla', 1, 0, 0xffffffff);
    const objetivos =
      values.objetivos === undefined
        ? [...OBJETIVOS_POR_DEFECTO]
        : lista(values.objetivos, 'objetivos', fraccionAbierta, 'cada objetivo debe ser un número estrictamente entre 0 y 1');
    // Valida todas las configuraciones antes de simular nada.
    for (const lado of lados) for (const m of multiplicadores) configDeBarrido(lado, m);

    const texto = barrer({ lados, multiplicadores, rondas, semillaInicial, objetivos, progreso: salidas.progreso });
    salidas.escribir(texto);
    if (values.salida !== undefined) {
      mkdirSync(dirname(values.salida), { recursive: true });
      writeFileSync(values.salida, texto);
    }
    return 0;
  } catch (error) {
    if (error instanceof ErrorDeBarrido) {
      salidas.error(`error: ${error.message}`);
      return 2;
    }
    salidas.error(`error en el barrido: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

// Uso: pnpm --filter @pila/sim barrido -- --lados 3,4,5 --multiplicadores 10,25,50,100 --rondas 20000
//      [--semilla 1] [--objetivos 0.7,0.5,0.3] [--salida barrido.md]
if (import.meta.main) process.exitCode = principal(process.argv.slice(2));
