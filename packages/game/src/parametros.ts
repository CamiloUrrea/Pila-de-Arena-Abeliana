// Parámetros de la URL. El parseo y la reescritura de la consulta son puros: sin DOM ni azar global. La semilla por
// defecto la genera una función inyectada (`semillaAleatoria` en el navegador), así que el resultado de
// `leerParametros` depende solo de sus argumentos.
import { RITMOS, RITMO_POR_DEFECTO } from './ritmo.ts';
import { formatearPuntos } from './textos.ts';

/** Lado por defecto: el de `CONFIG_INICIAL`. */
export const LADO_POR_DEFECTO = 3;
export const LADO_MINIMO = 1;
export const LADO_MAXIMO = 9;
export const SEMILLA_MAXIMA = 0xffffffff;

/**
 * Parámetros de la URL; `ritmo` es el de la animación de la cascada, uno de `RITMOS`, y `jugador` la etiqueta para
 * el registro local, o `null`.
 */
export type Parametros = {
  readonly semilla: number;
  readonly lado: number;
  readonly ritmo: number;
  readonly jugador: string | null;
};

/** Longitud máxima de la etiqueta del jugador, en caracteres. */
export const JUGADOR_MAXIMO = 24;

export type ErrorParametro = {
  readonly tipo: 'ParametroInvalido';
  readonly campo: 'semilla' | 'lado' | 'ritmo' | 'jugador';
  /** Texto recibido en la URL, tal cual. */
  readonly recibido: string;
  /** Mensaje para el jugador, en español. */
  readonly mensaje: string;
};

export type ResultadoParametros =
  | { readonly ok: true; readonly valor: Parametros }
  | { readonly ok: false; readonly errores: readonly ErrorParametro[] };

/** Entero escrito solo con dígitos decimales (sin signo, espacios, decimales ni exponentes) dentro de [min, max]. */
function enteroEnRango(texto: string, min: number, max: number): number | undefined {
  if (!/^[0-9]+$/.test(texto)) return undefined;
  const valor = Number(texto);
  return Number.isSafeInteger(valor) && valor >= min && valor <= max ? valor : undefined;
}

/**
 * Ritmo escrito con dígitos y, opcionalmente, una parte decimal con punto o coma («0.5» o «0,5»), que esté en
 * `RITMOS`.
 */
function ritmoPermitido(texto: string): number | undefined {
  if (!/^[0-9]+([.,][0-9]+)?$/.test(texto)) return undefined;
  const valor = Number(texto.replace(',', '.'));
  return RITMOS.includes(valor) ? valor : undefined;
}

/**
 * Etiqueta del jugador: de 1 a 24 caracteres entre letras (también acentuadas), cifras, espacio, guion y guion bajo,
 * y no solo espacios. Se normaliza a NFC para que una letra acentuada cuente como un carácter.
 */
function jugadorPermitido(texto: string): string | undefined {
  const nfc = texto.normalize('NFC');
  const longitud = [...nfc].length;
  if (longitud < 1 || longitud > JUGADOR_MAXIMO || nfc.trim() === '') return undefined;
  return /^[\p{L}0-9 _-]+$/u.test(nfc) ? nfc : undefined;
}

/**
 * Lee `?semilla=<entero 0 a 4294967295>`, `?lado=<entero 1 a 9>`, `?ritmo=<uno de RITMOS>` y `?jugador=<texto>` de la
 * parte de búsqueda de la URL (con o sin `?`). Un parámetro ausente toma su valor por defecto (`generarSemilla()`,
 * `LADO_POR_DEFECTO`, `RITMO_POR_DEFECTO` y sin jugador); uno presente pero inválido, incluido el vacío, es un error.
 * Los parámetros desconocidos se ignoran.
 */
export function leerParametros(busqueda: string, generarSemilla: () => number): ResultadoParametros {
  const url = new URLSearchParams(busqueda);
  const errores: ErrorParametro[] = [];

  const textoLado = url.get('lado');
  let lado = LADO_POR_DEFECTO;
  if (textoLado !== null) {
    const valor = enteroEnRango(textoLado, LADO_MINIMO, LADO_MAXIMO);
    if (valor === undefined) {
      errores.push({
        tipo: 'ParametroInvalido',
        campo: 'lado',
        recibido: textoLado,
        mensaje: `El lado debe ser un número entero de ${LADO_MINIMO} a ${LADO_MAXIMO}; se recibió «${textoLado}».`,
      });
    } else {
      lado = valor;
    }
  }

  const textoSemilla = url.get('semilla');
  let semilla: number | undefined;
  if (textoSemilla !== null) {
    semilla = enteroEnRango(textoSemilla, 0, SEMILLA_MAXIMA);
    if (semilla === undefined) {
      errores.push({
        tipo: 'ParametroInvalido',
        campo: 'semilla',
        recibido: textoSemilla,
        mensaje: `La semilla debe ser un número entero de 0 a ${SEMILLA_MAXIMA}; se recibió «${textoSemilla}».`,
      });
    }
  }

  const textoRitmo = url.get('ritmo');
  let ritmo = RITMO_POR_DEFECTO;
  if (textoRitmo !== null) {
    const valor = ritmoPermitido(textoRitmo);
    if (valor === undefined) {
      const permitidos = RITMOS.map((r) => formatearPuntos(Math.round(r * 100))).join('; ');
      errores.push({
        tipo: 'ParametroInvalido',
        campo: 'ritmo',
        recibido: textoRitmo,
        mensaje: `El ritmo debe ser uno de estos valores: ${permitidos}; se recibió «${textoRitmo}».`,
      });
    } else {
      ritmo = valor;
    }
  }

  const textoJugador = url.get('jugador');
  let jugador: string | null = null;
  if (textoJugador !== null) {
    const valor = jugadorPermitido(textoJugador);
    if (valor === undefined) {
      errores.push({
        tipo: 'ParametroInvalido',
        campo: 'jugador',
        recibido: textoJugador,
        mensaje: `El jugador debe tener de 1 a ${JUGADOR_MAXIMO} caracteres entre letras, cifras, espacio, guion y guion bajo; se recibió «${textoJugador}».`,
      });
    } else {
      jugador = valor;
    }
  }

  if (errores.length > 0) return { ok: false, errores };
  return { ok: true, valor: { semilla: semilla ?? generarSemilla(), lado, ritmo, jugador } };
}

/** Semilla aleatoria de 32 bits del generador criptográfico (`crypto.getRandomValues`), para inyectarla. */
export function semillaAleatoria(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

/**
 * Cadena de consulta (con `?`) con `semilla` sustituida, o añadida al final si no había, conservando los demás
 * parámetros (`lado`, `ritmo`, `jugador` y los desconocidos) en su orden y sin duplicar `semilla`. Los valores se escapan con
 * `URLSearchParams`. Con una semilla que no es un entero de 0 a 4294967295 devuelve la consulta sin cambiarla.
 */
export function urlConSemilla(busqueda: string, semilla: number): string {
  const url = new URLSearchParams(busqueda);
  if (Number.isInteger(semilla) && semilla >= 0 && semilla <= SEMILLA_MAXIMA) url.set('semilla', String(semilla));
  const texto = url.toString();
  return texto === '' ? '' : `?${texto}`;
}
