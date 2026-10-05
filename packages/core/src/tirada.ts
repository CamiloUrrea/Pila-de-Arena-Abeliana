import { aplicarAdiciones } from './adiciones.ts';
import type { Evento } from './eventos.ts';
import { resolverOleadas } from './oleadas.ts';
import type { ErrorResolucion } from './oleadas.ts';
import { dentro } from './rejilla.ts';
import type { Celdas, Colocacion, Estado, Resultado, TipoGrano } from './tipos.ts';

export type ResolucionTirada = {
  readonly celdas: Celdas;
  /** Medidor de desborde tras la tirada, en centésimas. */
  readonly puntos: number;
  readonly usados: readonly TipoGrano[];
  readonly tiradasRestantes: number;
  readonly oleadas: number;
  readonly derrumbes: number;
  readonly granosFuera: number;
  /** Centésimas ganadas en esta tirada, con el multiplicador de cadena ya aplicado por oleada. */
  readonly puntosGanados: number;
  readonly eventos: readonly Evento[];
};

/**
 * Resuelve la tirada con la mano colocada: pasos 1 a 4 de «Resolución de una tirada» (adiciones, oleadas,
 * medidor y mano a `usados`). No evalúa el fin de la tirada ni roba (paso 5, en T1.7) y no cambia `fase`.
 *
 * Si las oleadas superan `topeOleadas`, devuelve `ResolucionNoTermino` sin eventos.
 * Las precondiciones las comprueba quien llama; si no se cumplen es un error de programación y lanza `RangeError`.
 * No muta la entrada.
 */
export function resolverTirada(estado: Estado): Resultado<ResolucionTirada, ErrorResolucion> {
  const { config } = estado;
  if (estado.fase !== 'colocando') throw new RangeError(`la fase debe ser colocando: ${estado.fase}`);
  if (estado.tiradasRestantes < 1) throw new RangeError(`no quedan tiradas: ${estado.tiradasRestantes}`);
  if (estado.mano.length === 0) throw new RangeError('la mano está vacía');
  const colocaciones: Colocacion[] = [];
  for (const [i, { tipo, celda }] of estado.mano.entries()) {
    if (celda === null) throw new RangeError(`el grano ${i} de la mano no está colocado`);
    if (!dentro(config.lado, celda.x, celda.y)) {
      throw new RangeError(`el grano ${i} de la mano está fuera de la rejilla: (${celda.x}, ${celda.y})`);
    }
    colocaciones.push({ tipo, x: celda.x, y: celda.y });
  }

  const numero = config.tiradas - estado.tiradasRestantes + 1;
  const adiciones = aplicarAdiciones(estado.celdas, colocaciones);
  const oleadas = resolverOleadas(adiciones.celdas, config);
  if (!oleadas.ok) return oleadas;
  const r = oleadas.valor;
  const puntos = estado.puntos + r.puntos;

  return {
    ok: true,
    valor: {
      celdas: r.celdas,
      puntos,
      usados: [...estado.usados, ...estado.mano.map((grano) => grano.tipo)],
      tiradasRestantes: estado.tiradasRestantes - 1,
      oleadas: r.oleadas,
      derrumbes: r.derrumbes,
      granosFuera: r.granosFuera,
      puntosGanados: r.puntos,
      eventos: [
        { tipo: 'TiradaConfirmada', numero },
        ...adiciones.eventos,
        ...r.eventos,
        {
          tipo: 'TiradaResuelta',
          oleadas: r.oleadas,
          granosFuera: r.granosFuera,
          puntosGanados: r.puntos,
          puntosTotales: puntos,
        },
      ],
    },
  };
}
