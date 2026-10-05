import type { Bot } from '../bot.ts';
import { BOT_CICLICO } from './ciclico.ts';

/** Registro de bots por nombre, para la línea de comandos y los informes. */
export const BOTS: Readonly<Record<string, Bot>> = {
  [BOT_CICLICO.nombre]: BOT_CICLICO,
};
