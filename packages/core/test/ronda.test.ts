import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  crearMazo,
  crearRonda,
  derivarFlujo,
  deserializar,
  enteroEnRango,
  robarMano,
  serializar,
  validarEstado,
} from '../src/index.ts';
import type { Config, Estado, Evento } from '../src/index.ts';
import { arbConfig, congelar } from './ayudantes.ts';

/** Configuración explícita para la regresión y los ejemplos: no depende de CONFIG_INICIAL, que se recalibra en H2. */
const CONFIG: Config = {
  lado: 3,
  umbral: 4,
  tiradas: 5,
  tamanoMano: 5,
  siembra: { min: 0, max: 2 },
  mazo: { normal: 20, pesado: 6, explosivo: 4 },
  meta: 1000,
  multiplicadorPorOleada: 10,
  topeOleadas: 1000,
};

function crearBien(config: Config, semilla: number): { readonly estado: Estado; readonly eventos: readonly Evento[] } {
  const resultado = crearRonda(config, semilla);
  if (!resultado.ok) throw new Error(`configuración inválida: ${JSON.stringify(resultado.error)}`);
  return resultado.valor;
}

const arbSemilla = fc.integer({ min: 0, max: 0xffffffff });

describe('crearRonda', () => {
  it('es determinista con la misma configuración y semilla', () => {
    fc.assert(
      fc.property(arbConfig, arbSemilla, (config, semilla) => {
        expect(crearRonda(config, semilla)).toEqual(crearRonda(config, semilla));
      }),
    );
  });

  it('semillas distintas dan estados distintos en una muestra', () => {
    const textos = Array.from({ length: 50 }, (_, semilla) => serializar(crearBien(CONFIG, semilla).estado));
    expect(new Set(textos).size).toBe(50);
  });

  it('siembra por filas con el flujo siembra, entre siembra.min y siembra.max, y deja la rejilla estable', () => {
    fc.assert(
      fc.property(arbConfig, arbSemilla, (config, semilla) => {
        const { estado } = crearBien(config, semilla);
        let flujo = derivarFlujo(semilla, 'siembra');
        const esperadas = estado.celdas.map((fila) =>
          fila.map(() => {
            const [valor, siguiente] = enteroEnRango(flujo, config.siembra.min, config.siembra.max);
            flujo = siguiente;
            return valor;
          }),
        );
        expect(estado.celdas).toEqual(esperadas);
        expect(estado.rng.siembra).toEqual(flujo);
        expect(estado.celdas).toHaveLength(config.lado);
        for (const v of estado.celdas.flat()) {
          expect(v).toBeGreaterThanOrEqual(config.siembra.min);
          expect(v).toBeLessThanOrEqual(config.siembra.max);
          expect(v).toBeLessThan(config.umbral);
        }
      }),
    );
  });

  it('en una muestra grande aparecen todos los valores del rango de siembra', () => {
    const config = { ...CONFIG, lado: 9, siembra: { min: 0, max: 3 } };
    const vistos = new Set(Array.from({ length: 10 }, (_, s) => crearBien(config, s).estado.celdas.flat()).flat());
    expect([...vistos].sort()).toEqual([0, 1, 2, 3]);
  });

  it('la mano es la cabeza del mazo barajado y el resto del estado es el inicial', () => {
    fc.assert(
      fc.property(arbConfig, arbSemilla, (config, semilla) => {
        const { estado, eventos } = crearBien(config, semilla);
        const barajado = crearMazo(config.mazo, derivarFlujo(semilla, 'mazo'));
        const robo = robarMano(barajado.mazo, [], config.tamanoMano, barajado.flujo);

        expect(estado.mano).toHaveLength(config.tamanoMano);
        expect(estado.mano.every((g) => g.celda === null)).toBe(true);
        expect(estado.mano.map((g) => g.tipo)).toEqual(barajado.mazo.slice(0, config.tamanoMano));
        expect(estado.mano).toEqual(robo.mano);
        expect(estado.mazo).toEqual(barajado.mazo.slice(config.tamanoMano));
        expect(estado.rng.mazo).toEqual(robo.flujo);
        expect(estado.usados).toEqual([]);
        expect(estado.ordenColocacion).toEqual([]);
        expect(estado.fase).toBe('colocando');
        expect(estado.tiradasRestantes).toBe(config.tiradas);
        expect(estado.puntos).toBe(0);
        expect(estado.config).toEqual(config);
        expect(eventos).toEqual([{ tipo: 'ManoRobada', tipos: estado.mano.map((g) => g.tipo) }]);
      }),
    );
  });

  it('el estado inicial es válido y sobrevive a la ida y vuelta de serialización', () => {
    fc.assert(
      fc.property(arbConfig, arbSemilla, (config, semilla) => {
        const { estado } = crearBien(config, semilla);
        expect(validarEstado(estado)).toEqual({ ok: true, valor: estado });
        expect(deserializar(serializar(estado))).toEqual({ ok: true, valor: estado });
      }),
    );
  });

  it.each<[string, Config, string]>([
    ['siembra.max igual al umbral', { ...CONFIG, siembra: { min: 0, max: 4 } }, 'siembra.max'],
    ['tamanoMano mayor que el mazo', { ...CONFIG, tamanoMano: 31 }, 'tamanoMano'],
    ['lado 0', { ...CONFIG, lado: 0 }, 'lado'],
  ])('devuelve el error de una configuración inválida: %s', (_, config, campo) => {
    const resultado = crearRonda(config, 1);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.campo).toBe(campo);
  });

  it.each([-1, 2 ** 32, 0.5, Number.NaN])('lanza RangeError con la semilla %s', (semilla) => {
    expect(() => crearRonda(CONFIG, semilla)).toThrow(RangeError);
  });

  it('no muta la configuración de entrada', () => {
    const config = congelar(copiaConfig(CONFIG));
    const { estado } = crearBien(config, 99);
    expect(config).toEqual(CONFIG);
    expect(estado.config).toEqual(CONFIG);
  });
});

