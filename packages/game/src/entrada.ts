// Traducción pura del teclado a gestos de la interfaz, sin DOM: `render.ts` le pasa los datos del evento.

/** Gesto de la interfaz que dispara una tecla. */
export type AccionTecla =
  | { readonly tipo: 'seleccionar'; readonly indice: number }
  | { readonly tipo: 'ciclar'; readonly direccion: 1 | -1 }
  | { readonly tipo: 'deshacer' }
  | { readonly tipo: 'aceptar' }
  | { readonly tipo: 'ritmo'; readonly direccion: 1 | -1 };

/** Lo que importa de una pulsación: la tecla (`KeyboardEvent.key`) y los modificadores. */
export type Pulsacion = { readonly tecla: string; readonly ctrl: boolean; readonly alt: boolean; readonly meta: boolean };

/**
 * Teclas `1` a `9`: seleccionar el grano de índice número − 1. Flechas izquierda y derecha: ciclar −1 y +1.
 * `z`, `Z` y Retroceso: deshacer. Intro y Espacio: aceptar (confirmar, o saltar la animación). `+` y `-`: subir y
 * bajar el ritmo. Cualquier otra tecla, o con Ctrl, Alt o Meta pulsado (atajos del sistema y del navegador): `null`.
 * Mayúsculas no cuenta como modificador, para que `Z` y `+` (con Mayúsculas en muchos teclados) funcionen.
 */
export function accionDeTecla({ tecla, ctrl, alt, meta }: Pulsacion): AccionTecla | null {
  if (ctrl || alt || meta) return null;
  if (/^[1-9]$/.test(tecla)) return { tipo: 'seleccionar', indice: Number(tecla) - 1 };
  switch (tecla) {
    case 'ArrowLeft':
      return { tipo: 'ciclar', direccion: -1 };
    case 'ArrowRight':
      return { tipo: 'ciclar', direccion: 1 };
    case 'z':
    case 'Z':
    case 'Backspace':
      return { tipo: 'deshacer' };
    case 'Enter':
    case ' ':
      return { tipo: 'aceptar' };
    case '+':
      return { tipo: 'ritmo', direccion: 1 };
    case '-':
      return { tipo: 'ritmo', direccion: -1 };
    default:
      return null;
  }
}
