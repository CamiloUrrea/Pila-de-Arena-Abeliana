import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CONFIG_INICIAL, crearRejilla, resolverTirada, validarEstado } from '../src/index.ts';
import type { Celdas, Config, Estado, GranoMano, ResolucionTirada } from '../src/index.ts';
import { arbEstadoListoParaConfirmar, congelar, conMano, estadoDePrueba } from './ayudantes.ts';

const suma = (celdas: Celdas): number => celdas.flat().reduce((a, b) => a + b, 0);

/** Estado de los ejemplos de oro: tamanoMano 1, 5 tiradas, ninguna jugada y 0 puntos. */
function estadoOro(celdas: Celdas, mano: readonly GranoMano[], config: Partial<Config> = {}): Estado {
  const base = estadoDePrueba({
    config: { ...CONFIG_INICIAL, lado: celdas.length, tamanoMano: 1, tiradas: 5, ...config },
    celdas,
    tiradasRestantes: 5,
    puntos: 0,
  });
  return conMano(base, mano);
}

function resolverBien(estado: Estado): ResolucionTirada {
  const resultado = resolverTirada(estado);
  if (!resultado.ok) throw new Error(`no terminó: ${JSON.stringify(resultado.error)}`);
  return resultado.valor;
}

const normalEn = (x: number, y: number): GranoMano => ({ tipo: 'normal', celda: { x, y } });

const ANTES_A: Celdas = [
  [3, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
];

describe('resolverTirada: ejemplos de oro', () => {
  it('A: derrumbe en una esquina, con la secuencia exacta de eventos', () => {
    const r = resolverBien(estadoOro(ANTES_A, [normalEn(0, 0)]));
    expect(r.celdas).toEqual([
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, 0],
    ]);
    expect([r.puntos, r.tiradasRestantes, r.usados]).toEqual([200, 4, ['normal']]);
    expect(r.eventos).toEqual([
      { tipo: 'TiradaConfirmada', numero: 1 },
      { tipo: 'AdicionAplicada', x: 0, y: 0, cantidad: 1 },
      { tipo: 'OleadaIniciada', k: 1, celdas: [{ x: 0, y: 0 }] },
      { tipo: 'Derrumbe', k: 1, x: 0, y: 0 },
      { tipo: 'GranoFuera', k: 1, x: 0, y: 0, direccion: 'arriba', puntos: 100 },
      { tipo: 'GranoFuera', k: 1, x: 0, y: 0, direccion: 'izquierda', puntos: 100 },
      { tipo: 'OleadaTerminada', k: 1, derrumbes: 1, granosFuera: 2, puntosGanados: 200 },
      { tipo: 'TiradaResuelta', oleadas: 1, granosFuera: 2, puntosGanados: 200, puntosTotales: 200 },
    ]);
  });

  it('B: cascada completa', () => {
    const r = resolverBien(estadoOro(crearRejilla(3, 3), [normalEn(1, 1)]));
    expect(r.celdas).toEqual([
      [1, 3, 1],
      [3, 0, 3],
      [1, 3, 1],
    ]);
    expect([r.puntos, r.tiradasRestantes, r.usados]).toEqual([1400, 4, ['normal']]);
    expect([r.oleadas, r.derrumbes, r.granosFuera, r.puntosGanados]).toEqual([3, 10, 12, 1400]);
  });

  it('C: explosivo en una esquina', () => {
    const r = resolverBien(estadoOro(crearRejilla(3), [{ tipo: 'explosivo', celda: { x: 0, y: 0 } }]));
    expect(r.celdas).toEqual([
      [1, 1, 0],
      [1, 0, 0],
      [0, 0, 0],
    ]);
    expect([r.puntos, r.tiradasRestantes, r.usados, r.oleadas]).toEqual([0, 4, ['explosivo'], 0]);
  });
});

