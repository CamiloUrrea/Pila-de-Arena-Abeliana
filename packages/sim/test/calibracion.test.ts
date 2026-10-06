// Esta prueba protege la calibración de la ronda 1 (T2.5: multiplicadorPorOleada 50, meta 5000). Si falla tras un
// cambio de reglas o de CONFIG_INICIAL, hay que recalibrar con `pnpm --filter @pila/sim barrido` y ajustar los
// valores, en vez de relajar estos umbrales.
import { describe, expect, it } from 'vitest';
import { CONFIG_INICIAL } from '@pila/core';
import { BOTS } from '../src/bots/index.ts';
import { diferenciaEmparejada, tasa } from '../src/informe.ts';
import { semillaDeRonda, simularRonda } from '../src/simulacion.ts';

const RONDAS = 4000;
const SEMILLA_INICIAL = 1;

/** Victorias por semilla de un bot con `CONFIG_INICIAL`. */
function victorias(nombre: string): Map<number, boolean> {
  const bot = BOTS[nombre];
  if (bot === undefined) throw new Error(`bot desconocido: ${nombre}`);
  const porSemilla = new Map<number, boolean>();
  for (let i = 0; i < RONDAS; i++) {
    const r = simularRonda(CONFIG_INICIAL, semillaDeRonda(SEMILLA_INICIAL, i), bot);
    porSemilla.set(r.semilla, r.fase === 'ganada');
  }
  return porSemilla;
}

describe('calibración de la ronda 1 con CONFIG_INICIAL (4000 rondas, semilla inicial 1)', () => {
  const aleatorio = victorias('aleatorio');

  it('el aleatorio gana entre el 45 % y el 55 % de las rondas', () => {
    expect(tasa(aleatorio)).toBeGreaterThanOrEqual(0.45);
    expect(tasa(aleatorio)).toBeLessThanOrEqual(0.55);
  });

  it('el cargador saca al aleatorio al menos 10 puntos porcentuales, emparejado por semilla', () => {
    const d = diferenciaEmparejada(victorias('cargador'), aleatorio);
    expect(d.n).toBe(RONDAS);
    expect(d.media).toBeGreaterThanOrEqual(0.1);
  });

  it('el borde gana menos que el aleatorio', () => {
    expect(tasa(victorias('borde'))).toBeLessThan(tasa(aleatorio));
  });
});
