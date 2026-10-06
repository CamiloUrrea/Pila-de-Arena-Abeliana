import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CONFIG_INICIAL, crearRonda } from '@pila/core';
import type { Estado, TipoGrano } from '@pila/core';
import { construirCascada, muestrear } from '../src/cascada.ts';
import {
  colorMedidor,
  describirIndicadores,
  fichasTiradas,
  intensidadPulso,
  proporcionMedidor,
  puntosMostrados,
  suavizar,
} from '../src/indicadores.ts';
import { TEMA } from '../src/tema.ts';
import { jugar } from './bot.ts';

const { bajo, medio, lleno } = TEMA.indicadores.medidor.relleno;

/** Estados reales: el inicial y el de después de cada tirada de una partida del bot. */
function estadosDe(lado: number, semilla: number, semillaBot: number): Estado[] {
  const tiradas = jugar(lado, semilla, semillaBot, 8);
  return tiradas.length === 0 ? [] : [tiradas[0]!.antes, ...tiradas.map((t) => t.despues)];
}

const contar = (tipos: readonly TipoGrano[]): Record<TipoGrano, number> => {
  const r: Record<TipoGrano, number> = { normal: 0, pesado: 0, explosivo: 0 };
  for (const t of tipos) r[t]++;
  return r;
};

describe('proporcionMedidor', () => {
  it.each<[number, number, number]>([
    [0, 5000, 0],
    [2500, 5000, 0.5],
    [5000, 5000, 1],
    [7500, 5000, 1],
    [1e12, 5000, 1],
    [-100, 5000, 0],
    [100, 0, 0],
    [100, -5, 0],
    [100, 0.5, 0],
    [Number.NaN, 5000, 0],
    [100, Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 5000, 0],
    [100, Number.POSITIVE_INFINITY, 0],
  ])('proporcionMedidor(%d, %d) = %d', (puntos, meta, esperado) => {
    expect(proporcionMedidor(puntos, meta)).toBe(esperado);
  });

  it('propiedad: siempre en [0, 1] y nunca NaN', () => {
    fc.assert(
      fc.property(fc.double(), fc.double(), (p, m) => {
        const r = proporcionMedidor(p, m);
        expect(Number.isNaN(r)).toBe(false);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
      }),
    );
  });
});

describe('colorMedidor', () => {
  it.each<[number, number]>([
    [0, bajo],
    [0.49, bajo],
    [0.5, medio],
    [0.99, medio],
    [1, lleno],
    [2, lleno],
  ])('en %d es el color de su tramo', (p, color) => {
    expect(colorMedidor(p)).toBe(color);
  });

  it('los tres tramos son cian, amarillo y rosa', () => {
    expect([bajo, medio, lleno]).toEqual([0x00e5ff, 0xffe600, 0xff2e93]);
  });
});

describe('puntosMostrados', () => {
  const [t] = jugar(4, 2026, 3, 1);
  const cascada = (() => {
    if (t === undefined) throw new Error('sin tiradas');
    const { lado, umbral, multiplicadorPorOleada } = t.antes.config;
    const r = construirCascada(t.antes.celdas, t.eventos, lado, umbral, multiplicadorPorOleada);
    if (!r.ok) throw new Error(r.error.motivo);
    return r.valor;
  })();

  it('fuera de la cascada son los del estado', () => {
    expect(puntosMostrados(100, null, 750)).toBe(750);
  });

  it('durante la cascada son los de antes más los de la tirada hasta ese instante', () => {
    for (const f of [0, 0.3, 0.6, 1]) {
      const cuadro = muestrear(cascada, f * cascada.duracionTotal);
      expect(puntosMostrados(1200, cuadro, 99_999)).toBe(1200 + cuadro.puntosTirada);
    }
    expect(puntosMostrados(t?.antes.puntos ?? 0, muestrear(cascada, cascada.duracionTotal), 0)).toBe(t?.despues.puntos);
  });
});

