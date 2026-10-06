import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Estado, Evento } from '@pila/core';
import { construirCascada, escalaPopup, factorAceleracion, muestrear, valorGranoFuera } from '../src/cascada.ts';
import type { Cascada, Paso, PasoDerrumbe } from '../src/cascada.ts';
import { TEMA } from '../src/tema.ts';
import { formatearPuntos } from '../src/textos.ts';
import { jugar } from './bot.ts';
import type { Tirada } from './bot.ts';

type Celdas = Estado['celdas'];
const UMBRAL = 4;

function cascadaDe(t: Tirada): Cascada {
  const { lado, umbral, multiplicadorPorOleada } = t.antes.config;
  const r = construirCascada(t.antes.celdas, t.eventos, lado, umbral, multiplicadorPorOleada);
  if (!r.ok) throw new Error(`cascada inválida: ${r.error.motivo}`);
  return r.valor;
}

const puntosResueltos = (eventos: readonly Evento[]): number => {
  const e = eventos.find((x) => x.tipo === 'TiradaResuelta');
  return e?.tipo === 'TiradaResuelta' ? e.puntosGanados : Number.NaN;
};

/** Instante de inicio de cada paso. */
const inicios = (c: Cascada): number[] => {
  let t = 0;
  return c.pasos.map((p) => {
    const inicio = t;
    t += p.duracion;
    return inicio;
  });
};

/**
 * Rejilla de lado 3 con 4 granos en el centro de cada borde: en la oleada 1 sale un grano por cada lado, y el centro
 * recibe 4 y cae en la oleada 2, sin granos fuera. Sirve para comprobar las cuatro direcciones a la vez.
 */
const cruz: Celdas = [
  [0, 4, 0],
  [4, 0, 4],
  [0, 4, 0],
];
const eventosCruz = (): Evento[] => [
  { tipo: 'TiradaConfirmada', numero: 1 },
  { tipo: 'OleadaIniciada', k: 1, celdas: [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }] },
  { tipo: 'Derrumbe', k: 1, x: 1, y: 0 },
  { tipo: 'GranoFuera', k: 1, x: 1, y: 0, direccion: 'arriba', puntos: 100 },
  { tipo: 'Derrumbe', k: 1, x: 0, y: 1 },
  { tipo: 'GranoFuera', k: 1, x: 0, y: 1, direccion: 'izquierda', puntos: 100 },
  { tipo: 'Derrumbe', k: 1, x: 2, y: 1 },
  { tipo: 'GranoFuera', k: 1, x: 2, y: 1, direccion: 'derecha', puntos: 100 },
  { tipo: 'Derrumbe', k: 1, x: 1, y: 2 },
  { tipo: 'GranoFuera', k: 1, x: 1, y: 2, direccion: 'abajo', puntos: 100 },
  { tipo: 'OleadaTerminada', k: 1, derrumbes: 4, granosFuera: 4, puntosGanados: 400 },
  { tipo: 'OleadaIniciada', k: 2, celdas: [{ x: 1, y: 1 }] },
  { tipo: 'Derrumbe', k: 2, x: 1, y: 1 },
  { tipo: 'OleadaTerminada', k: 2, derrumbes: 1, granosFuera: 0, puntosGanados: 0 },
  { tipo: 'TiradaResuelta', oleadas: 2, granosFuera: 4, puntosGanados: 400, puntosTotales: 400 },
];

function cascadaCruz(m = 50): Cascada {
  const r = construirCascada(cruz, eventosCruz(), 3, UMBRAL, m);
  if (!r.ok) throw new Error(r.error.motivo);
  return r.valor;
}

/** Partidas del bot con multiplicadores de 0 a 100. */
const arbPartida = fc.record({
  lado: fc.integer({ min: 3, max: 5 }),
  semilla: fc.nat({ max: 0xffffffff }),
  semillaBot: fc.nat({ max: 0xffffffff }),
  multiplicador: fc.integer({ min: 0, max: 100 }),
});

