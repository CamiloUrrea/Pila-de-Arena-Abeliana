import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import type { Config } from '@pila/core';
import { Recuento, Resumen, TRAMOS_AVALANCHA, diferenciaPorPares, wilson } from './estadistica.ts';
import type { DiferenciaPorPares, Intervalo } from './estadistica.ts';
import { configOrdenada } from './simulacion.ts';

/** Umbrales de las alarmas del informe, documentados en docs/simulador.md. */
export const UMBRALES_ALARMA: {
  readonly aleatorioMaximo: number;
  readonly aleatorioMinimo: number;
  readonly coeficienteVariacionMinimo: number;
  readonly fraccionTopeOleadas: number;
  readonly ventajaHabilidadMinimaPp: number;
} = {
  /** (a) El bot aleatorio gana más de esta fracción de rondas: la configuración es demasiado fácil. */
  aleatorioMaximo: 0.9,
  /** (a) El bot aleatorio gana menos de esta fracción de rondas: la configuración es demasiado difícil. */
  aleatorioMinimo: 0.1,
  /** (d) Coeficiente de variación de las avalanchas por debajo del cual son «casi todas del mismo tamaño». */
  coeficienteVariacionMinimo: 0.3,
  /** (e) Fracción de `topeOleadas` a partir de la cual las oleadas máximas son sospechosas. */
  fraccionTopeOleadas: 0.5,
  /**
   * (f) Ventaja mínima, en puntos porcentuales, del mejor bot con estrategia (avaro o cargador) sobre el aleatorio.
   * Umbral inicial, revisable.
   */
  ventajaHabilidadMinimaPp: 10,
};

/** Bots con estrategia que se comparan con el aleatorio en la alarma (f), en orden de preferencia ante empate. */
export const BOTS_HABILIDAD: readonly string[] = ['avaro', 'cargador'];

/** Texto de una alarma que no se evalúa porque ningún bot gana en la configuración. */
export const NO_EVALUADA = 'no evaluada: meta inalcanzable (nadie gana)';

/** Fracción de las avalanchas más grandes cuya parte del total de derrumbes se informa. */
const FRACCION_MAYORES = 0.1;

const NOTA_TRUNCADOS =
  'los puntos de las rondas ganadas están truncados por la victoria; para medir la varianza real usa una meta inalcanzable';

/** Error de entrada o de uso: se informa con un mensaje claro y código de salida 2. */
export class ErrorDeInforme extends Error {}

// ---------------------------------------------------------------------------------------------------------------
// Lectura y validación de los archivos JSONL.

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function numeroEn(objeto: Record<string, unknown>, campo: string, donde: string): number {
  const valor = objeto[campo];
  if (typeof valor !== 'number' || !Number.isFinite(valor)) throw new ErrorDeInforme(`${donde}: «${campo}» debe ser un número`);
  return valor;
}

function objetoEn(objeto: Record<string, unknown>, campo: string, donde: string): Record<string, unknown> {
  const valor = objeto[campo];
  if (!esObjeto(valor)) throw new ErrorDeInforme(`${donde}: «${campo}» debe ser un objeto`);
  return valor;
}

function leerConfig(valor: Record<string, unknown>, donde: string): Config {
  const siembra = objetoEn(valor, 'siembra', `${donde}, config`);
  const mazo = objetoEn(valor, 'mazo', `${donde}, config`);
  const d = `${donde}, config`;
  return {
    lado: numeroEn(valor, 'lado', d),
    umbral: numeroEn(valor, 'umbral', d),
    tiradas: numeroEn(valor, 'tiradas', d),
    tamanoMano: numeroEn(valor, 'tamanoMano', d),
    siembra: { min: numeroEn(siembra, 'min', `${d}.siembra`), max: numeroEn(siembra, 'max', `${d}.siembra`) },
    mazo: {
      normal: numeroEn(mazo, 'normal', `${d}.mazo`),
      pesado: numeroEn(mazo, 'pesado', `${d}.mazo`),
      explosivo: numeroEn(mazo, 'explosivo', `${d}.mazo`),
    },
    meta: numeroEn(valor, 'meta', d),
    multiplicadorPorOleada: numeroEn(valor, 'multiplicadorPorOleada', d),
    topeOleadas: numeroEn(valor, 'topeOleadas', d),
  };
}

type Cabecera = { readonly bot: string; readonly config: Config };