describe('describirIndicadores con el núcleo', () => {
  const arb = fc.record({
    lado: fc.integer({ min: 1, max: 6 }),
    semilla: fc.nat({ max: 0xffffffff }),
    semillaBot: fc.nat({ max: 0xffffffff }),
  });

  it('propiedad: medidor y tiradas del estado; mazo + mano + usados es la composición configurada', () => {
    fc.assert(
      fc.property(arb, ({ lado, semilla, semillaBot }) => {
        for (const estado of estadosDe(lado, semilla, semillaBot)) {
          const copia = structuredClone(estado);
          const info = describirIndicadores(estado);
          expect(estado).toEqual(copia);
          expect(info.medidor.puntos).toBe(estado.puntos);
          expect(info.medidor.meta).toBe(estado.config.meta);
          expect(info.medidor.proporcion).toBe(proporcionMedidor(estado.puntos, estado.config.meta));
          expect(info.medidor.metaAlcanzada).toBe(estado.puntos >= estado.config.meta);
          expect(info.tiradas).toEqual({ total: estado.config.tiradas, restantes: estado.tiradasRestantes });
          expect(info.mazo.total).toBe(estado.mazo.length);
          expect(info.mazo.porTipo).toEqual(contar(estado.mazo));
          const mano = contar(estado.mano.map((g) => g.tipo));
          const usados = contar(estado.usados);
          for (const tipo of ['normal', 'pesado', 'explosivo'] as const) {
            expect(info.mazo.porTipo[tipo] + mano[tipo] + usados[tipo]).toBe(estado.config.mazo[tipo]);
          }
        }
      }),
      { numRuns: 50 },
    );
  });

  it('no revela el orden del mazo: es una estructura de recuentos, igual para cualquier orden', () => {
    const r = crearRonda(CONFIG_INICIAL, 42);
    if (!r.ok) throw new Error('configuración inválida');
    const estado = r.valor.estado;
    const invertido: Estado = { ...estado, mazo: [...estado.mazo].reverse() };
    expect(describirIndicadores(invertido)).toEqual(describirIndicadores(estado));
    const { mazo } = describirIndicadores(estado);
    expect(Object.keys(mazo).sort()).toEqual(['porTipo', 'total']);
    expect(Object.values(mazo.porTipo).every((n) => typeof n === 'number')).toBe(true);
    expect(JSON.stringify(describirIndicadores(estado))).not.toMatch(/\[/);
  });

  it('el texto del medidor es «P / M» con formatearPuntos, y se pueden pasar otros puntos', () => {
    const r = crearRonda(CONFIG_INICIAL, 1);
    if (!r.ok) throw new Error('configuración inválida');
    expect(describirIndicadores({ ...r.valor.estado, puntos: 1250 }).medidor.texto).toBe('12,5 / 50');
    const conOtros = describirIndicadores(r.valor.estado, 6000);
    expect(conOtros.medidor).toEqual({ puntos: 6000, meta: 5000, proporcion: 1, texto: '60 / 50', metaAlcanzada: true });
  });
});

describe('fichasTiradas', () => {
  it.each<[number, number, boolean[]]>([
    [5, 5, [true, true, true, true, true]],
    [5, 3, [true, true, true, false, false]],
    [5, 1, [true, false, false, false, false]],
    [5, 0, [false, false, false, false, false]],
    [3, 7, [true, true, true]],
    [3, -1, [false, false, false]],
    [0, 0, []],
  ])('con %i tiradas y %i restantes, llenas las que quedan', (total, restantes, esperado) => {
    expect(fichasTiradas({ total, restantes })).toEqual(esperado);
  });

  it('con partidas reales, las llenas son las tiradas restantes del estado', () => {
    for (const estado of estadosDe(3, 2026, 9)) {
      const llenas = fichasTiradas(describirIndicadores(estado).tiradas);
      expect(llenas).toHaveLength(estado.config.tiradas);
      expect(llenas.filter(Boolean)).toHaveLength(estado.tiradasRestantes);
      expect(llenas.slice(0, estado.tiradasRestantes).every(Boolean)).toBe(true);
    }
  });
});

describe('suavizar', () => {
  it('propiedad: se acerca al objetivo sin pasarse y de forma monótona', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e5, max: 1e5, noNaN: true }),
        fc.double({ min: -1e5, max: 1e5, noNaN: true }),
        fc.array(fc.double({ min: 0, max: 200, noNaN: true }), { minLength: 1, maxLength: 30 }),
        (inicio, objetivo, pasos) => {
          let v = inicio;
          for (const dt of pasos) {
            const siguiente = suavizar(v, objetivo, dt, 180);
            expect(Math.abs(objetivo - siguiente)).toBeLessThanOrEqual(Math.abs(objetivo - v) + 1e-9);
            // No se pasa: queda del mismo lado del objetivo (o en él).
            expect(Math.sign(objetivo - siguiente) * Math.sign(objetivo - inicio)).toBeGreaterThanOrEqual(0);
            v = siguiente;
          }
        },
      ),
    );
  });

  it('converge: muchos pasos pequeños llegan exactamente al objetivo', () => {
    let v = 0;
    for (let i = 0; i < 500; i++) v = suavizar(v, 5000, 16, 180);
    expect(v).toBe(5000);
  });

  it('con un dt grande llega al objetivo de una vez', () => {
    expect(suavizar(0, 5000, 1e6, 180)).toBe(5000);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('un dt de %d no cambia nada', (dt) => {
    expect(suavizar(10, 5000, dt, 180)).toBe(10);
  });

  it('con una constante no positiva va directo al objetivo', () => {
    expect(suavizar(10, 5000, 16, 0)).toBe(5000);
  });
});

describe('intensidadPulso', () => {
  it('propiedad: siempre en [0, 1] y periódico', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1e6, noNaN: true }), fc.double({ min: 10, max: 5000, noNaN: true }), (t, periodo) => {
        const v = intensidadPulso(t, periodo);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        expect(intensidadPulso(t + periodo, periodo)).toBeCloseTo(v, 6);
      }),
    );
  });

  it('va de 0 a 1 y vuelve a 0 en un período', () => {
    expect(intensidadPulso(0, 1200)).toBe(0);
    expect(intensidadPulso(600, 1200)).toBeCloseTo(1, 12);
    expect(intensidadPulso(1200, 1200)).toBeCloseTo(0, 12);
  });

  it.each<[number, number]>([
    [Number.NaN, 1200],
    [100, 0],
    [100, -5],
    [Number.POSITIVE_INFINITY, 1200],
  ])('con (%d, %d) devuelve 0', (t, p) => {
    expect(intensidadPulso(t, p)).toBe(0);
  });
});
