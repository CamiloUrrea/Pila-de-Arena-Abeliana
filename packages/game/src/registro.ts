// Registro local de cada ronda para las pruebas con personas: qué pasó en la ronda y si el jugador pidió otra. Puro e
// inmutable; el reloj, la fecha y el identificador de sesión los pone quien llama (`main.ts`).
import type { Estado, Evento } from '@pila/core';

/** Versión del formato de `RegistroRonda`. */
export const VERSION_REGISTRO = 1;

/** Una ronda jugada (versión 1). Puntos y meta en centésimas. */
export type RegistroRonda = {
  readonly version: typeof VERSION_REGISTRO;
  /** Identificador de la sesión: la página abierta en la que se jugó. */
  readonly sesion: string;
  /** Etiqueta del jugador (`?jugador=`), o `null`. */
  readonly jugador: string | null;
  /** Número de la ronda en la sesión, desde 1. */
  readonly indice: number;
  readonly semilla: number;
  readonly lado: number;
  readonly resultado: 'ganada' | 'perdida';
  readonly puntos: number;
  readonly meta: number;
  readonly tiradasUsadas: number;
  readonly tiradasTotales: number;
  /** La mayor cantidad de oleadas en una sola tirada. */
  readonly oleadasMax: number;
  /** El mayor número de derrumbes en una sola tirada. */
  readonly avalanchaMax: number;
  /** Cuántas veces se usó Deshacer (también desde una ficha). */
  readonly deshacer: number;
  readonly duracionMs: number;
  /** Si, al terminar, el jugador pidió otra ronda. */
  readonly pidioOtra: boolean;
  /** Fecha del cierre, en ISO 8601. */
  readonly fecha: string;
};

/** Seguimiento de la ronda en curso, hasta cerrar su registro. */
export type Seguimiento = {
  readonly semilla: number;
  readonly lado: number;
  readonly inicioMs: number;
  readonly tiradas: number;
  readonly oleadasMax: number;
  readonly avalanchaMax: number;
  readonly deshacer: number;
};

export function seguimientoNuevo({ semilla, lado, inicioMs }: { semilla: number; lado: number; inicioMs: number }): Seguimiento {
  return { semilla, lado, inicioMs, tiradas: 0, oleadasMax: 0, avalanchaMax: 0, deshacer: 0 };
}

/**
 * Cuenta una tirada confirmada y acumula sus máximos: las oleadas de la tirada (sus `OleadaTerminada`) y la
 * avalancha, la suma de los derrumbes de todas sus oleadas.
 */
export function seguirConfirmacion(s: Seguimiento, eventos: readonly Evento[]): Seguimiento {
  let oleadas = 0;
  let derrumbes = 0;
  for (const e of eventos) {
    if (e.tipo !== 'OleadaTerminada') continue;
    oleadas++;
    derrumbes += e.derrumbes;
  }
  return {
    ...s,
    tiradas: s.tiradas + 1,
    oleadasMax: Math.max(s.oleadasMax, oleadas),
    avalanchaMax: Math.max(s.avalanchaMax, derrumbes),
  };
}

export function seguirDeshacer(s: Seguimiento): Seguimiento {
  return { ...s, deshacer: s.deshacer + 1 };
}

/**
 * Cierra el registro de una ronda terminada, con `pidioOtra` en `false`: el resultado, los puntos y la meta salen del
 * estado final. Devuelve `null` si la ronda no ha terminado (fase `colocando`).
 */
export function cerrarRegistro(
  s: Seguimiento,
  estadoFinal: Estado,
  datos: { readonly sesion: string; readonly jugador: string | null; readonly indice: number; readonly finMs: number; readonly fecha: string },
): RegistroRonda | null {
  if (estadoFinal.fase === 'colocando') return null;
  return {
    version: VERSION_REGISTRO,
    sesion: datos.sesion,
    jugador: datos.jugador,
    indice: datos.indice,
    semilla: s.semilla,
    lado: s.lado,
    resultado: estadoFinal.fase,
    puntos: estadoFinal.puntos,
    meta: estadoFinal.config.meta,
    tiradasUsadas: s.tiradas,
    tiradasTotales: estadoFinal.config.tiradas,
    oleadasMax: s.oleadasMax,
    avalanchaMax: s.avalanchaMax,
    deshacer: s.deshacer,
    duracionMs: Math.max(0, datos.finMs - s.inicioMs),
    pidioOtra: false,
    fecha: datos.fecha,
  };
}

/** Copia del registro con `pidioOtra` en `true`. */
export function marcarPidioOtra(r: RegistroRonda): RegistroRonda {
  return { ...r, pidioOtra: true };
}

/** Identificador de sesión de 8 caracteres hexadecimales a partir de 32 bits aleatorios. */
export function idSesion(aleatorio32: number): string {
  return (Math.trunc(Math.abs(aleatorio32)) % 0x1_0000_0000).toString(16).padStart(8, '0');
}

const esEntero = (v: unknown, min = 0): v is number => Number.isSafeInteger(v) && (v as number) >= min;

/** Si un valor desconocido (por ejemplo, leído del almacenamiento) es un `RegistroRonda` bien formado. */
export function esRegistro(x: unknown): x is RegistroRonda {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    r['version'] === VERSION_REGISTRO &&
    typeof r['sesion'] === 'string' &&
    (r['jugador'] === null || typeof r['jugador'] === 'string') &&
    esEntero(r['indice'], 1) &&
    esEntero(r['semilla']) &&
    esEntero(r['lado'], 1) &&
    (r['resultado'] === 'ganada' || r['resultado'] === 'perdida') &&
    esEntero(r['puntos']) &&
    esEntero(r['meta'], 1) &&
    esEntero(r['tiradasUsadas']) &&
    esEntero(r['tiradasTotales'], 1) &&
    esEntero(r['oleadasMax']) &&
    esEntero(r['avalanchaMax']) &&
    esEntero(r['deshacer']) &&
    typeof r['duracionMs'] === 'number' &&
    Number.isFinite(r['duracionMs']) &&
    r['duracionMs'] >= 0 &&
    typeof r['pidioOtra'] === 'boolean' &&
    typeof r['fecha'] === 'string'
  );
}