describe('validación de los puntos', () => {
  it('la cascada de la cruz es válida y termina como dice la geometría', () => {
    expect(cascadaCruz().celdasFinales).toEqual([
      [2, 1, 2],
      [1, 0, 1],
      [2, 1, 2],
    ]);
  });

  it('propiedad: con partidas reales y multiplicadores de 0 a 100, la cascada siempre es válida', () => {
    fc.assert(
      fc.property(arbPartida, ({ lado, semilla, semillaBot, multiplicador }) => {
        for (const t of jugar(lado, semilla, semillaBot, 6, { multiplicadorPorOleada: multiplicador })) {
          const r = construirCascada(t.antes.celdas, t.eventos, lado, UMBRAL, multiplicador);
          expect(r.ok).toBe(true);
          if (r.ok) expect(r.valor.puntosGanados).toBe(puntosResueltos(t.eventos));
        }
      }),
      { numRuns: 50 },
    );
  });

  it('un GranoFuera cuyos puntos no cuadran con la fórmula da CascadaInvalida', () => {
    const malos = eventosCruz().map((e) => (e.tipo === 'GranoFuera' && e.direccion === 'derecha' ? { ...e, puntos: 150 } : e));
    const r = construirCascada(cruz, malos, 3, UMBRAL, 50);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.tipo).toBe('CascadaInvalida');
  });

  it('con el multiplicador equivocado, los granos de una oleada k ≥ 2 de una partida real no cuadran', () => {
    for (const semilla of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      for (const t of jugar(5, semilla, semilla, 10)) {
        const fueraTarde = t.eventos.some((e) => e.tipo === 'GranoFuera' && e.k >= 2);
        if (!fueraTarde) continue;
        const r = construirCascada(t.antes.celdas, t.eventos, 5, UMBRAL, t.antes.config.multiplicadorPorOleada + 1);
        expect(r.ok).toBe(false);
        return;
      }
    }
    throw new Error('ninguna partida tuvo granos fuera en una oleada k ≥ 2');
  });

  it('los totales de OleadaTerminada y TiradaResuelta deben cuadrar con los GranoFuera', () => {
    const oleada = eventosCruz().map((e) => (e.tipo === 'OleadaTerminada' && e.k === 1 ? { ...e, puntosGanados: 300 } : e));
    expect(construirCascada(cruz, oleada, 3, UMBRAL, 50).ok).toBe(false);
    const tirada = eventosCruz().map((e) => (e.tipo === 'TiradaResuelta' ? { ...e, puntosGanados: 500 } : e));
    expect(construirCascada(cruz, tirada, 3, UMBRAL, 50).ok).toBe(false);
    const oleadas = eventosCruz().map((e) => (e.tipo === 'TiradaResuelta' ? { ...e, oleadas: 3 } : e));
    expect(construirCascada(cruz, oleadas, 3, UMBRAL, 50).ok).toBe(false);
  });

  it.each([-1, 1.5, Number.NaN])('un multiplicador %d da CascadaInvalida', (m) => {
    expect(construirCascada(cruz, eventosCruz(), 3, UMBRAL, m).ok).toBe(false);
  });

  it('valorGranoFuera sigue la fórmula 100 + m × (k − 1)', () => {
    expect([1, 2, 3, 4].map((k) => valorGranoFuera(k, 50))).toEqual([100, 150, 200, 250]);
    expect([1, 5].map((k) => valorGranoFuera(k, 0))).toEqual([100, 100]);
  });
});

describe('aceleración progresiva', () => {
  it('el factor es max(0,4; 0,9^(k − 1)) para k de 1 a 12', () => {
    const esperados = [1, 0.9, 0.81, 0.729, 0.6561, 0.59049, 0.531441, 0.4782969, 0.43046721, 0.4, 0.4, 0.4];
    for (const [i, f] of esperados.entries()) expect(factorAceleracion(i + 1)).toBeCloseTo(f, 10);
    expect(factorAceleracion(1)).toBe(1);
    expect(factorAceleracion(100)).toBe(0.4);
    expect(TEMA.animacion.aceleracion).toEqual({ razon: 0.9, minimo: 0.4 });
  });

  it('propiedad: en partidas reales, alerta y derrumbe duran la base por el factor, sin bajar del 40 %; la adición no cambia', () => {
    const { duraciones } = TEMA.animacion;
    fc.assert(
      fc.property(arbPartida, ({ lado, semilla, semillaBot }) => {
        for (const t of jugar(lado, semilla, semillaBot, 6)) {
          const c = cascadaDe(t);
          for (const p of c.pasos) {
            if (p.tipo === 'adicion') {
              expect(p.duracion).toBe(duraciones.adicion);
              continue;
            }
            const esperado = duraciones[p.tipo] * Math.max(0.4, 0.9 ** (p.k - 1));
            expect(p.duracion).toBeCloseTo(esperado, 9);
            expect(p.duracion).toBeGreaterThanOrEqual(duraciones[p.tipo] * 0.4 - 1e-9);
            if (p.k === 1) expect(p.duracion).toBe(duraciones[p.tipo]);
          }
          expect(c.duracionTotal).toBeCloseTo(c.pasos.reduce((a, p) => a + p.duracion, 0), 9);
        }
      }),
      { numRuns: 40 },
    );
  });
});

