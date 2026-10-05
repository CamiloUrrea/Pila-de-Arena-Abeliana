import type { Accion } from '@pila/core';
import type { Bot } from '../bot.ts';

/**
 * Bot cíclico, determinista y sin azar: coloca el grano sin colocar de menor índice en la siguiente celda de un
 * recorrido cíclico por filas, y confirma cuando la mano está completa. Nunca deshace.
 *
 * El recorrido continúa entre tiradas. Como el bot no guarda estado, la posición del cursor se deduce del estado:
 * las tiradas ya jugadas por `tamanoMano` (en H1 toda mano tiene ese tamaño) más los granos ya colocados.
 */
export const BOT_CICLICO: Bot = {
  nombre: 'ciclico',
  elegir(estado, acciones, azar) {
    const confirmar = acciones.find((a) => a.tipo === 'Confirmar');
    if (confirmar !== undefined) return [confirmar, azar];

    const { lado, tiradas, tamanoMano } = estado.config;
    const indiceMano = estado.mano.findIndex((grano) => grano.celda === null);
    const cursor = (tiradas - estado.tiradasRestantes) * tamanoMano + estado.ordenColocacion.length;
    const celda = cursor % (lado * lado);
    const accion: Accion = { tipo: 'Colocar', indiceMano, x: celda % lado, y: Math.floor(celda / lado) };
    return [accion, azar];
  },
};
