import { FASES, TIPOS_GRANO } from './tipos.ts';
import type { ErrorDeserializacion, Estado, Resultado } from './tipos.ts';
import { validarEstado } from './validacion.ts';

const FORMATO = 1;

type ErrorForma = { readonly campo: string; readonly motivo: string };
type Lector<T> = (valor: unknown, ruta: string) => Resultado<T, ErrorForma>;

function esRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/** JSON con las claves de cada objeto ordenadas de forma recursiva. */
function canonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(',')}]`;
  if (esRegistro(valor)) {
    const claves = Object.keys(valor).sort();
    return `{${claves.map((clave) => `${JSON.stringify(clave)}:${canonico(valor[clave])}`).join(',')}}`;
  }
  return JSON.stringify(valor);
}

/** Serializa el estado como JSON canónico `{"estado":{...},"formato":1}`. No modifica su entrada. */
export function serializar(estado: Estado): string {
  const { config } = estado;
  return canonico({
    formato: FORMATO,
    estado: {
      config: {
        lado: config.lado,
        umbral: config.umbral,
        tiradas: config.tiradas,
        tamanoMano: config.tamanoMano,
        siembra: { min: config.siembra.min, max: config.siembra.max },
        mazo: { normal: config.mazo.normal, pesado: config.mazo.pesado, explosivo: config.mazo.explosivo },
        meta: config.meta,
        multiplicadorPorOleada: config.multiplicadorPorOleada,
        topeOleadas: config.topeOleadas,
      },
      celdas: estado.celdas,
      fase: estado.fase,
      mano: estado.mano.map((grano) => ({
        tipo: grano.tipo,
        celda: grano.celda === null ? null : { x: grano.celda.x, y: grano.celda.y },
      })),
      mazo: estado.mazo,
      usados: estado.usados,
      tiradasRestantes: estado.tiradasRestantes,
      puntos: estado.puntos,
      rng: estado.rng,
    },
  });
}

// Lectores que comprueban la forma del JSON a mano, sin librerías.

function unir(ruta: string, clave: string): string {
  return ruta === '' ? clave : `${ruta}.${clave}`;
}

function fallo<T>(campo: string, motivo: string): Resultado<T, ErrorForma> {
  return { ok: false, error: { campo, motivo } };
}

const numero: Lector<number> = (valor, ruta) =>
  typeof valor === 'number' ? { ok: true, valor } : fallo(ruta, 'debe ser un número');

function literal<T extends string>(valores: readonly T[]): Lector<T> {
  return (valor, ruta) => {
    const encontrado = valores.find((v) => v === valor);
    return encontrado === undefined ? fallo(ruta, `debe ser uno de: ${valores.join(', ')}`) : { ok: true, valor: encontrado };
  };
}

function nulable<T>(lector: Lector<T>): Lector<T | null> {
  return (valor, ruta) => (valor === null ? { ok: true, valor: null } : lector(valor, ruta));
}

function arreglo<T>(lector: Lector<T>): Lector<T[]> {
  return (valor, ruta) => {
    if (!Array.isArray(valor)) return fallo(ruta, 'debe ser un arreglo');
    const salida: T[] = [];
    for (const [i, elemento] of valor.entries()) {
      const leido = lector(elemento, `${ruta}[${i}]`);
      if (!leido.ok) return leido;
      salida.push(leido.valor);
    }
    return { ok: true, valor: salida };
  };
}

function diccionario<T>(lector: Lector<T>): Lector<Record<string, T>> {
  return (valor, ruta) => {
    if (!esRegistro(valor)) return fallo(ruta, 'debe ser un objeto');
    const entradas: [string, T][] = [];
    for (const [clave, elemento] of Object.entries(valor)) {
      const leido = lector(elemento, unir(ruta, clave));
      if (!leido.ok) return leido;
      entradas.push([clave, leido.valor]);
    }
    // Object.fromEntries crea propiedades propias, también para claves como «__proto__».
    return { ok: true, valor: Object.fromEntries(entradas) };
  };
}

type Leidos<L> = { [K in keyof L]: L[K] extends Lector<infer T> ? T : never };

/** Objeto con exactamente las claves de `lectores`: rechaza campos faltantes y desconocidos. */
function registro<L extends Record<string, Lector<unknown>>>(lectores: L): Lector<Leidos<L>> {
  return (valor, ruta) => {
    if (!esRegistro(valor)) return fallo(ruta, 'debe ser un objeto');
    const entradas: [string, unknown][] = [];
    for (const [clave, lector] of Object.entries(lectores)) {
      if (!Object.hasOwn(valor, clave)) return fallo(unir(ruta, clave), 'falta el campo');
      const leido = lector(valor[clave], unir(ruta, clave));
      if (!leido.ok) return leido;
      entradas.push([clave, leido.valor]);
    }
    for (const clave of Object.keys(valor)) {
      if (!Object.hasOwn(lectores, clave)) return fallo(unir(ruta, clave), 'campo desconocido');
    }
    // Estrechamiento desde unknown: cada clave de `lectores` se leyó con su lector.
    return { ok: true, valor: Object.fromEntries(entradas) as Leidos<L> };
  };
}

const leerEstado = registro({
  config: registro({
    lado: numero,
    umbral: numero,
    tiradas: numero,
    tamanoMano: numero,
    siembra: registro({ min: numero, max: numero }),
    mazo: registro({ normal: numero, pesado: numero, explosivo: numero }),
    meta: numero,
    multiplicadorPorOleada: numero,
    topeOleadas: numero,
  }),
  celdas: arreglo(arreglo(numero)),
  fase: literal(FASES),
  mano: arreglo(registro({ tipo: literal(TIPOS_GRANO), celda: nulable(registro({ x: numero, y: numero })) })),
  mazo: arreglo(literal(TIPOS_GRANO)),
  usados: arreglo(literal(TIPOS_GRANO)),
  tiradasRestantes: numero,
  puntos: numero,
  rng: diccionario(arreglo(numero)),
});

/** Inversa exacta de `serializar`. Nunca lanza: los fallos vuelven como errores tipados. */
export function deserializar(texto: string): Resultado<Estado, ErrorDeserializacion> {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch (error) {
    return { ok: false, error: { tipo: 'JsonInvalido', detalle: error instanceof Error ? error.message : String(error) } };
  }

  if (!esRegistro(json) || json['formato'] !== FORMATO) {
    return { ok: false, error: { tipo: 'FormatoDesconocido', detalle: `se esperaba un objeto con "formato": ${FORMATO}` } };
  }
  const claves = Object.keys(json).sort().join(',');
  if (claves !== 'estado,formato') {
    return {
      ok: false,
      error: { tipo: 'FormatoDesconocido', detalle: `el formato ${FORMATO} tiene exactamente las claves estado y formato` },
    };
  }

  const leido = leerEstado(json['estado'], '');
  if (!leido.ok) return { ok: false, error: { tipo: 'EstadoInvalido', ...leido.error } };
  const valido = validarEstado(leido.valor);
  if (!valido.ok) return { ok: false, error: { tipo: 'EstadoInvalido', ...valido.error } };
  return valido;
}
