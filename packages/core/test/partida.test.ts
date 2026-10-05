import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { aplicar, deserializar, reproducir, serializar, validarEstado } from '../src/index.ts';
import type { Accion, Estado, Evento } from '../src/index.ts';
import type { Celdas } from '../src/tipos.ts';
import { arbEscenario, jugar, rondaDe } from './bot.ts';
import type { Partida } from './bot.ts';

const suma = (celdas: Celdas): number => celdas.flat().reduce((a, b) => a + b, 0);

/** Aplica las acciones en orden, exigiendo que todas se acepten. */
function seguir(estado: Estado, acciones: readonly Accion[]): { readonly estado: Estado; readonly eventos: Evento[] } {
  const eventos: Evento[] = [];
  let actual = estado;
  for (const accion of acciones) {
    const paso = aplicar(actual, accion);
    if (!paso.ok) throw new Error(`acción rechazada: ${JSON.stringify(paso.error)}`);
    actual = paso.valor.estado;
    eventos.push(...paso.valor.eventos);
  }
  return { estado: actual, eventos };
}

/** Hubo reciclaje si algún Confirmar que continúa la ronda consumió el flujo mazo. */
const huboReciclaje = (partida: Partida): boolean =>
  partida.pasos.some(
    (p) => p.accion.tipo === 'Confirmar' && p.despues.fase === 'colocando' && p.despues.rng.mazo.join() !== p.antes.rng.mazo.join(),
  );

describe('partida completa con un bot', () => {
  it('estado válido, puntos crecientes, conservación, fin único, robos en su sitio y serialización a mitad', () => {
    fc.assert(
      fc.property(arbEscenario, (escenario) => {
        const ronda = rondaDe(escenario);
        const partida = jugar(ronda.estado, escenario.enteros);
        const { config } = escenario;

        let puntos = ronda.estado.puntos;
        for (const { accion, antes, despues, eventos } of partida.pasos) {
          expect(validarEstado(despues)).toEqual({ ok: true, valor: despues });
          expect(despues.puntos).toBeGreaterThanOrEqual(puntos);
          puntos = despues.puntos;
          if (accion.tipo === 'Confirmar') {
            const anadidos = eventos.reduce((t, e) => t + (e.tipo === 'AdicionAplicada' ? e.cantidad : 0), 0);
            const fuera = eventos.filter((e) => e.tipo === 'GranoFuera').length;
            expect(suma(antes.celdas) + anadidos).toBe(suma(despues.celdas) + fuera);
          }
        }

        const eventos = [...ronda.eventos, ...partida.pasos.flatMap((p) => p.eventos)];
        const finales = eventos.filter((e) => e.tipo === 'RondaGanada' || e.tipo === 'RondaPerdida');
        expect(finales).toHaveLength(1);
        expect(finales[0]?.tipo).toBe(partida.final.fase === 'ganada' ? 'RondaGanada' : 'RondaPerdida');
        expect(eventos.filter((e) => e.tipo === 'TiradaConfirmada').length).toBeLessThanOrEqual(config.tiradas);
        for (const [i, e] of eventos.entries()) {
          if (e.tipo === 'ManoRobada' && i > 0) expect(eventos[i - 1]?.tipo).toBe('TiradaResuelta');
        }
        expect(eventos[0]?.tipo).toBe('ManoRobada');

        const acciones = partida.pasos.map((p) => p.accion);
        expect(reproducir(config, escenario.semilla, acciones)).toEqual({
          ok: true,
          valor: { estado: partida.final, eventos },
        });

        // Serialización (pendiente de T1.1): ida y vuelta en un paso intermedio y seguir jugando desde ambos.
        const corte = escenario.corte % (partida.pasos.length + 1);
        const intermedio = corte === 0 ? ronda.estado : partida.pasos[corte - 1]?.despues;
        if (intermedio === undefined) throw new Error('paso intermedio inexistente');
        const recuperado = deserializar(serializar(intermedio));
        expect(recuperado).toEqual({ ok: true, valor: intermedio });
        if (recuperado.ok) {
          const resto = acciones.slice(corte);
          expect(seguir(recuperado.valor, resto)).toEqual(seguir(intermedio, resto));
          expect(seguir(recuperado.valor, resto).estado).toEqual(partida.final);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('cobertura del generador: ganadas, perdidas y con reciclaje', () => {
    // Medido con 4 muestras de 1000 partidas: ganadas 47,6–50,1 %, perdidas 49,9–52,4 %,
    // con reciclaje 10,5–14,4 %. Pisos varias desviaciones típicas por debajo.
    const partidas = fc.sample(arbEscenario, 1000).map((e) => jugar(rondaDe(e).estado, e.enteros));
    const proporcion = (f: (p: Partida) => boolean) => partidas.filter(f).length / partidas.length;
    expect(proporcion((p) => p.final.fase === 'ganada')).toBeGreaterThanOrEqual(0.35);
    expect(proporcion((p) => p.final.fase === 'perdida')).toBeGreaterThanOrEqual(0.35);
    expect(proporcion(huboReciclaje)).toBeGreaterThanOrEqual(0.06);
  });
});