function copiaConfig(config: Config): Config {
  return { ...config, siembra: { ...config.siembra }, mazo: { ...config.mazo } };
}

describe('independencia de flujos (especificación)', () => {
  it('cambiar la composición del mazo no cambia la rejilla sembrada', () => {
    fc.assert(
      fc.property(arbSemilla, (semilla) => {
        const a = crearBien(CONFIG, semilla).estado;
        const b = crearBien({ ...CONFIG, mazo: { normal: 18, pesado: 6, explosivo: 6 } }, semilla).estado;
        expect(b.celdas).toEqual(a.celdas);
        expect(b.rng.siembra).toEqual(a.rng.siembra);
      }),
    );
  });

  it.each<[number, number]>([
    [0, 3],
    [1, 1],
  ])('cambiar la siembra a [%i, %i] no cambia el orden del mazo', (min, max) => {
    fc.assert(
      fc.property(arbSemilla, (semilla) => {
        const a = crearBien(CONFIG, semilla).estado;
        const b = crearBien({ ...CONFIG, siembra: { min, max } }, semilla).estado;
        expect([...b.mano.map((g) => g.tipo), ...b.mazo]).toEqual([...a.mano.map((g) => g.tipo), ...a.mazo]);
        expect(b.rng.mazo).toEqual(a.rng.mazo);
      }),
    );
  });
});

describe('regresión (no independiente: valores fijados con esta implementación)', () => {
  it('crearRonda con la configuración explícita y la semilla 12345', () => {
    expect(serializar(crearBien(CONFIG, 12345).estado)).toBe(REGRESION_12345);
  });
});

const REGRESION_12345 = [
  '{"estado":{"celdas":[[2,0,2],[1,0,2],[2,0,2]],"config":{"lado":3,"mazo":{"explosivo":4,"normal":20,"',
  'pesado":6},"meta":1000,"multiplicadorPorOleada":10,"siembra":{"max":2,"min":0},"tamanoMano":5,"tirad',
  'as":5,"topeOleadas":1000,"umbral":4},"fase":"colocando","mano":[{"celda":null,"tipo":"pesado"},{"cel',
  'da":null,"tipo":"normal"},{"celda":null,"tipo":"normal"},{"celda":null,"tipo":"normal"},{"celda":nul',
  'l,"tipo":"normal"}],"mazo":["explosivo","normal","explosivo","normal","pesado","normal","pesado","no',
  'rmal","normal","pesado","normal","normal","normal","pesado","normal","normal","explosivo","pesado","',
  'normal","normal","explosivo","normal","normal","normal","normal"],"ordenColocacion":[],"puntos":0,"r',
  'ng":{"mazo":[4270033129,3302256988,1994151541,2874483822],"siembra":[579217689,1375515847,2629479506',
  ',1763144342]},"tiradasRestantes":5,"usados":[]},"formato":1}',
].join('');
