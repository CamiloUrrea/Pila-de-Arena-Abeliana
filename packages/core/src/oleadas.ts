import type { Evento } from './eventos.ts';
import { DIRECCIONES, dentro, leerCelda } from './rejilla.ts';
import type { Celdas, Config, Coordenada, Resultado } from './tipos.ts';

/**
 * Granos que pierde una celda al derrumbarse: uno por cada una de sus 4 direcciones.
 * Coincide con el umbral fijo de H1 (`validarConfig` exige umbral 4), y por eso se conservan los granos.
 */
export const GRANOS_POR_DERRUMBE = 4;

export type ParametrosOleadas = Pick<Config, 'lado' | 'umbral' | 'multiplicadorPorOleada' | 'topeOleadas'>;

export type ResultadoOleadas = {
  /** Rejilla nueva y estable. */
  readonly celdas: Celdas;
  readonly eventos: readonly Evento[];
  readonly oleadas: number;
  readonly derrumbes: number;
  readonly granosFuera: number;
  /** Puntos ganados, en centésimas. */
  readonly puntos: number;
  /** Veces que se derrumbó cada celda, con la forma de la rejilla. */
  readonly derrumbesPorCelda: Celdas;
};

/**
 * La resolución superó `topeOleadas` con celdas aún inestables. En un montón finito no ocurre con cargas
 * alcanzables: el tope detecta errores. `aplicar` la devuelve sin cambiar el estado.
 */
export type ErrorResolucion = { readonly tipo: 'ResolucionNoTermino'; readonly topeOleadas: number };

/**
 * Resuelve las oleadas de derrumbes (pasos 2 y 3 de «Resolución de una tirada») con calendario paralelo:
 * en la oleada k se derrumban a la vez las celdas inestables al inicio de la oleada, una vez cada una.
 * Los granos que salen por el borde valen `100 + multiplicadorPorOleada × (k − 1)` centésimas.
 * Si tras `topeOleadas` oleadas queda alguna inestable, devuelve `ResolucionNoTermino`. No muta la entrada.
 */
export function resolverOleadas(
  celdas: Celdas,
  parametros: ParametrosOleadas,
): Resultado<ResultadoOleadas, ErrorResolucion> {
  const { lado, umbral, multiplicadorPorOleada, topeOleadas } = parametros;
  const inestableEn = (rejilla: Celdas, x: number, y: number): boolean => (leerCelda(rejilla, x, y) ?? 0) >= umbral;
  const inestables = (rejilla: Celdas): Coordenada[] =>
    rejilla.flatMap((fila, y) => fila.flatMap((valor, x) => (valor >= umbral ? [{ x, y }] : [])));

  const eventos: Evento[] = [];
  let actual = celdas;
  let derrumbesPorCelda: Celdas = celdas.map((fila) => fila.map(() => 0));
  let oleadas = 0;
  let derrumbes = 0;
  let granosFuera = 0;
  let puntos = 0;

  while (oleadas < topeOleadas && inestables(actual).length > 0) {
    const k = oleadas + 1;
    const instantanea = actual;
    const caen = inestables(instantanea);
    const valorFuera = 100 + multiplicadorPorOleada * (k - 1);
    let fueraOleada = 0;

    eventos.push({ tipo: 'OleadaIniciada', k, celdas: caen });
    for (const { x, y } of caen) {
      eventos.push({ tipo: 'Derrumbe', k, x, y });
      for (const { direccion, dx, dy } of DIRECCIONES) {
        if (!dentro(lado, x + dx, y + dy)) {
          eventos.push({ tipo: 'GranoFuera', k, x, y, direccion, puntos: valorFuera });
          fueraOleada++;
        }
      }
    }
    eventos.push({
      tipo: 'OleadaTerminada',
      k,
      derrumbes: caen.length,
      granosFuera: fueraOleada,
      puntosGanados: fueraOleada * valorFuera,
    });

    // Simultaneidad: todo se calcula sobre la instantánea. Cada inestable pierde sus granos
    // y cada celda recibe uno por cada vecino inestable.
    actual = instantanea.map((fila, y) =>
      fila.map((valor, x) => {
        const pierde = valor >= umbral ? GRANOS_POR_DERRUMBE : 0;
        const recibe = DIRECCIONES.filter(({ dx, dy }) => inestableEn(instantanea, x + dx, y + dy)).length;
        return valor - pierde + recibe;
      }),
    );
    derrumbesPorCelda = derrumbesPorCelda.map((fila, y) =>
      fila.map((n, x) => n + (inestableEn(instantanea, x, y) ? 1 : 0)),
    );
    oleadas = k;
    derrumbes += caen.length;
    granosFuera += fueraOleada;
    puntos += fueraOleada * valorFuera;
  }

  if (inestables(actual).length > 0) return { ok: false, error: { tipo: 'ResolucionNoTermino', topeOleadas } };
  return { ok: true, valor: { celdas: actual, eventos, oleadas, derrumbes, granosFuera, puntos, derrumbesPorCelda } };
}
