import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CONFIG_INICIAL } from '../src/index.ts';
import { resolverOleadas } from '../src/oleadas.ts';
import type { ParametrosOleadas, ResultadoOleadas } from '../src/oleadas.ts';
import type { Celdas } from '../src/tipos.ts';
import { arbCargaAlcanzable, arbRejillaArbitraria, eleccionCiclica, resolverUnoAUno } from './oraculos.ts';
import type { Carga } from './oraculos.ts';

const RUNS = { numRuns: 500 };
/** Tope alto: las cargas arbitrarias grandes superan legítimamente el tope normal. */
const TOPE_ALTO = 100_000;

const suma = (celdas: Celdas): number => celdas.flat().reduce((a, b) => a + b, 0);

function parametros(lado: number, extra: Partial<ParametrosOleadas> = {}): ParametrosOleadas {
  return { lado, umbral: 4, multiplicadorPorOleada: 10, topeOleadas: TOPE_ALTO, ...extra };
}

function resolverBien(carga: Carga, extra: Partial<ParametrosOleadas> = {}): ResultadoOleadas {
  const resultado = resolverOleadas(carga.celdas, parametros(carga.lado, extra));
  if (!resultado.ok) throw new Error(`no terminó: ${JSON.stringify(resultado.error)}`);
  return resultado.valor;
}

const GENERADORES = [
  ['rejillas arbitrarias', arbRejillaArbitraria],
  ['cargas alcanzables', arbCargaAlcanzable],
] as const;

describe('resolverOleadas: propiedades', () => {
  it('orden abeliano: coincide con el resolvedor uno a uno en cualquier orden', () => {
    fc.assert(
      fc.property(arbRejillaArbitraria, fc.array(fc.nat(), { minLength: 1, maxLength: 32 }), (carga, enteros) => {
        const paralelo = resolverBien(carga);
        const unoAUno = resolverUnoAUno(carga.celdas, carga.lado, eleccionCiclica(enteros));
        expect(paralelo.celdas).toEqual(unoAUno.celdas);
        expect(paralelo.derrumbesPorCelda).toEqual(unoAUno.derrumbesPorCelda);
        expect(paralelo.granosFuera).toBe(unoAUno.granosFuera);
      }),
      RUNS,
    );
  });

  it.each(GENERADORES)('conservación con %s: entrada = final + granosFuera', (_, arb) => {
    fc.assert(
      fc.property(arb, (carga) => {
        const r = resolverBien(carga);
        expect(suma(carga.celdas)).toBe(suma(r.celdas) + r.granosFuera);
      }),
      RUNS,
    );
  });

  it('estabilidad final: si devuelve ok, ninguna celda llega al umbral, también con topes bajos', () => {
    fc.assert(
      fc.property(
        arbRejillaArbitraria,
        fc.oneof(fc.integer({ min: 1, max: 10 }), fc.constant(TOPE_ALTO)),
        (carga, topeOleadas) => {
          const resultado = resolverOleadas(carga.celdas, parametros(carga.lado, { topeOleadas }));
          if (resultado.ok) {
            expect(resultado.valor.celdas.flat().every((v) => v < 4)).toBe(true);
            expect(resultado.valor.oleadas).toBeLessThanOrEqual(topeOleadas);
          } else {
            expect(topeOleadas).not.toBe(TOPE_ALTO);
            expect(resultado.error).toEqual({ tipo: 'ResolucionNoTermino', topeOleadas });
          }
        },
      ),
      RUNS,
    );
  });

  it('terminación: las cargas alcanzables terminan dentro del tope de CONFIG_INICIAL', () => {
    fc.assert(
      fc.property(arbCargaAlcanzable, (carga) => {
        const resultado = resolverOleadas(carga.celdas, {
          lado: carga.lado,
          umbral: CONFIG_INICIAL.umbral,
          multiplicadorPorOleada: CONFIG_INICIAL.multiplicadorPorOleada,
          topeOleadas: CONFIG_INICIAL.topeOleadas,
        });
        expect(resultado.ok).toBe(true);
        if (resultado.ok) expect(resultado.valor.oleadas).toBeLessThanOrEqual(CONFIG_INICIAL.topeOleadas);
      }),
      RUNS,
    );
  });

  it.each(GENERADORES)('idempotencia con %s: resolver lo resuelto no cambia nada', (_, arb) => {
    fc.assert(
      fc.property(arb, (carga) => {
        const r = resolverBien(carga);
        const otra = resolverBien({ lado: carga.lado, celdas: r.celdas.map((fila) => [...fila]) });
        expect(otra.oleadas).toBe(0);
        expect(otra.eventos).toEqual([]);
        expect(otra.celdas).toEqual(r.celdas);
      }),
      RUNS,
    );
  });

  it.each(GENERADORES)('determinismo con %s: misma entrada, mismo resultado y mismos eventos', (_, arb) => {
    fc.assert(
      fc.property(arb, fc.integer({ min: 0, max: 100 }), (carga, multiplicadorPorOleada) => {
        expect(resolverBien(carga, { multiplicadorPorOleada })).toEqual(resolverBien(carga, { multiplicadorPorOleada }));
      }),
      RUNS,
    );
  });

  it.each(GENERADORES)('coherencia de eventos con %s', (_, arb) => {
    fc.assert(
      fc.property(arb, fc.integer({ min: 0, max: 100 }), (carga, multiplicadorPorOleada) => {
        const r = resolverBien(carga, { multiplicadorPorOleada });
        const fuera = r.eventos.flatMap((e) => (e.tipo === 'GranoFuera' ? [e] : []));
        const terminadas = r.eventos.flatMap((e) => (e.tipo === 'OleadaTerminada' ? [e] : []));
        const iniciadas = r.eventos.flatMap((e) => (e.tipo === 'OleadaIniciada' ? [e] : []));
        const numeradas = Array.from({ length: r.oleadas }, (_, i) => i + 1);

        expect(fuera.reduce((t, e) => t + e.puntos, 0)).toBe(r.puntos);
        expect(r.eventos.filter((e) => e.tipo === 'Derrumbe')).toHaveLength(r.derrumbes);
        expect(iniciadas.map((e) => e.k)).toEqual(numeradas);
        expect(terminadas.map((e) => e.k)).toEqual(numeradas);
        expect(terminadas.reduce((t, e) => t + e.granosFuera, 0)).toBe(r.granosFuera);
      }),
      RUNS,
    );
  });
});

describe('cobertura de los generadores', () => {
  // Pisos calibrados con 5 muestras de 1000 (ver T1.4): arbitrarias ≈87 % con ≥2 oleadas y ≈68 % con ≥5;
  // alcanzables ≈59 % con ≥2 y ≈16 % con ≥5. Con 1000 muestras la desviación típica ronda 1,5 puntos.
  it.each<[string, fc.Arbitrary<Carga>, number, number]>([
    ['rejillas arbitrarias', arbRejillaArbitraria, 0.75, 0.55],
    ['cargas alcanzables', arbCargaAlcanzable, 0.45, 0.08],
  ])('%s: suficientes casos con 2 o más y con 5 o más oleadas', (_, arb, pisoDos, pisoCinco) => {
    const oleadas = fc.sample(arb, 1000).map((carga) => resolverBien(carga).oleadas);
    const proporcion = (minimo: number): number => oleadas.filter((o) => o >= minimo).length / oleadas.length;
    expect(proporcion(2)).toBeGreaterThanOrEqual(pisoDos);
    expect(proporcion(5)).toBeGreaterThanOrEqual(pisoCinco);
  });
});