describe('puntos flotantes', () => {
  it('uno por GranoFuera del derrumbe en curso, con el texto de sus puntos; ninguno fuera de los derrumbes', () => {
    fc.assert(
      fc.property(arbPartida, ({ lado, semilla, semillaBot, multiplicador }) => {
        for (const t of jugar(lado, semilla, semillaBot, 6, { multiplicadorPorOleada: multiplicador })) {
          const c = cascadaDe(t);
          let suma = 0;
          for (const [i, p] of c.pasos.entries()) {
            const cuadro = muestrear(c, (inicios(c)[i] ?? 0) + 0.5 * p.duracion);
            if (p.tipo !== 'derrumbe') {
              expect(cuadro.popups).toEqual([]);
              continue;
            }
            const fuera = t.eventos.filter((e) => e.tipo === 'GranoFuera' && e.k === p.k);
            expect(cuadro.popups).toHaveLength(fuera.length);
            expect(cuadro.popups.map((x) => x.texto)).toEqual(
              fuera.map((e) => (e.tipo === 'GranoFuera' ? `+${formatearPuntos(e.puntos)}` : '')),
            );
            suma += p.granosFuera.reduce((a, g) => a + g.puntos, 0);
          }
          const todos = t.eventos.reduce((a, e) => a + (e.tipo === 'GranoFuera' ? e.puntos : 0), 0);
          expect(suma).toBe(todos);
          expect(todos).toBe(puntosResueltos(t.eventos));
        }
      }),
      { numRuns: 40 },
    );
  });

  it('con multiplicador 50, los textos de las oleadas 1, 2 y 3 son «+1», «+1,5» y «+2»', () => {
    expect([1, 2, 3].map((k) => `+${formatearPuntos(valorGranoFuera(k, 50))}`)).toEqual(['+1', '+1,5', '+2']);
  });

  it('la escala es 1 + 0,15 × (k − 1), con tope 2', () => {
    expect([1, 2, 3, 4, 7, 8, 20].map((k) => escalaPopup(k))).toEqual([1, 1.15, 1.3, 1.45, 1.9, 2, 2].map((v) => expect.closeTo(v, 10)));
    const c = cascadaCruz();
    const derrumbe = c.pasos[1];
    expect(derrumbe?.tipo).toBe('derrumbe');
    for (const p of muestrear(c, (inicios(c)[1] ?? 0) + 1).popups) expect(p.escala).toBe(1);
  });

  it('el progreso va de 0 a 1 y la opacidad solo baja en el último 40 %', () => {
    const c = cascadaCruz();
    const paso = c.pasos[1];
    const inicio = inicios(c)[1] ?? 0;
    if (paso === undefined) throw new Error('sin paso');
    let anterior = 1;
    for (const u of [0, 0.1, 0.3, 0.5, 0.6, 0.65, 0.8, 0.95, 0.999]) {
      const [p] = muestrear(c, inicio + u * paso.duracion).popups;
      expect(p?.progreso).toBeCloseTo(u, 9);
      if (u <= 0.6) expect(p?.opacidad).toBe(1);
      else {
        expect(p?.opacidad).toBeLessThan(1);
        expect(p?.opacidad).toBeGreaterThan(0);
        expect(p?.opacidad).toBeLessThanOrEqual(anterior);
      }
      anterior = p?.opacidad ?? 0;
    }
  });

  it('cada punto aparece junto al borde por el que sale su grano, y sube con el tiempo', () => {
    const c = cascadaCruz();
    const inicio = inicios(c)[1] ?? 0;
    const duracion = c.pasos[1]?.duracion ?? 0;
    const { separacion, ascenso } = TEMA.animacion.popups;
    const d = 0.5 + separacion;
    // Orden de los GranoFuera: arriba desde (1, 0), izquierda desde (0, 1), derecha desde (2, 1), abajo desde (1, 2).
    const esperadas = [
      { x: 1, y: -d },
      { x: -d, y: 1 },
      { x: 2 + d, y: 1 },
      { x: 1, y: 2 + d },
    ];
    const alPrincipio = muestrear(c, inicio).popups;
    for (const [i, e] of esperadas.entries()) {
      expect(alPrincipio[i]?.x).toBeCloseTo(e.x, 9);
      expect(alPrincipio[i]?.y).toBeCloseTo(e.y, 9);
    }
    // Un intercambio de ejes pondría el de la derecha abajo y el de abajo a la derecha.
    expect(alPrincipio[2]?.x).toBeGreaterThan(2.5);
    expect(alPrincipio[3]?.y).toBeGreaterThan(2.5);
    expect(alPrincipio[3]?.x).toBeCloseTo(1, 9);
    const aMitad = muestrear(c, inicio + duracion / 2).popups;
    for (const [i, e] of esperadas.entries()) {
      expect(aMitad[i]?.x).toBeCloseTo(e.x, 9);
      expect(aMitad[i]?.y).toBeCloseTo(e.y - ascenso / 2, 9);
    }
  });
});