function leerCabecera(json: unknown, donde: string): Cabecera {
  if (!esObjeto(json) || json['tipo'] !== 'cabecera') {
    throw new ErrorDeInforme(`${donde}: la primera línea debe ser la cabecera ({"tipo":"cabecera",…})`);
  }
  if (json['formato'] !== 1) {
    throw new ErrorDeInforme(`${donde}: formato desconocido ${JSON.stringify(json['formato'])}; este informe lee el formato 1`);
  }
  const bot = json['bot'];
  if (typeof bot !== 'string' || bot === '') throw new ErrorDeInforme(`${donde}: «bot» debe ser un texto`);
  return { bot, config: leerConfig(objetoEn(json, 'config', donde), donde) };
}

type Tirada = { readonly oleadas: number; readonly derrumbes: number };
type Ronda = { readonly semilla: number; readonly ganada: boolean; readonly puntos: number; readonly porTirada: Tirada[] };

function leerRonda(json: unknown, donde: string): Ronda {
  if (!esObjeto(json) || json['tipo'] !== 'ronda') throw new ErrorDeInforme(`${donde}: se esperaba una línea de ronda`);
  const fase = json['fase'];
  if (fase !== 'ganada' && fase !== 'perdida') throw new ErrorDeInforme(`${donde}: «fase» debe ser ganada o perdida`);
  const porTirada = json['porTirada'];
  if (!Array.isArray(porTirada)) throw new ErrorDeInforme(`${donde}: «porTirada» debe ser una lista`);
  const tiradas = numeroEn(json, 'tiradas', donde);
  if (porTirada.length !== tiradas) throw new ErrorDeInforme(`${donde}: «porTirada» no tiene «tiradas» elementos`);
  return {
    semilla: numeroEn(json, 'semilla', donde),
    ganada: fase === 'ganada',
    puntos: numeroEn(json, 'puntos', donde),
    porTirada: porTirada.map((t: unknown, i) => {
      if (!esObjeto(t)) throw new ErrorDeInforme(`${donde}: porTirada[${i}] debe ser un objeto`);
      return { oleadas: numeroEn(t, 'oleadas', `${donde}, porTirada[${i}]`), derrumbes: numeroEn(t, 'derrumbes', `${donde}, porTirada[${i}]`) };
    }),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Agregación por grupo (bot y configuración), en streaming.

/** Acumulador en streaming de las rondas de un grupo (bot y configuración). */
export class Grupo {
  rondas = 0;
  ganadas = 0;
  /** Resultado por semilla, para emparejar bots. */
  readonly porSemilla = new Map<number, boolean>();
  readonly puntos = new Resumen();
  tiradas = 0;
  tiradasSinDerrumbes = 0;
  readonly avalanchas = new Recuento();
  oleadasMaximas = 0;

  readonly bot: string;
  readonly config: Config;
  readonly claveConfig: string;

  constructor(bot: string, config: Config, claveConfig: string) {
    this.bot = bot;
    this.config = config;
    this.claveConfig = claveConfig;
  }

  agregar(ronda: Ronda, donde: string): void {
    if (this.porSemilla.has(ronda.semilla)) {
      throw new ErrorDeInforme(`${donde}: la semilla ${ronda.semilla} ya apareció para el bot ${this.bot} con esta configuración`);
    }
    this.porSemilla.set(ronda.semilla, ronda.ganada);
    this.rondas++;
    if (ronda.ganada) this.ganadas++;
    this.puntos.agregar(ronda.puntos);
    for (const { oleadas, derrumbes } of ronda.porTirada) {
      this.tiradas++;
      if (derrumbes === 0) this.tiradasSinDerrumbes++;
      else this.avalanchas.agregar(derrumbes);
      this.oleadasMaximas = Math.max(this.oleadasMaximas, oleadas);
    }
  }
}

export type ArchivoLeido = { readonly nombre: string; readonly bot: string; readonly rondas: number };

async function leerArchivo(ruta: string, grupos: Map<string, Grupo>): Promise<ArchivoLeido> {
  const nombre = basename(ruta);
  const lector = createInterface({ input: createReadStream(ruta, { encoding: 'utf8' }), crlfDelay: Infinity });
  let cabecera: Cabecera | undefined;
  let grupo: Grupo | undefined;
  let rondas = 0;
  let numero = 0;
  try {
    for await (const linea of lector) {
      numero++;
      if (linea.trim() === '') continue;
      const donde = `${nombre}, línea ${numero}`;
      let json: unknown;
      try {
        json = JSON.parse(linea);
      } catch {
        throw new ErrorDeInforme(`${donde}: no es JSON válido`);
      }
      if (cabecera === undefined) {
        cabecera = leerCabecera(json, donde);
        const config = configOrdenada(cabecera.config);
        const claveConfig = JSON.stringify(config);
        const clave = `${cabecera.bot}\u0000${claveConfig}`;
        grupo = grupos.get(clave) ?? new Grupo(cabecera.bot, config, claveConfig);
        grupos.set(clave, grupo);
        continue;
      }
      grupo?.agregar(leerRonda(json, donde), donde);
      rondas++;
    }
  } catch (error) {
    if (error instanceof ErrorDeInforme) throw error;
    throw new ErrorDeInforme(`${nombre}: no se puede leer (${error instanceof Error ? error.message : String(error)})`);
  } finally {
    lector.close();
  }
  if (cabecera === undefined) throw new ErrorDeInforme(`${nombre}: el archivo está vacío; falta la cabecera`);
  return { nombre, bot: cabecera.bot, rondas };
}

// ---------------------------------------------------------------------------------------------------------------
// Análisis: métricas y alarmas de cada grupo.

type CampoConfig = readonly [nombre: string, valor: (c: Config) => number];

const CAMPOS_CONFIG: readonly CampoConfig[] = [
  ['lado', (c) => c.lado],
  ['umbral', (c) => c.umbral],
  ['tiradas', (c) => c.tiradas],
  ['tamanoMano', (c) => c.tamanoMano],
  ['siembra.min', (c) => c.siembra.min],
  ['siembra.max', (c) => c.siembra.max],
  ['mazo.normal', (c) => c.mazo.normal],
  ['mazo.pesado', (c) => c.mazo.pesado],
  ['mazo.explosivo', (c) => c.mazo.explosivo],
  ['meta', (c) => c.meta],
  ['multiplicadorPorOleada', (c) => c.multiplicadorPorOleada],
  ['topeOleadas', (c) => c.topeOleadas],
];

/** Campos que siempre aparecen en la etiqueta de una configuración, además de los que distinguen a los grupos. */
const CAMPOS_SIEMPRE = ['lado', 'tiradas', 'tamanoMano', 'multiplicadorPorOleada'];

function compararConfig(a: Config, b: Config): number {
  for (const [, valor] of CAMPOS_CONFIG) {
    const d = valor(a) - valor(b);
    if (d !== 0) return d;
  }
  return 0;
}

export type Avalanchas = {
  readonly tiradas: number;
  /** Fracción de tiradas sin ningún derrumbe. */
  readonly sinDerrumbes: number;
  readonly numero: number;
  readonly media: number | undefined;
  readonly desviacion: number | undefined;
  readonly mediana: number | undefined;
  readonly percentil90: number | undefined;
  readonly maximo: number | undefined;
  /** Porcentaje en cada tramo de `TRAMOS_AVALANCHA`. */
  readonly histograma: readonly number[];
  /** Fracción del total de derrumbes que causa el 10 % de avalanchas más grandes. */
  readonly parteDelDiezPorCiento: number;
};

export type GrupoAnalizado = {
  readonly bot: string;
  readonly config: Config;
  readonly etiquetaConfig: string;
  readonly rondas: number;
  readonly ganadas: number;
  readonly victorias: number;
  readonly intervaloVictorias: Intervalo;
  /** Puntos de desborde por ronda, en centésimas. */
  readonly puntos: {
    readonly media: number;
    readonly desviacion: number | undefined;
    readonly minimo: number;
    readonly maximo: number;
  };
  readonly avalanchas: Avalanchas;
  readonly oleadasMaximas: number;
};

export type Ventaja = {
  readonly etiquetaConfig: string;
  readonly semillasCargador: number;
  readonly semillasBorde: number;
  readonly diferencia: DiferenciaPorPares;
};

/** Resultados por semilla de un bot en una configuración: `true` si ganó la ronda de esa semilla. */
export type ResultadosBot = { readonly bot: string; readonly porSemilla: ReadonlyMap<number, boolean> };

export type Habilidad = {
  /** El mejor de `BOTS_HABILIDAD` por tasa de victoria; en empate, el primero de la lista. */
  readonly mejor: string;
  readonly victoriasMejor: number;
  readonly victoriasAleatorio: number;
  readonly semillasMejor: number;
  readonly semillasAleatorio: number;
  /** Diferencia por pares de semilla, mejor menos aleatorio. */
  readonly diferencia: DiferenciaPorPares;
  /** Ningún bot de la configuración gana ninguna ronda: la alarma (f) no se evalúa. */
  readonly nadieGana: boolean;
};

export type HabilidadPorConfig = Habilidad & { readonly etiquetaConfig: string };

export type CodigoAlarma = 'a' | 'b' | 'c' | 'd' | 'e' | 'f';
export type Alarma = { readonly grupo: string; readonly codigo: CodigoAlarma; readonly mensaje: string };

export type Analisis = {
  readonly archivos: readonly ArchivoLeido[];
  readonly grupos: readonly GrupoAnalizado[];
  /** Etiquetas de las configuraciones, en orden. */
  readonly configuraciones: readonly string[];
  readonly ventajas: readonly Ventaja[];
  readonly habilidades: readonly HabilidadPorConfig[];
  readonly alarmas: readonly Alarma[];
  /** Alarmas que no se evalúan porque nadie gana en la configuración; no cuentan para `--estricto`. */
  readonly noEvaluadas: readonly Alarma[];
};

/** Tasa de victoria: fracción de semillas ganadas. */
export function tasa(porSemilla: ReadonlyMap<number, boolean>): number {
  let ganadas = 0;
  for (const gana of porSemilla.values()) if (gana) ganadas++;
  return porSemilla.size === 0 ? 0 : ganadas / porSemilla.size;
}

/** Diferencia de victorias `a − b` emparejada por semilla, sobre las semillas comunes y en orden de semilla. */
export function diferenciaEmparejada(a: ReadonlyMap<number, boolean>, b: ReadonlyMap<number, boolean>): DiferenciaPorPares {
  const diferencias: number[] = [];
  for (const [semilla, ganaA] of [...a].sort(([x], [y]) => x - y)) {
    const ganaB = b.get(semilla);
    if (ganaB !== undefined) diferencias.push(Number(ganaA) - Number(ganaB));
  }
  return diferenciaPorPares(diferencias);
}

/**
 * Ventaja de habilidad de una configuración: el mejor de `BOTS_HABILIDAD` frente al aleatorio, emparejado por
 * semilla. `resultados` son todos los bots de la configuración; `undefined` si falta el aleatorio o los dos rivales.
 */
export function ventajaDeHabilidad(resultados: readonly ResultadosBot[]): Habilidad | undefined {
  const aleatorio = resultados.find((r) => r.bot === 'aleatorio');
  const candidatos = BOTS_HABILIDAD.flatMap((bot) => resultados.filter((r) => r.bot === bot));
  if (aleatorio === undefined || candidatos.length === 0) return undefined;
  const mejor = candidatos.reduce((a, b) => (tasa(b.porSemilla) > tasa(a.porSemilla) ? b : a));
  return {
    mejor: mejor.bot,
    victoriasMejor: tasa(mejor.porSemilla),
    victoriasAleatorio: tasa(aleatorio.porSemilla),
    semillasMejor: mejor.porSemilla.size,
    semillasAleatorio: aleatorio.porSemilla.size,
    diferencia: diferenciaEmparejada(mejor.porSemilla, aleatorio.porSemilla),
    nadieGana: resultados.every((r) => tasa(r.porSemilla) === 0),
  };
}

/**
 * Alarma (f): `true` si la ventaja media es menor que `ventajaHabilidadMinimaPp`, `false` si no, y `undefined` si
 * no se evalúa porque nadie gana.
 */
export function saltaHabilidad(h: Habilidad): boolean | undefined {
  if (h.nadieGana) return undefined;
  return h.diferencia.media < UMBRALES_ALARMA.ventajaHabilidadMinimaPp / 100;
}

export function analizarAvalanchas(g: Grupo): Avalanchas {
  const r = g.avalanchas.resumen();
  return {
    tiradas: g.tiradas,
    sinDerrumbes: g.tiradas === 0 ? 0 : g.tiradasSinDerrumbes / g.tiradas,
    numero: g.avalanchas.n,
    media: r.n === 0 ? undefined : r.media,
    desviacion: r.desviacion,
    mediana: g.avalanchas.percentil(0.5),
    percentil90: g.avalanchas.percentil(0.9),
    maximo: r.n === 0 ? undefined : r.maximo,
    histograma: g.avalanchas.histograma(),
    parteDelDiezPorCiento: g.avalanchas.parteDeLosMayores(FRACCION_MAYORES),
  };
}

/** Lee los archivos en orden y calcula todas las métricas y alarmas del informe. */
export async function analizar(rutas: readonly string[]): Promise<Analisis> {
  if (rutas.length === 0) throw new ErrorDeInforme('indica al menos un archivo JSONL');
  const crudos = new Map<string, Grupo>();
  const archivos: ArchivoLeido[] = [];
  for (const ruta of rutas) archivos.push(await leerArchivo(ruta, crudos));

  const ordenados = [...crudos.values()].sort(
    (a, b) => compararConfig(a.config, b.config) || (a.bot < b.bot ? -1 : a.bot > b.bot ? 1 : 0),
  );
  const configs = [...new Map(ordenados.map((g) => [g.claveConfig, g.config])).values()];
  const distinguen = CAMPOS_CONFIG.filter(([, valor]) => new Set(configs.map(valor)).size > 1).map(([n]) => n);
  const campos = [...distinguen, ...CAMPOS_SIEMPRE.filter((c) => !distinguen.includes(c))];
  const etiqueta = (config: Config): string =>
    campos.map((nombre) => `${nombre}=${CAMPOS_CONFIG.find(([n]) => n === nombre)?.[1](config)}`).join(', ');

  const grupos: GrupoAnalizado[] = ordenados.map((g) => ({
    bot: g.bot,
    config: g.config,
    etiquetaConfig: etiqueta(g.config),
    rondas: g.rondas,
    ganadas: g.ganadas,
    victorias: g.rondas === 0 ? 0 : g.ganadas / g.rondas,
    intervaloVictorias: wilson(g.ganadas, g.rondas),
    puntos: {
      media: g.puntos.n === 0 ? 0 : g.puntos.media,
      desviacion: g.puntos.desviacion,
      minimo: g.puntos.n === 0 ? 0 : g.puntos.minimo,
      maximo: g.puntos.n === 0 ? 0 : g.puntos.maximo,
    },
    avalanchas: analizarAvalanchas(g),
    oleadasMaximas: g.oleadasMaximas,
  }));

  const ventajas: Ventaja[] = [];
  for (const config of configs) {
    const clave = JSON.stringify(config);
    const cargador = ordenados.find((g) => g.bot === 'cargador' && g.claveConfig === clave);
    const borde = ordenados.find((g) => g.bot === 'borde' && g.claveConfig === clave);
    if (cargador === undefined || borde === undefined) continue;
    ventajas.push({
      etiquetaConfig: etiqueta(config),
      semillasCargador: cargador.porSemilla.size,
      semillasBorde: borde.porSemilla.size,
      diferencia: diferenciaEmparejada(cargador.porSemilla, borde.porSemilla),
    });
  }

  const habilidades: HabilidadPorConfig[] = [];
  for (const config of configs) {
    const clave = JSON.stringify(config);
    const h = ventajaDeHabilidad(ordenados.filter((g) => g.claveConfig === clave));
    if (h !== undefined) habilidades.push({ etiquetaConfig: etiqueta(config), ...h });
  }

  return {
    archivos,
    grupos,
    configuraciones: configs.map(etiqueta),
    ventajas,
    habilidades,
    ...calcularAlarmas(grupos, ventajas, habilidades),
  };
}

function calcularAlarmas(
  grupos: readonly GrupoAnalizado[],
  ventajas: readonly Ventaja[],
  habilidades: readonly HabilidadPorConfig[],
): { alarmas: Alarma[]; noEvaluadas: Alarma[] } {
  const alarmas: Alarma[] = [];
  const noEvaluadas: Alarma[] = [];
  const u = UMBRALES_ALARMA;
  /** Configuraciones en las que algún grupo gana: las alarmas (a), (b) y (f) solo se evalúan en ellas. */
  const conVictorias = new Set(grupos.filter((g) => g.ganadas > 0).map((g) => g.etiquetaConfig));
  for (const g of grupos) {
    const grupo = `${g.bot} · ${g.etiquetaConfig}`;
    if (g.bot === 'aleatorio' && g.rondas > 0 && !conVictorias.has(g.etiquetaConfig)) {
      noEvaluadas.push({ grupo, codigo: 'a', mensaje: NO_EVALUADA });
    } else if (g.bot === 'aleatorio' && g.rondas > 0 && (g.victorias > u.aleatorioMaximo || g.victorias < u.aleatorioMinimo)) {
      alarmas.push({
        grupo,
        codigo: 'a',
        mensaje: `el bot aleatorio gana el ${porcentaje(g.victorias)} (fuera de ${porcentaje(u.aleatorioMinimo)}–${porcentaje(u.aleatorioMaximo)})`,
      });
    }
    if (g.puntos.desviacion !== undefined && g.puntos.desviacion > g.puntos.media) {
      alarmas.push({
        grupo,
        codigo: 'c',
        mensaje: `la desviación de los puntos (${puntos(g.puntos.desviacion)}) es mayor que la media (${puntos(g.puntos.media)})`,
      });
    }
    const { media, desviacion } = g.avalanchas;
    if (media !== undefined && desviacion !== undefined && desviacion / media < u.coeficienteVariacionMinimo) {
      alarmas.push({
        grupo,
        codigo: 'd',
        mensaje: `las avalanchas son casi todas del mismo tamaño (coeficiente de variación ${decimal(desviacion / media, 3)} < ${decimal(u.coeficienteVariacionMinimo, 1)})`,
      });
    }
    if (g.oleadasMaximas >= u.fraccionTopeOleadas * g.config.topeOleadas) {
      alarmas.push({
        grupo,
        codigo: 'e',
        mensaje: `las oleadas máximas (${g.oleadasMaximas}) llegan al ${porcentaje(u.fraccionTopeOleadas)} o más de topeOleadas (${g.config.topeOleadas})`,
      });
    }
  }
  for (const v of ventajas) {
    const inferior = v.diferencia.intervalo?.inferior;
    const grupo = `cargador frente a borde · ${v.etiquetaConfig}`;
    if (!conVictorias.has(v.etiquetaConfig)) {
      noEvaluadas.push({ grupo, codigo: 'b', mensaje: NO_EVALUADA });
    } else if (inferior === undefined || inferior <= 0) {
      alarmas.push({
        grupo,
        codigo: 'b',
        mensaje:
          inferior === undefined
            ? `la ventaja del cargador sobre el borde no se puede medir con ${v.diferencia.n} pares`
            : `la ventaja del cargador sobre el borde no es significativa (extremo inferior ${puntosPorcentuales(inferior)} ≤ 0)`,
      });
    }
  }
  for (const h of habilidades) {
    const grupo = `${h.mejor} frente a aleatorio · ${h.etiquetaConfig}`;
    const salta = saltaHabilidad(h);
    if (salta === undefined) {
      noEvaluadas.push({ grupo, codigo: 'f', mensaje: NO_EVALUADA });
    } else if (salta) {
      alarmas.push({
        grupo,
        codigo: 'f',
        mensaje: `la ventaja de ${h.mejor} sobre el aleatorio (${puntosPorcentuales(h.diferencia.media)}) es menor que ${u.ventajaHabilidadMinimaPp} pp`,
      });
    }
  }
  return { alarmas, noEvaluadas };
}

// ---------------------------------------------------------------------------------------------------------------
// Formato Markdown.

export function decimal(valor: number, decimales: number): string {
  return valor.toFixed(decimales).replace('.', ',');
}
export const porcentaje = (fraccion: number): string => `${decimal(100 * fraccion, 2)} %`;
export const puntosPorcentuales = (fraccion: number): string => `${decimal(100 * fraccion, 2)} pp`;
/** Centésimas a puntos, con 2 decimales. */
export const puntos = (centesimas: number): string => decimal(centesimas / 100, 2);
export const opcional = (valor: number | undefined, formato: (v: number) => string): string =>
  valor === undefined ? '—' : formato(valor);
export const intervalo = (i: Intervalo, formato: (v: number) => string): string => `[${formato(i.inferior)}; ${formato(i.superior)}]`;

export function tabla(cabecera: readonly string[], filas: readonly (readonly string[])[]): string[] {
  return [`| ${cabecera.join(' | ')} |`, `| ${cabecera.map(() => '---').join(' | ')} |`, ...filas.map((f) => `| ${f.join(' | ')} |`)];
}

/** Pares de una diferencia emparejada; si los conjuntos de semillas difieren, indica que es la intersección. */
export function pares(n: number, a: string, semillasA: number, b: string, semillasB: number): string {
  return n === Math.max(semillasA, semillasB) ? String(n) : `${n} (intersección; ${a} ${semillasA}, ${b} ${semillasB})`;
}

/** Marca de la alarma (f) para una tabla: «salta», «no» o «no evaluada». */
export function marcaHabilidad(h: Habilidad): string {
  const salta = saltaHabilidad(h);
  return salta === undefined ? 'no evaluada' : salta ? 'salta' : 'no';
}

/** Informe en Markdown, determinista: sin marcas de tiempo ni rutas absolutas. */
export function renderizar(a: Analisis): string {
  const l: string[] = ['# Informe de balance', ''];

  l.push('## Resumen', '', `Archivos leídos: ${a.archivos.length}.`, '');
  l.push(...tabla(['Archivo', 'Bot', 'Rondas'], a.archivos.map((f) => [f.nombre, f.bot, String(f.rondas)])), '');
  l.push(...tabla(['Bot', 'Configuración', 'Rondas'], a.grupos.map((g) => [g.bot, g.etiquetaConfig, String(g.rondas)])), '');

  l.push('## Victorias', '');
  l.push(
    ...tabla(
      ['Bot', 'Configuración', 'Rondas', 'Ganadas', 'Victorias', 'IC 95 % (Wilson)'],
      a.grupos.map((g) => [
        g.bot,
        g.etiquetaConfig,
        String(g.rondas),
        String(g.ganadas),
        porcentaje(g.victorias),
        intervalo(g.intervaloVictorias, porcentaje),
      ]),
    ),
    '',
  );
  const bots = [...new Set(a.grupos.map((g) => g.bot))].sort();
  if (a.configuraciones.length > 1 && bots.length > 1) {
    l.push('Porcentaje de victorias por bot (filas) y configuración (columnas):', '');
    l.push(
      ...tabla(
        ['Bot', ...a.configuraciones],
        bots.map((bot) => [
          bot,
          ...a.configuraciones.map((c) => {
            const g = a.grupos.find((x) => x.bot === bot && x.etiquetaConfig === c);
            return g === undefined ? '—' : porcentaje(g.victorias);
          }),
        ]),
      ),
      '',
    );
  }

  l.push('## Ventaja del cargador sobre el borde', '');
  if (a.ventajas.length === 0) {
    l.push('No hay ninguna configuración con los bots cargador y borde.', '');
  } else {
    l.push(
      'Diferencia de victorias (cargador menos borde) emparejada por semilla, en puntos porcentuales, con su intervalo al 95 % por aproximación normal.',
      '',
    );
    l.push(
      ...tabla(
        ['Configuración', 'Pares', 'Diferencia media', 'IC 95 %'],
        a.ventajas.map((v) => [
          v.etiquetaConfig,
          pares(v.diferencia.n, 'cargador', v.semillasCargador, 'borde', v.semillasBorde),
          puntosPorcentuales(v.diferencia.media),
          v.diferencia.intervalo === undefined ? '—' : intervalo(v.diferencia.intervalo, puntosPorcentuales),
        ]),
      ),
      '',
    );
  }

  l.push('## Ventaja de habilidad', '');
  if (a.habilidades.length === 0) {
    l.push('No hay ninguna configuración con el bot aleatorio y al menos uno de avaro o cargador.', '');
  } else {
    l.push(
      'Diferencia de victorias del mejor de avaro y cargador (el de mayor tasa de victoria en la configuración) menos el aleatorio, emparejada por semilla, en puntos porcentuales, con su intervalo al 95 % por aproximación normal.',
      '',
    );
    l.push(
      ...tabla(
        ['Configuración', 'Mejor', 'Victorias del mejor', 'Victorias del aleatorio', 'Pares', 'Diferencia media', 'IC 95 %', 'Alarma (f)'],
        a.habilidades.map((h) => [
          h.etiquetaConfig,
          h.mejor,
          porcentaje(h.victoriasMejor),
          porcentaje(h.victoriasAleatorio),
          pares(h.diferencia.n, h.mejor, h.semillasMejor, 'aleatorio', h.semillasAleatorio),
          puntosPorcentuales(h.diferencia.media),
          h.diferencia.intervalo === undefined ? '—' : intervalo(h.diferencia.intervalo, puntosPorcentuales),
          marcaHabilidad(h),
        ]),
      ),
      '',
    );
  }

  l.push('## Puntos de desborde por ronda', '', 'En puntos (centésimas entre 100).', '');
  l.push(
    ...tabla(
      ['Bot', 'Configuración', 'Rondas', 'Media', 'Desviación', 'Mínimo', 'Máximo'],
      a.grupos.map((g) => [
        g.ganadas > 0 ? `${g.bot} ¹` : g.bot,
        g.etiquetaConfig,
        String(g.rondas),
        puntos(g.puntos.media),
        opcional(g.puntos.desviacion, puntos),
        puntos(g.puntos.minimo),
        puntos(g.puntos.maximo),
      ]),
    ),
    '',
  );
  if (a.grupos.some((g) => g.ganadas > 0)) l.push(`¹ Grupo con rondas ganadas: ${NOTA_TRUNCADOS}.`, '');

  l.push('## Avalanchas', '');
  l.push(
    'Tamaño de una avalancha: derrumbes de una tirada. Las métricas se calculan sobre las tiradas con al menos un derrumbe; el percentil es por rango más cercano.',
    '',
  );
  const tramos = TRAMOS_AVALANCHA.map(({ desde, hasta }) => (hasta === undefined ? `${desde}+` : `${desde}–${hasta}`));
  l.push(
    ...tabla(
      ['Bot', 'Configuración', 'Tiradas', 'Sin derrumbes', 'Avalanchas', 'Media', 'Desviación', 'Mediana', 'P90', 'Máximo', 'Top 10 %'],
      a.grupos.map((g) => {
        const v = g.avalanchas;
        return [
          g.bot,
          g.etiquetaConfig,
          String(v.tiradas),
          porcentaje(v.sinDerrumbes),
          String(v.numero),
          opcional(v.media, (x) => decimal(x, 2)),
          opcional(v.desviacion, (x) => decimal(x, 2)),
          opcional(v.mediana, String),
          opcional(v.percentil90, String),
          opcional(v.maximo, String),
          porcentaje(v.parteDelDiezPorCiento),
        ];
      }),
    ),
    '',
    '«Top 10 %»: parte del total de derrumbes que causa el 10 % de avalanchas más grandes.',
    '',
    'Histograma del tamaño de las avalanchas, en porcentaje:',
    '',
    ...tabla(
      ['Bot', 'Configuración', ...tramos],
      a.grupos.map((g) => [g.bot, g.etiquetaConfig, ...g.avalanchas.histograma.map((p) => porcentaje(p / 100))]),
    ),
    '',
  );

  l.push('## Oleadas máximas', '');
  l.push(
    ...tabla(
      ['Bot', 'Configuración', 'Oleadas máximas en una tirada', 'topeOleadas', 'Parte del tope'],
      a.grupos.map((g) => [
        g.bot,
        g.etiquetaConfig,
        String(g.oleadasMaximas),
        String(g.config.topeOleadas),
        porcentaje(g.oleadasMaximas / g.config.topeOleadas),
      ]),
    ),
    '',
  );

  l.push('## Bonus', '', 'No disponible hasta H5.', '');

  l.push('## Alarmas', '');
  if (a.alarmas.length === 0 && a.noEvaluadas.length === 0) l.push('Ninguna.');
  for (const al of [...a.alarmas, ...a.noEvaluadas]) l.push(`- **${al.grupo}**: (${al.codigo}) ${al.mensaje}.`);
  return `${l.join('\n')}\n`;
}

// ---------------------------------------------------------------------------------------------------------------
// Línea de comandos.

export type Salidas = { readonly escribir: (texto: string) => void; readonly error: (linea: string) => void };

const CONSOLA: Salidas = { escribir: (t) => process.stdout.write(t), error: (l) => console.error(l) };

/**
 * Línea de comandos del informe. Devuelve 0 si todo fue bien, 1 si `--estricto` y salta alguna alarma, y 2 ante
 * un archivo ilegible o mal formado o un error de uso.
 */
export async function principal(argv: readonly string[], salidas: Salidas = CONSOLA): Promise<number> {
  try {
    const args = argv[0] === '--' ? argv.slice(1) : [...argv];
    let valores;
    try {
      valores = parseArgs({
        args,
        options: { salida: { type: 'string' }, estricto: { type: 'boolean' } },
        strict: true,
        allowPositionals: true,
      });
    } catch (error) {
      throw new ErrorDeInforme(error instanceof Error ? error.message : String(error));
    }
    const analisis = await analizar(valores.positionals);
    const texto = renderizar(analisis);
    salidas.escribir(texto);
    if (valores.values.salida !== undefined) {
      mkdirSync(dirname(valores.values.salida), { recursive: true });
      writeFileSync(valores.values.salida, texto);
    }
    return valores.values.estricto === true && analisis.alarmas.length > 0 ? 1 : 0;
  } catch (error) {
    if (error instanceof ErrorDeInforme) {
      salidas.error(`error: ${error.message}`);
      return 2;
    }
    throw error;
  }
}

// Uso: pnpm --filter @pila/sim informe -- a.jsonl [b.jsonl …] [--salida informe.md] [--estricto]
if (import.meta.main) process.exitCode = await principal(process.argv.slice(2));