describe('resolverTirada: medidor y multiplicador', () => {
  it('acumula sobre los puntos previos: 500 + 200 del ejemplo A', () => {
    const estado = { ...estadoOro(ANTES_A, [normalEn(0, 0)]), puntos: 500 };
    expect(resolverBien(estado).puntos).toBe(700);
  });

  it('dos tiradas seguidas suman sus puntos', () => {
    const primera = estadoOro(ANTES_A, [normalEn(0, 0)]);
    const r1 = resolverBien(primera);
    const segunda = conMano(
      { ...primera, celdas: r1.celdas, puntos: r1.puntos, usados: r1.usados, tiradasRestantes: r1.tiradasRestantes },
      [normalEn(1, 0), { tipo: 'pesado', celda: { x: 1, y: 0 } }],
    );
    const r2 = resolverBien(segunda);
    expect(r2.eventos[0]).toEqual({ tipo: 'TiradaConfirmada', numero: 2 });
    expect(r2.puntosGanados).toBe(100);
    expect(r2.puntos).toBe(r1.puntos + r2.puntosGanados);
    expect(r2.puntos).toBe(300);
    expect(r2.tiradasRestantes).toBe(3);
  });

  it.each<[number, number]>([
    [0, 800],
    [10, 840],
    [15, 860],
  ])('[[7]] más un normal con multiplicador %i da %i centésimas', (multiplicadorPorOleada, puntos) => {
    const r = resolverBien(estadoOro([[7]], [normalEn(0, 0)], { multiplicadorPorOleada }));
    expect([r.oleadas, r.granosFuera, r.puntosGanados, r.puntos]).toEqual([2, 8, puntos, puntos]);
  });

  it.each<[number, number]>([
    [5, 1],
    [4, 2],
    [1, 5],
  ])('con 5 tiradas y %i restantes confirma la tirada número %i', (tiradasRestantes, numero) => {
    const r = resolverBien({ ...estadoOro(ANTES_A, [normalEn(0, 0)]), tiradasRestantes });
    expect(r.eventos[0]).toEqual({ tipo: 'TiradaConfirmada', numero });
    expect(r.tiradasRestantes).toBe(tiradasRestantes - 1);
  });
});

describe('resolverTirada: propiedades', () => {
  const RUNS = { numRuns: 300 };

  it('composición: el estado siguiente sin mano pasa validarEstado', () => {
    fc.assert(
      fc.property(arbEstadoListoParaConfirmar, (estado) => {
        const r = resolverBien(estado);
        // Sin el paso 5 (T1.7b) la fase no cambia; se le da la coherente con puntos y tiradas
        // para que validarEstado juzgue la composición y no la fase.
        const fase = r.puntos >= estado.config.meta ? 'ganada' : r.tiradasRestantes === 0 ? 'perdida' : 'colocando';
        const siguiente: Estado = {
          ...estado,
          fase,
          celdas: r.celdas,
          puntos: r.puntos,
          usados: r.usados,
          tiradasRestantes: r.tiradasRestantes,
          mano: [],
          ordenColocacion: [],
        };
        expect(validarEstado(siguiente)).toEqual({ ok: true, valor: siguiente });
      }),
      RUNS,
    );
  });

  it('puntos, conservación, estabilidad, usados, tiradas, número y orden de eventos', () => {
    fc.assert(
      fc.property(arbEstadoListoParaConfirmar, (estado) => {
        const r = resolverBien(estado);
        const de = <T extends string>(tipo: T) => r.eventos.filter((e) => e.tipo === tipo);
        const fuera = r.eventos.flatMap((e) => (e.tipo === 'GranoFuera' ? [e.puntos] : []));
        const terminadas = r.eventos.flatMap((e) => (e.tipo === 'OleadaTerminada' ? [e.puntosGanados] : []));
        const adiciones = r.eventos.flatMap((e) => (e.tipo === 'AdicionAplicada' ? [e.cantidad] : []));
        const total = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

        expect(total(fuera)).toBe(r.puntosGanados);
        expect(total(terminadas)).toBe(r.puntosGanados);
        expect(r.puntos).toBe(estado.puntos + r.puntosGanados);
        expect(suma(estado.celdas) + total(adiciones)).toBe(suma(r.celdas) + r.granosFuera);
        expect(r.celdas.flat().every((v) => v < estado.config.umbral)).toBe(true);
        expect(r.usados).toEqual([...estado.usados, ...estado.mano.map((g) => g.tipo)]);
        expect(r.tiradasRestantes).toBe(estado.tiradasRestantes - 1);

        expect(r.eventos[0]).toEqual({
          tipo: 'TiradaConfirmada',
          numero: estado.config.tiradas - estado.tiradasRestantes + 1,
        });
        expect(r.eventos.at(-1)).toEqual({
          tipo: 'TiradaResuelta',
          oleadas: r.oleadas,
          granosFuera: r.granosFuera,
          puntosGanados: r.puntosGanados,
          puntosTotales: r.puntos,
        });
        expect(de('TiradaConfirmada')).toHaveLength(1);
        expect(de('TiradaResuelta')).toHaveLength(1);
        const ultimaAdicion = r.eventos.findLastIndex((e) => e.tipo === 'AdicionAplicada');
        const primeraOleada = r.eventos.findIndex((e) => e.tipo === 'OleadaIniciada');
        if (primeraOleada >= 0) expect(ultimaAdicion).toBeLessThan(primeraOleada);
      }),
      RUNS,
    );
  });

  it('es determinista y no muta la entrada', () => {
    fc.assert(
      fc.property(arbEstadoListoParaConfirmar, (estado) => {
        const copia = copiaProfunda(estado);
        const r = resolverBien(congelar(estado));
        expect(estado).toEqual(copia);
        expect(resolverBien(estado)).toEqual(r);
      }),
      RUNS,
    );
  });

  it('monotonía: un multiplicador mayor nunca da menos puntos y no cambia oleadas ni granos fuera', () => {
    fc.assert(
      fc.property(arbEstadoListoParaConfirmar, fc.integer({ min: 0, max: 100 }), (estado, extra) => {
        const mayor = {
          ...estado,
          config: { ...estado.config, multiplicadorPorOleada: estado.config.multiplicadorPorOleada + extra },
        };
        const a = resolverBien(estado);
        const b = resolverBien(mayor);
        expect(b.puntosGanados).toBeGreaterThanOrEqual(a.puntosGanados);
        expect([b.oleadas, b.granosFuera, b.celdas]).toEqual([a.oleadas, a.granosFuera, a.celdas]);
      }),
      RUNS,
    );
  });
});

