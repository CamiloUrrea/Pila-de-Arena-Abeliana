import type { Bot } from '../bot.ts';
import { colocacionesDelPrimerGrano, confirmar } from './comun.ts';
import type { Colocar } from './comun.ts';

/**
 * Bot de borde, fuerza bruta sin azar: coloca el grano sin colocar de menor índice en la celda del perímetro
 * (`x` o `y` en el límite de la rejilla) con más granos actuales. En empate prefiere una esquina a un borde que
 * no sea esquina y, dentro de la misma categoría, la primera por filas. Confirma cuando no queda ningún grano
 * por colocar, nunca deshace, solo elige de la lista de acciones recibida y devuelve el flujo sin consumirlo.
 */
export const BOT_BORDE: Bot = {
  nombre: 'borde',
  elegir(estado, acciones, azar) {
    const { lado } = estado.config;
    const limite = lado - 1;
    const enPerimetro = (a: Colocar): boolean => a.x === 0 || a.y === 0 || a.x === limite || a.y === limite;
    const esEsquina = (a: Colocar): boolean => (a.x === 0 || a.x === limite) && (a.y === 0 || a.y === limite);
    const granos = (a: Colocar): number => estado.celdas[a.y]?.[a.x] ?? 0;

    // Las opciones vienen por filas: quedarse con la primera ante empate da el desempate por filas.
    let mejor: Colocar | undefined;
    for (const opcion of colocacionesDelPrimerGrano(acciones)) {
      if (!enPerimetro(opcion)) continue;
      if (
        mejor === undefined ||
        granos(opcion) > granos(mejor) ||
        (granos(opcion) === granos(mejor) && esEsquina(opcion) && !esEsquina(mejor))
      ) {
        mejor = opcion;
      }
    }
    return [mejor ?? confirmar(acciones), azar];
  },
};
