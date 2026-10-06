// Fases del flujo de la pantalla y qué entrada se acepta en cada una. Es la única fuente de verdad del bloqueo de la
// interfaz: el render calcula la fase con `faseDeFlujo` y pasa cada gesto por `permitida`. Puro y sin estado.
import type { Estado } from '@pila/core';

/** `jugando`: se colocan granos; `animando`: hay una cascada en curso; `fin`: la ronda terminó. */
export type FaseFlujo = 'jugando' | 'animando' | 'fin';

/** Acciones de entrada de la interfaz, ya traducidas de teclas y clics. */
export type AccionFlujo =
  | 'seleccionar'
  | 'ciclar'
  | 'colocar'
  | 'deshacer'
  | 'confirmar'
  | 'ritmo'
  | 'saltar'
  | 'otraRonda'
  | 'copiar';

/** `animando` si hay una cascada en curso; si no, `fin` cuando la ronda ya no está en `colocando`; si no, `jugando`. */
export function faseDeFlujo({ animando, estado }: { readonly animando: boolean; readonly estado: Estado }): FaseFlujo {
  if (animando) return 'animando';
  return estado.fase === 'colocando' ? 'jugando' : 'fin';
}

/** Acciones aceptadas en cada fase; el ritmo y copiar el registro se pueden usar siempre. */
const PERMITIDAS: Readonly<Record<FaseFlujo, ReadonlySet<AccionFlujo>>> = {
  jugando: new Set<AccionFlujo>(['seleccionar', 'ciclar', 'colocar', 'deshacer', 'confirmar', 'ritmo', 'copiar']),
  animando: new Set<AccionFlujo>(['saltar', 'ritmo', 'copiar']),
  fin: new Set<AccionFlujo>(['otraRonda', 'ritmo', 'copiar']),
};

/** Si la acción se acepta en la fase. Cualquier combinación que no esté en la tabla se rechaza. */
export function permitida(fase: FaseFlujo, accion: AccionFlujo): boolean {
  return PERMITIDAS[fase].has(accion);
}

/** Qué significa Intro o Espacio en cada fase: confirmar, saltar la animación u otra ronda. */
export function interpretarAceptar(fase: FaseFlujo): AccionFlujo {
  switch (fase) {
    case 'jugando':
      return 'confirmar';
    case 'animando':
      return 'saltar';
    case 'fin':
      return 'otraRonda';
  }
}
