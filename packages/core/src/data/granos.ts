import type { DefinicionGrano, TipoGrano } from '../tipos.ts';

/**
 * Los tipos de grano del MVP como datos (paso 1 de «Resolución de una tirada»).
 * Las adiciones que caen fuera de la rejilla se ignoran: no suman ni dan puntos.
 */
export const DEFINICIONES_GRANOS: Readonly<Record<TipoGrano, DefinicionGrano>> = {
  normal: { tipo: 'normal', adiciones: [{ dx: 0, dy: 0, cantidad: 1 }] },
  pesado: { tipo: 'pesado', adiciones: [{ dx: 0, dy: 0, cantidad: 2 }] },
  explosivo: {
    tipo: 'explosivo',
    adiciones: [
      { dx: 0, dy: 0, cantidad: 1 },
      { dx: 0, dy: -1, cantidad: 1 },
      { dx: 1, dy: 0, cantidad: 1 },
      { dx: 0, dy: 1, cantidad: 1 },
      { dx: -1, dy: 0, cantidad: 1 },
    ],
  },
};
