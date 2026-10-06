// Almacenamiento local del registro de rondas (en el navegador, `localStorage`). Solo guarda el registro descrito en
// `registro.ts`, bajo una única clave; nunca sale del dispositivo. Ninguna función lanza: cualquier fallo es un error
// tipado y quien llama sigue sin registro.
import type { Resultado } from '@pila/core';
import { esRegistro } from './registro.ts';
import type { RegistroRonda } from './registro.ts';

/** Lo que se usa de `localStorage`, para poder inyectar uno falso en las pruebas. */
export type Almacen = {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
};

/** Clave única del registro, con el prefijo del proyecto. */
export const CLAVE_REGISTRO = 'pila-arena-abeliana:registro';
/** Versión del objeto guardado: `{ version, registros }`. */
export const VERSION_ALMACEN = 1;
/** Registros que se conservan como máximo: los más recientes. */
export const MAXIMO_REGISTROS = 2000;

export type ErrorAlmacen =
  /** El almacén no se pudo usar (no existe, está bloqueado o lleno). */
  | { readonly tipo: 'AlmacenNoDisponible'; readonly detalle: string }
  /** Lo guardado no es JSON. */
  | { readonly tipo: 'RegistroIlegible'; readonly detalle: string }
  | { readonly tipo: 'VersionDesconocida'; readonly version: string }
  /** Lo guardado es JSON, pero no es `{ version, registros: [...] }`. */
  | { readonly tipo: 'EstructuraInvalida' };

const detalle = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Lee los registros guardados. Sin nada guardado devuelve una lista vacía. Los registros mal formados se descartan sin
 * perder los buenos; un JSON roto, una versión o estructura incorrectas, o un almacén que falla, dan un error.
 */
export function leerRegistros(almacen: Almacen): Resultado<RegistroRonda[], ErrorAlmacen> {
  let texto: string | null;
  try {
    texto = almacen.getItem(CLAVE_REGISTRO);
  } catch (e) {
    return { ok: false, error: { tipo: 'AlmacenNoDisponible', detalle: detalle(e) } };
  }
  if (texto === null) return { ok: true, valor: [] };
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch (e) {
    return { ok: false, error: { tipo: 'RegistroIlegible', detalle: detalle(e) } };
  }
  if (typeof datos !== 'object' || datos === null || !('version' in datos)) {
    return { ok: false, error: { tipo: 'EstructuraInvalida' } };
  }
  if (datos.version !== VERSION_ALMACEN) {
    return { ok: false, error: { tipo: 'VersionDesconocida', version: String(datos.version) } };
  }
  if (!('registros' in datos) || !Array.isArray(datos.registros)) return { ok: false, error: { tipo: 'EstructuraInvalida' } };
  return { ok: true, valor: (datos.registros as unknown[]).filter(esRegistro) };
}

/** Guarda los registros (como mucho los `MAXIMO_REGISTROS` más recientes) y devuelve los que quedaron guardados. */
export function guardarRegistros(almacen: Almacen, registros: readonly RegistroRonda[]): Resultado<RegistroRonda[], ErrorAlmacen> {
  const recientes = registros.slice(-MAXIMO_REGISTROS);
  try {
    almacen.setItem(CLAVE_REGISTRO, JSON.stringify({ version: VERSION_ALMACEN, registros: recientes }));
  } catch (e) {
    return { ok: false, error: { tipo: 'AlmacenNoDisponible', detalle: detalle(e) } };
  }
  return { ok: true, valor: recientes };
}