describe('etiqueta de cadena y puntos de la tirada', () => {
  it('en la cruz: «×1» en la oleada 1, «×1,5» en la 2, y null en la adición y al final', () => {
    const c = cascadaCruz();
    const etiquetas = c.pasos.map((p, i) => muestrear(c, (inicios(c)[i] ?? 0) + 0.5 * p.duracion).etiqueta);
    expect(etiquetas).toEqual([
      { oleada: 1, multiplicador: '×1' },
      { oleada: 1, multiplicador: '×1' },
      { oleada: 2, multiplicador: '×1,5' },
      { oleada: 2, multiplicador: '×1,5' },
    ]);
    expect(muestrear(c, c.duracionTotal).etiqueta).toBeNull();
  });

  it('con multiplicador 50, la oleada 3 de una partida real lleva «×2»', () => {
    for (const semilla of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      for (const t of jugar(5, semilla, semilla, 10)) {
        const c = cascadaDe(t);
        const i = c.pasos.findIndex((p) => p.tipo === 'alerta' && p.k === 3);
        if (i === -1) continue;
        expect(muestrear(c, (inicios(c)[i] ?? 0) + 1).etiqueta).toEqual({ oleada: 3, multiplicador: '×2' });
        return;
      }
    }
    throw new Error('ninguna partida llegó a la oleada 3');
  });

  it('en la cruz, los puntos de la tirada suben al terminar la oleada 1, no antes', () => {
    const c = cascadaCruz();
    const [, , alerta2] = inicios(c);
    const derrumbe1 = c.pasos[1];
    if (alerta2 === undefined || derrumbe1 === undefined) throw new Error('sin pasos');
    expect(muestrear(c, 0).puntosTirada).toBe(0);
    expect(muestrear(c, alerta2 - 0.001).puntosTirada).toBe(0);
    expect(muestrear(c, alerta2).puntosTirada).toBe(400);
    expect(muestrear(c, c.duracionTotal).puntosTirada).toBe(400);
  });

  it('propiedad: la etiqueta es la de la oleada, los puntos son constantes en ella y al final son los de la tirada', () => {
    fc.assert(
      fc.property(arbPartida, ({ lado, semilla, semillaBot, multiplicador }) => {
        for (const t of jugar(lado, semilla, semillaBot, 6, { multiplicadorPorOleada: multiplicador })) {
          const c = cascadaDe(t);
          const ini = inicios(c);
          let acumulado = 0;
          for (const [i, p] of c.pasos.entries()) {
            const muestras = [0, 0.25, 0.5, 0.75, 0.999].map((f) => muestrear(c, (ini[i] ?? 0) + f * p.duracion));
            for (const m of muestras) {
              expect(m.puntosTirada).toBe(acumulado);
              if (p.tipo === 'adicion') expect(m.etiqueta).toBeNull();
              else {
                const k = (p as Exclude<Paso, { tipo: 'adicion' }>).k;
                expect(m.etiqueta).toEqual({ oleada: k, multiplicador: `×${formatearPuntos(100 + multiplicador * (k - 1))}` });
              }
            }
            if (p.tipo === 'derrumbe') acumulado += (p as PasoDerrumbe).puntosGanados;
          }
          const fin = muestrear(c, c.duracionTotal);
          expect(fin.puntosTirada).toBe(puntosResueltos(t.eventos));
          expect(fin.puntosTirada).toBe(acumulado);
        }
      }),
      { numRuns: 40 },
    );
  });
});