/** Copia profunda de un estado JSON plano, para comparar después de resolver. */
function copiaProfunda(estado: Estado): Estado {
  return {
    ...estado,
    config: { ...estado.config, siembra: { ...estado.config.siembra }, mazo: { ...estado.config.mazo } },
    celdas: estado.celdas.map((fila) => [...fila]),
    mano: estado.mano.map((g) => ({ tipo: g.tipo, celda: g.celda === null ? null : { ...g.celda } })),
    ordenColocacion: [...estado.ordenColocacion],
    mazo: [...estado.mazo],
    usados: [...estado.usados],
    rng: { siembra: [...estado.rng.siembra], mazo: [...estado.rng.mazo] },
  };
}

describe('resolverTirada: errores', () => {
  it('con topeOleadas bajo devuelve ResolucionNoTermino sin resultado', () => {
    expect(resolverTirada(estadoOro(crearRejilla(3, 3), [normalEn(1, 1)], { topeOleadas: 2 }))).toEqual({
      ok: false,
      error: { tipo: 'ResolucionNoTermino', topeOleadas: 2 },
    });
  });

  const valido = estadoOro(ANTES_A, [normalEn(0, 0)]);
  it.each<[string, Estado]>([
    ['fase ganada', { ...valido, fase: 'ganada' }],
    ['fase perdida', { ...valido, fase: 'perdida' }],
    ['mano vacía', conMano(valido, [])],
    ['grano sin celda', conMano(valido, [{ tipo: 'normal', celda: null }])],
    ['celda fuera de la rejilla', conMano(valido, [normalEn(3, 0)])],
    ['celda negativa', conMano(valido, [normalEn(0, -1)])],
    ['sin tiradas restantes', { ...valido, tiradasRestantes: 0 }],
  ])('lanza RangeError con %s', (_, estado) => {
    expect(() => resolverTirada(estado)).toThrow(RangeError);
  });
});
