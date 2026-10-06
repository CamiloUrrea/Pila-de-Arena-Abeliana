// Resumen puro de una sesión a partir de sus registros, en el orden en que se jugaron.
import type { RegistroRonda } from './registro.ts';

export type ResumenSesion = {
  readonly rondas: number;
  readonly ganadas: number;
  readonly perdidas: number;
  /** Victorias consecutivas contadas desde la última ronda hacia atrás; una derrota la rompe. */
  readonly rachaActual: number;
  readonly mejorRacha: number;
  /** Registros en los que el jugador pidió otra ronda. */
  readonly pidioOtra: number;
};

export function resumenSesion(registros: readonly RegistroRonda[]): ResumenSesion {
  let ganadas = 0;
  let racha = 0;
  let mejorRacha = 0;
  let pidioOtra = 0;
  for (const r of registros) {
    if (r.resultado === 'ganada') {
      ganadas++;
      racha++;
      mejorRacha = Math.max(mejorRacha, racha);
    } else {
      racha = 0;
    }
    if (r.pidioOtra) pidioOtra++;
  }
  return { rondas: registros.length, ganadas, perdidas: registros.length - ganadas, rachaActual: racha, mejorRacha, pidioOtra };
}
