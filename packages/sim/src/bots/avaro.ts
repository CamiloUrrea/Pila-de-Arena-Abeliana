import type { Bot } from '../bot.ts';
import { colocacionesDelPrimerGrano, confirmar } from './comun.ts';
import type { Colocar } from './comun.ts';

/**
 * Bot avaro, sin azar: coloca el grano sin colocar de menor índice en la celda con más granos actuales,
 * interior incluido; en empate, la primera por filas. Confirma cuando no queda ningún grano por colocar,
 * nunca deshace, solo elige de la lista de acciones recibida y devuelve el flujo sin consumirlo.
 */
export const BOT_AVARO: Bot = {
  nombre: 'avaro',
  elegir(estado, acciones, azar) {
    const granos = (a: Colocar): number => estado.celdas[a.y]?.[a.x] ?? 0;
    // Las opciones vienen por filas: solo se cambia ante más granos, así gana la primera en empate.
    let mejor: Colocar | undefined;
    for (const opcion of colocacionesDelPrimerGrano(acciones)) {
      if (mejor === undefined || granos(opcion) > granos(mejor)) mejor = opcion;
    }
    return [mejor ?? confirmar(acciones), azar];
  },
};
