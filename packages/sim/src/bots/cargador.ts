import type { Bot } from '../bot.ts';
import { colocacionesDelPrimerGrano, confirmar, masCercanaAlCentro, proyectar } from './comun.ts';
import type { Colocar } from './comun.ts';

/**
 * Bot cargador, sin azar: «llena celdas hasta 3 y detona al final». Trabaja sobre el grano sin colocar de
 * menor índice, con estas reglas en orden:
 *
 * 1. Detonar: en la última tirada (`tiradasRestantes === 1`) coloca en la celda más cercana al centro.
 * 2. Cargar: si no, entre las celdas donde, proyectando el efecto del grano (y de las colocaciones provisionales
 *    de la tirada), todas las celdas quedan por debajo del umbral, elige la de mayor carga proyectada en la
 *    propia celda; en empate, la primera por filas.
 * 3. Detonar por falta de sitio: si no hay ninguna celda válida para cargar, la más cercana al centro.
 *
 * Confirma cuando no queda ningún grano por colocar, nunca deshace, solo elige de la lista de acciones
 * recibida y devuelve el flujo sin consumirlo. Solo mira una tirada de profundidad.
 */
export const BOT_CARGADOR: Bot = {
  nombre: 'cargador',
  elegir(estado, acciones, azar) {
    const opciones = colocacionesDelPrimerGrano(acciones);
    const primera = opciones[0];
    if (primera === undefined) return [confirmar(acciones), azar];
    const { lado, umbral } = estado.config;
    const tipo = estado.mano[primera.indiceMano]?.tipo;
    if (tipo === undefined) throw new Error(`el grano ${primera.indiceMano} no está en la mano`);

    const centro = (): Colocar => masCercanaAlCentro(opciones, lado) ?? primera;
    if (estado.tiradasRestantes === 1) return [centro(), azar];

    let mejor: Colocar | undefined;
    let cargaMejor = -1;
    for (const opcion of opciones) {
      const proyectadas = proyectar(estado.celdas, estado.mano, { tipo, x: opcion.x, y: opcion.y });
      if (!proyectadas.every((fila) => fila.every((v) => v < umbral))) continue;
      const carga = proyectadas[opcion.y]?.[opcion.x] ?? 0;
      if (carga > cargaMejor) {
        mejor = opcion;
        cargaMejor = carga;
      }
    }
    return [mejor ?? centro(), azar];
  },
};
