import type { Evento } from './eventos.ts';
import { robarMano } from './mazo.ts';
import type { ErrorResolucion } from './oleadas.ts';
import { dentro } from './rejilla.ts';
import { crearRonda } from './ronda.ts';
import { resolverTirada } from './tirada.ts';
import type { Config, ErrorConfig, Estado, Resultado } from './tipos.ts';

export type Accion =
  | { readonly tipo: 'Colocar'; readonly indiceMano: number; readonly x: number; readonly y: number }
  | { readonly tipo: 'Deshacer' }
  | { readonly tipo: 'Confirmar' };

export type MotivoIlegal =
  | 'FaseIncorrecta'
  | 'IndiceManoInvalido'
  | 'GranoYaColocado'
  | 'CeldaFueraDeRejilla'
  | 'NadaQueDeshacer'
  | 'ManoIncompleta';

export type ErrorAccion = { readonly tipo: 'AccionIlegal'; readonly motivo: MotivoIlegal } | ErrorResolucion;

export type ErrorReproduccion =
  | { readonly tipo: 'ConfigInvalida'; readonly error: ErrorConfig }
  | { readonly tipo: 'AccionFallida'; readonly indice: number; readonly error: ErrorAccion };

type Paso = { readonly estado: Estado; readonly eventos: readonly Evento[] };

function ilegal(motivo: MotivoIlegal): Resultado<Paso, ErrorAccion> {
  return { ok: false, error: { tipo: 'AccionIlegal', motivo } };
}

/**
 * Aplica una acción a un estado válido. Devuelve el estado siguiente y sus eventos, o un error tipado
 * que deja el estado intacto, sin consumir azar ni emitir eventos. Nunca lanza ni muta la entrada.
 */
export function aplicar(estado: Estado, accion: Accion): Resultado<Paso, ErrorAccion> {
  if (estado.fase !== 'colocando') return ilegal('FaseIncorrecta');
  switch (accion.tipo) {
    case 'Colocar':
      return colocar(estado, accion.indiceMano, accion.x, accion.y);
    case 'Deshacer':
      return deshacer(estado);
    case 'Confirmar':
      return confirmar(estado);
  }
}

function colocar(estado: Estado, indiceMano: number, x: number, y: number): Resultado<Paso, ErrorAccion> {
  const grano = Number.isInteger(indiceMano) ? estado.mano[indiceMano] : undefined;
  if (grano === undefined) return ilegal('IndiceManoInvalido');
  if (grano.celda !== null) return ilegal('GranoYaColocado');
  if (!dentro(estado.config.lado, x, y)) return ilegal('CeldaFueraDeRejilla');
  return {
    ok: true,
    valor: {
      estado: {
        ...estado,
        mano: estado.mano.map((g, i) => (i === indiceMano ? { tipo: g.tipo, celda: { x, y } } : g)),
        ordenColocacion: [...estado.ordenColocacion, indiceMano],
      },
      eventos: [{ tipo: 'GranoColocado', indiceMano, x, y }],
    },
  };
}

/** Quita la colocación más reciente en el tiempo (la última de `ordenColocacion`), no la de mayor índice. */
function deshacer(estado: Estado): Resultado<Paso, ErrorAccion> {
  const indiceMano = estado.ordenColocacion.at(-1);
  if (indiceMano === undefined) return ilegal('NadaQueDeshacer');
  return {
    ok: true,
    valor: {
      estado: {
        ...estado,
        mano: estado.mano.map((g, i) => (i === indiceMano ? { tipo: g.tipo, celda: null } : g)),
        ordenColocacion: estado.ordenColocacion.slice(0, -1),
      },
      eventos: [{ tipo: 'ColocacionDeshecha', indiceMano }],
    },
  };
}

/** Resuelve la tirada (pasos 1 a 4) y evalúa su fin (paso 5): victoria, derrota o mano nueva. */
function confirmar(estado: Estado): Resultado<Paso, ErrorAccion> {
  if (estado.mano.length === 0 || estado.mano.some((g) => g.celda === null)) return ilegal('ManoIncompleta');
  const resolucion = resolverTirada(estado);
  if (!resolucion.ok) return resolucion;
  const r = resolucion.valor;

  const resuelto: Estado = {
    ...estado,
    celdas: r.celdas,
    puntos: r.puntos,
    usados: r.usados,
    tiradasRestantes: r.tiradasRestantes,
    mano: [],
    ordenColocacion: [],
  };

  // Paso 5, con prioridad: la victoria gana a la derrota aunque no queden tiradas.
  if (resuelto.puntos >= resuelto.config.meta) {
    return {
      ok: true,
      valor: {
        estado: { ...resuelto, fase: 'ganada' },
        eventos: [...r.eventos, { tipo: 'RondaGanada', puntos: resuelto.puntos }],
      },
    };
  }
  if (resuelto.tiradasRestantes === 0) {
    return {
      ok: true,
      valor: {
        estado: { ...resuelto, fase: 'perdida' },
        eventos: [...r.eventos, { tipo: 'RondaPerdida', puntos: resuelto.puntos }],
      },
    };
  }
  const robo = robarMano(resuelto.mazo, resuelto.usados, resuelto.config.tamanoMano, resuelto.rng.mazo);
  return {
    ok: true,
    valor: {
      estado: {
        ...resuelto,
        mano: robo.mano,
        mazo: robo.mazo,
        usados: robo.usados,
        rng: { ...resuelto.rng, mazo: robo.flujo },
      },
      eventos: [...r.eventos, robo.evento],
    },
  };
}

/**
 * Acciones que `aplicar` acepta, en orden fijo: las `Colocar` por índice de mano y, para cada uno,
 * celdas por filas; después `Deshacer` si hay algo que deshacer y `Confirmar` si todo está colocado.
 */
export function accionesLegales(estado: Estado): readonly Accion[] {
  if (estado.fase !== 'colocando') return [];
  const { lado } = estado.config;
  const acciones: Accion[] = [];
  for (const [indiceMano, grano] of estado.mano.entries()) {
    if (grano.celda !== null) continue;
    for (let y = 0; y < lado; y++) {
      for (let x = 0; x < lado; x++) acciones.push({ tipo: 'Colocar', indiceMano, x, y });
    }
  }
  if (estado.ordenColocacion.length > 0) acciones.push({ tipo: 'Deshacer' });
  if (estado.mano.length > 0 && estado.mano.every((g) => g.celda !== null)) acciones.push({ tipo: 'Confirmar' });
  return acciones;
}

/** Juega una partida: `crearRonda` y luego las acciones en orden. Ante un error devuelve el índice de la acción. */
export function reproducir(
  config: Config,
  semilla: number,
  acciones: readonly Accion[],
): Resultado<Paso, ErrorReproduccion> {
  const inicio = crearRonda(config, semilla);
  if (!inicio.ok) return { ok: false, error: { tipo: 'ConfigInvalida', error: inicio.error } };
  let estado = inicio.valor.estado;
  const eventos: Evento[] = [...inicio.valor.eventos];
  for (const [indice, accion] of acciones.entries()) {
    const paso = aplicar(estado, accion);
    if (!paso.ok) return { ok: false, error: { tipo: 'AccionFallida', indice, error: paso.error } };
    estado = paso.valor.estado;
    eventos.push(...paso.valor.eventos);
  }
  return { ok: true, valor: { estado, eventos } };
}
