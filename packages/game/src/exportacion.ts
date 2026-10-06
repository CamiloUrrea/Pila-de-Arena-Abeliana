// Exportación del registro: CSV puro y copia al portapapeles con un navegador inyectado. Sin red.
import type { Resultado } from '@pila/core';
import type { RegistroRonda } from './registro.ts';

/** Columnas del CSV, en el orden del tipo `RegistroRonda`. */
export const COLUMNAS: readonly (keyof RegistroRonda)[] = [
  'version',
  'sesion',
  'jugador',
  'indice',
  'semilla',
  'lado',
  'resultado',
  'puntos',
  'meta',
  'tiradasUsadas',
  'tiradasTotales',
  'oleadasMax',
  'avalanchaMax',
  'deshacer',
  'duracionMs',
  'pidioOtra',
  'fecha',
];

/** Fin de línea del CSV (RFC 4180). */
const FIN_DE_LINEA = '\r\n';

/** Un campo de CSV: entre comillas, con las comillas dobladas, si lleva comas, comillas o saltos de línea. */
function campo(valor: string | number | boolean | null): string {
  if (valor === null) return '';
  const texto = String(valor);
  return /[",\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

/**
 * CSV con una cabecera y una fila por registro. Números sin formato regional (`String`), booleanos como `true` y
 * `false`, `null` como campo vacío, y los textos escapados.
 */
export function aCsv(registros: readonly RegistroRonda[]): string {
  const filas = [COLUMNAS.join(','), ...registros.map((r) => COLUMNAS.map((c) => campo(r[c])).join(','))];
  return filas.join(FIN_DE_LINEA) + FIN_DE_LINEA;
}

/** Lo que se usa del navegador para copiar: `navigator.clipboard.writeText`. */
export type NavegadorPortapapeles = {
  readonly clipboard?: { writeText(texto: string): Promise<void> } | undefined;
};

export type ErrorExportacion =
  | { readonly tipo: 'SinPortapapeles' }
  | { readonly tipo: 'CopiaFallida'; readonly detalle: string };

/** Copia `texto` al portapapeles. Nunca lanza: sin portapapeles o si el navegador lo rechaza, da un error tipado. */
export async function copiarAlPortapapeles(
  texto: string,
  navegador: NavegadorPortapapeles | undefined,
): Promise<Resultado<void, ErrorExportacion>> {
  const portapapeles = navegador?.clipboard;
  if (portapapeles === undefined || typeof portapapeles.writeText !== 'function') {
    return { ok: false, error: { tipo: 'SinPortapapeles' } };
  }
  try {
    await portapapeles.writeText(texto);
    return { ok: true, valor: undefined };
  } catch (e) {
    return { ok: false, error: { tipo: 'CopiaFallida', detalle: e instanceof Error ? e.message : String(e) } };
  }
}
