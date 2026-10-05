import { enteroEnRango } from '@pila/core';
import type { Bot } from '../bot.ts';
import { colocacionesDelPrimerGrano, confirmar } from './comun.ts';

/**
 * Bot aleatorio, el suelo de dificultad: coloca el grano sin colocar de menor índice en una celda elegida con
 * distribución uniforme entre sus `Colocar` legales (con `enteroEnRango` sobre su flujo) y confirma cuando no
 * queda ninguno. Nunca deshace y solo elige de la lista de acciones recibida.
 */
export const BOT_ALEATORIO: Bot = {
  nombre: 'aleatorio',
  elegir(_estado, acciones, azar) {
    const opciones = colocacionesDelPrimerGrano(acciones);
    if (opciones.length === 0) return [confirmar(acciones), azar];
    const [i, siguiente] = enteroEnRango(azar, 0, opciones.length - 1);
    const accion = opciones[i];
    if (accion === undefined) throw new Error(`índice fuera de las opciones: ${i}`);
    return [accion, siguiente];
  },
};
