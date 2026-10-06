import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Estado, Evento } from '@pila/core';
import { construirCascada, muestrear } from '../src/cascada.ts';
import type { Cascada, PasoDerrumbe } from '../src/cascada.ts';
import { TEMA } from '../src/tema.ts';
import { jugar } from './bot.ts';
import type { Tirada } from './bot.ts';

type Celdas = Estado['celdas'];
const UMBRAL = 4;

/**
 * Oráculo independiente, escrito aparte de `cascada.ts`: simula las oleadas simultáneas sobre una rejilla y devuelve
 * la rejilla tras cada oleada.
 */
function oleadasOraculo(inicial: Celdas, umbral: number): number[][][] {
  const lado = inicial.length;
  const resultado: number[][][] = [];
  let rejilla = inicial.map((f) => [...f]);
  for (;;) {
    const caen: [number, number][] = [];
    rejilla.forEach((fila, y) => fila.forEach((v, x) => v >= umbral && caen.push([x, y])));
    if (caen.length === 0) return resultado;
    const nueva = rejilla.map((f) => [...f]);
    for (const [x, y] of caen) {
      nueva[y]![x]! -= 4;
      for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]] as const) {
        if (nx >= 0 && nx < lado && ny >= 0 && ny < lado) nueva[ny]![nx]! += 1;
      }
    }
    resultado.push(nueva);
    rejilla = nueva;
  }
}

const suma = (c: Celdas): number => c.flat().reduce((a, b) => a + b, 0);

function cascadaDe(t: Tirada): Cascada {
  const { lado, umbral } = t.antes.config;
  const r = construirCascada(t.antes.celdas, t.eventos, lado, umbral);
  if (!r.ok) throw new Error(`cascada inválida: ${r.error.motivo}`);
  return r.valor;
}

/** Partidas del bot: rejillas de lado 3 a 5, semillas y elecciones aleatorias. */
const arbPartida = fc.record({
  lado: fc.integer({ min: 3, max: 5 }),
  semilla: fc.nat({ max: 0xffffffff }),
  semillaBot: fc.nat({ max: 0xffffffff }),
});

describe('construirCascada contra el núcleo', () => {
  it('propiedad: cada Confirmar del bot se reconstruye con las mismas celdas finales, oleadas, movimientos y GranoFuera', () => {
    fc.assert(
      fc.property(arbPartida, ({ lado, semilla, semillaBot }) => {
        for (const t of jugar(lado, semilla, semillaBot, 8)) {
          const cascada = cascadaDe(t);
          expect(cascada.celdasFinales).toEqual(t.despues.celdas);
          expect(cascada.celdasAntes).toBe(t.antes.celdas);

          const resuelta = t.eventos.find((e) => e.tipo === 'TiradaResuelta');
          const oleadas = resuelta?.tipo === 'TiradaResuelta' ? resuelta.oleadas : -1;
          expect(cascada.pasos.filter((p) => p.tipo === 'alerta')).toHaveLength(oleadas);
          const derrumbes = cascada.pasos.filter((p): p is PasoDerrumbe => p.tipo === 'derrumbe');
          expect(derrumbes).toHaveLength(oleadas);

          for (const p of derrumbes) {
            const deLaOleada = t.eventos.filter((e) => 'k' in e && e.k === p.k);
            expect(p.movimientos).toHaveLength(4 * deLaOleada.filter((e) => e.tipo === 'Derrumbe').length);
            const fuera = p.movimientos.filter((m) => m.fuera).map((m) => ({ x: m.desde.x, y: m.desde.y, direccion: m.direccion }));
            const eventosFuera = deLaOleada.flatMap((e) => (e.tipo === 'GranoFuera' ? [{ x: e.x, y: e.y, direccion: e.direccion }] : []));
            expect(fuera).toEqual(eventosFuera);
          }
        }
      }),
      { numRuns: 60 },
    );
  });

  it('propiedad: las rejillas intermedias coinciden con un oráculo de oleadas independiente', () => {
    fc.assert(
      fc.property(arbPartida, ({ lado, semilla, semillaBot }) => {
        for (const t of jugar(lado, semilla, semillaBot, 8)) {
          const cascada = cascadaDe(t);
          const [primero] = cascada.pasos;
          const trasAdicion = primero?.tipo === 'adicion' ? primero.despues : t.antes.celdas;
          const esperadas = oleadasOraculo(trasAdicion, UMBRAL);
          const derrumbes = cascada.pasos.filter((p): p is PasoDerrumbe => p.tipo === 'derrumbe');
          expect(derrumbes.map((p) => p.despues)).toEqual(esperadas);
          // Cada derrumbe parte de la rejilla anterior, y cada alerta la muestra sin cambios.
          let anterior = trasAdicion;
          for (const p of cascada.pasos.slice(primero?.tipo === 'adicion' ? 1 : 0)) {
            if (p.tipo === 'alerta') expect(p.rejilla).toEqual(anterior);
            if (p.tipo === 'derrumbe') {
              expect(p.antes).toEqual(anterior);
              anterior = p.despues;
            }
          }
        }
      }),
      { numRuns: 60 },
    );
  });

  it('las duraciones de los pasos salen del tema y suman la duración total', () => {
    const [t] = jugar(3, 2026, 7, 1);
    if (t === undefined) throw new Error('sin tiradas');
    const cascada = cascadaDe(t);
    const { duraciones } = TEMA.animacion;
    for (const p of cascada.pasos) expect(p.duracion).toBe(duraciones[p.tipo]);
    expect(cascada.duracionTotal).toBe(cascada.pasos.reduce((a, p) => a + p.duracion, 0));
  });
});

describe('construirCascada con eventos escritos a mano', () => {
  // Rejilla de lado 3 con 4 granos en el centro: una oleada, sin granos fuera.
  const centro: Celdas = [
    [0, 0, 0],
    [0, 4, 0],
    [0, 0, 0],
  ];
  const eventosCentro: Evento[] = [
    { tipo: 'TiradaConfirmada', numero: 1 },
    { tipo: 'OleadaIniciada', k: 1, celdas: [{ x: 1, y: 1 }] },
    { tipo: 'Derrumbe', k: 1, x: 1, y: 1 },
    { tipo: 'OleadaTerminada', k: 1, derrumbes: 1, granosFuera: 0, puntosGanados: 0 },
  ];
  // Rejilla de lado 2 con 4 granos en la esquina: dos granos salen (arriba e izquierda).
  const esquina: Celdas = [
    [4, 0],
    [0, 0],
  ];
  const eventosEsquina: Evento[] = [
    { tipo: 'OleadaIniciada', k: 1, celdas: [{ x: 0, y: 0 }] },
    { tipo: 'Derrumbe', k: 1, x: 0, y: 0 },
    { tipo: 'GranoFuera', k: 1, x: 0, y: 0, direccion: 'arriba', puntos: 100 },
    { tipo: 'GranoFuera', k: 1, x: 0, y: 0, direccion: 'izquierda', puntos: 100 },
    { tipo: 'OleadaTerminada', k: 1, derrumbes: 1, granosFuera: 2, puntosGanados: 200 },
  ];

  it('un derrumbe en el centro reparte un grano a cada vecina', () => {
    const r = construirCascada(centro, eventosCentro, 3, UMBRAL);
    expect(r.ok && r.valor.celdasFinales).toEqual([
      [0, 1, 0],
      [1, 0, 1],
      [0, 1, 0],
    ]);
    expect(r.ok && r.valor.pasos.map((p) => p.tipo)).toEqual(['alerta', 'derrumbe']);
  });

  it('un derrumbe en una esquina saca dos granos, arriba (y − 1) e izquierda (x − 1)', () => {
    const r = construirCascada(esquina, eventosEsquina, 2, UMBRAL);
    if (!r.ok) throw new Error(r.error.motivo);
    expect(r.valor.celdasFinales).toEqual([
      [0, 1],
      [1, 0],
    ]);
    const derrumbe = r.valor.pasos[1];
    expect(derrumbe?.tipo === 'derrumbe' && derrumbe.movimientos).toEqual([
      { desde: { x: 0, y: 0 }, hacia: { x: 0, y: -1 }, fuera: true, direccion: 'arriba' },
      { desde: { x: 0, y: 0 }, hacia: { x: 1, y: 0 }, fuera: false, direccion: 'derecha' },
      { desde: { x: 0, y: 0 }, hacia: { x: 0, y: 1 }, fuera: false, direccion: 'abajo' },
      { desde: { x: 0, y: 0 }, hacia: { x: -1, y: 0 }, fuera: true, direccion: 'izquierda' },
    ]);
  });

  it('una adición sin oleadas da un único paso de adición', () => {
    const r = construirCascada(centro.map((f) => f.map(() => 0)), [{ tipo: 'AdicionAplicada', x: 2, y: 0, cantidad: 3 }], 3, UMBRAL);
    if (!r.ok) throw new Error(r.error.motivo);
    expect(r.valor.pasos.map((p) => p.tipo)).toEqual(['adicion']);
    expect(r.valor.celdasFinales[0]).toEqual([0, 0, 3]);
  });

  it('sin eventos de cascada no hay pasos y la duración es 0', () => {
    const vacia = centro.map((f) => f.map(() => 1));
    const r = construirCascada(vacia, [{ tipo: 'TiradaConfirmada', numero: 1 }], 3, UMBRAL);
    expect(r.ok && r.valor.duracionTotal).toBe(0);
    expect(r.ok && muestrear(r.valor, 50).terminado).toBe(true);
  });

  const casos: [string, Celdas, Evento[], number][] = [
    [
      'un Derrumbe de una celda que no está en su OleadaIniciada',
      centro,
      eventosCentro.map((e) => (e.tipo === 'Derrumbe' ? { ...e, x: 0 } : e)),
      3,
    ],
    [
      'una dirección desconocida',
      esquina,
      eventosEsquina.map((e) => (e.tipo === 'GranoFuera' && e.direccion === 'arriba' ? ({ ...e, direccion: 'diagonal' } as unknown as Evento) : e)),
      2,
    ],
    ['un GranoFuera que falta', esquina, eventosEsquina.filter((e) => !(e.tipo === 'GranoFuera' && e.direccion === 'izquierda')), 2],
    ['un GranoFuera hacia una vecina interior', esquina, eventosEsquina.map((e) => (e.tipo === 'GranoFuera' && e.direccion === 'arriba' ? { ...e, direccion: 'abajo' as const } : e)), 2],
    ['una OleadaIniciada que no anuncia una celda inestable', centro, eventosCentro.map((e) => (e.tipo === 'OleadaIniciada' ? { ...e, celdas: [] } : e)), 3],
    ['una OleadaIniciada con una celda estable', centro, eventosCentro.map((e) => (e.tipo === 'OleadaIniciada' ? { ...e, celdas: [{ x: 1, y: 1 }, { x: 0, y: 0 }] } : e)), 3],
    ['una oleada con k equivocado', centro, eventosCentro.map((e) => ('k' in e ? { ...e, k: 2 } : e)), 3],
    ['una oleada sin terminar', centro, eventosCentro.filter((e) => e.tipo !== 'OleadaTerminada'), 3],
    ['un Derrumbe sin OleadaIniciada', centro, eventosCentro.filter((e) => e.tipo !== 'OleadaIniciada'), 3],
    ['un Derrumbe repetido', centro, [...eventosCentro.slice(0, 3), { tipo: 'Derrumbe', k: 1, x: 1, y: 1 }, ...eventosCentro.slice(3)], 3],
    ['totales de OleadaTerminada que no cuadran', esquina, eventosEsquina.map((e) => (e.tipo === 'OleadaTerminada' ? { ...e, granosFuera: 1 } : e)), 2],
    ['una AdicionAplicada después de las oleadas', centro, [...eventosCentro, { tipo: 'AdicionAplicada', x: 0, y: 0, cantidad: 1 }], 3],
    ['una AdicionAplicada fuera de la rejilla', centro, [{ tipo: 'AdicionAplicada', x: 3, y: 0, cantidad: 1 }, ...eventosCentro], 3],
    ['una cascada que termina con celdas inestables', centro, [{ tipo: 'TiradaConfirmada', numero: 1 }], 3],
    ['un lado que no coincide con la rejilla', centro, eventosCentro, 4],
  ];

  it.each(casos)('%s da CascadaInvalida sin lanzar', (_, celdas, eventos, lado) => {
    const r = construirCascada(celdas, eventos, lado, UMBRAL);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.tipo).toBe('CascadaInvalida');
      expect(r.error.motivo.length).toBeGreaterThan(0);
    }
  });

  it('propiedad: con eventos reales desordenados o recortados nunca lanza ni muta', () => {
    const [t] = jugar(4, 99, 5, 1);
    if (t === undefined) throw new Error('sin tiradas');
    fc.assert(
      fc.property(fc.shuffledSubarray([...t.eventos]), (eventos) => {
        const copia = structuredClone(eventos);
        const celdas = structuredClone(t.antes.celdas);
        const r = construirCascada(celdas, eventos, 4, UMBRAL);
        expect(r.ok || r.error.tipo === 'CascadaInvalida').toBe(true);
        expect(eventos).toEqual(copia);
        expect(celdas).toEqual(t.antes.celdas);
      }),
    );
  });
});

describe('muestrear', () => {
  // Se construyen dentro de cada prueba (y una sola vez), para que un fallo de la reconstrucción sea una prueba en
  // rojo y no un error al cargar el archivo.
  let memo: Cascada[] | undefined;
  const cascadas = (): Cascada[] =>
    (memo ??= [jugar(3, 2026, 1), jugar(4, 77, 2), jugar(5, 123456, 3)]
      .flat()
      .map(cascadaDe)
      .filter((c) => c.pasos.some((p) => p.tipo === 'derrumbe')));

  it('hay cascadas con derrumbes para probar', () => {
    expect(cascadas().length).toBeGreaterThan(3);
  });

  it('en 0 es la rejilla anterior y en la duración total exactamente la final', () => {
    for (const c of cascadas()) {
      const inicio = muestrear(c, 0);
      expect(inicio.celdas).toEqual(c.celdasAntes);
      expect(inicio.terminado).toBe(false);
      const fin = muestrear(c, c.duracionTotal);
      expect(fin).toEqual({ tMs: c.duracionTotal, celdas: c.celdasFinales, granosEnVuelo: [], alertas: [], adiciones: [], terminado: true });
    }
  });

  it.each([1, 1000, 1e9, Number.POSITIVE_INFINITY])('un instante %d ms más allá del final se acota a la duración total', (extra) => {
    for (const c of cascadas()) {
      const fuera = muestrear(c, c.duracionTotal + extra);
      expect(fuera.tMs).toBe(c.duracionTotal);
      expect(fuera).toEqual(muestrear(c, c.duracionTotal));
    }
  });

  it.each([-1, -1e9, Number.NEGATIVE_INFINITY, Number.NaN])('un instante %d se acota a 0', (t) => {
    for (const c of cascadas()) {
      const cuadro = muestrear(c, t);
      expect(cuadro.tMs).toBe(0);
      expect(cuadro).toEqual(muestrear(c, 0));
    }
  });

  it('propiedad: ninguna carga es negativa en ningún instante', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: cascadas().length - 1 }), fc.double({ min: 0, max: 1, noNaN: true }), (i, f) => {
        const c = cascadas()[i];
        if (c === undefined) return;
        const cuadro = muestrear(c, f * c.duracionTotal);
        expect(cuadro.celdas.flat().every((v) => v >= 0)).toBe(true);
      }),
    );
  });

  it('en un derrumbe, en instantes interiores, las cargas más los granos en vuelo suman lo de antes del paso', () => {
    for (const c of cascadas()) {
      let inicio = 0;
      for (const p of c.pasos) {
        if (p.tipo === 'derrumbe') {
          for (const f of [0.001, 0.1, 0.37, 0.5, 0.61, 0.9, 0.999]) {
            const cuadro = muestrear(c, inicio + f * p.duracion);
            expect(suma(cuadro.celdas) + cuadro.granosEnVuelo.length).toBe(suma(p.antes));
            expect(cuadro.granosEnVuelo).toHaveLength(p.movimientos.length);
            for (const g of cuadro.granosEnVuelo) {
              expect(g.opacidad).toBeGreaterThan(0);
              expect(g.opacidad).toBeLessThanOrEqual(1);
            }
          }
        }
        inicio += p.duracion;
      }
    }
  });

  it('los granos viajan del origen al centro de la vecina, y los de fuera se desvanecen al final', () => {
    const c = cascadas()[0];
    if (c === undefined) throw new Error('sin cascada');
    let inicio = 0;
    for (const p of c.pasos) {
      if (p.tipo === 'derrumbe') {
        const casiAlPrincipio = muestrear(c, inicio + 0.0001 * p.duracion);
        const casiAlFinal = muestrear(c, inicio + 0.9999 * p.duracion);
        for (const [j, m] of p.movimientos.entries()) {
          const a = casiAlPrincipio.granosEnVuelo[j];
          const b = casiAlFinal.granosEnVuelo[j];
          expect(a?.x).toBeCloseTo(m.desde.x, 2);
          expect(a?.y).toBeCloseTo(m.desde.y, 2);
          if (!m.fuera) {
            expect(b?.x).toBeCloseTo(m.hacia.x, 2);
            expect(b?.y).toBeCloseTo(m.hacia.y, 2);
          } else {
            expect(b?.opacidad).toBeLessThan(0.01);
            // Más allá del borde del tablero.
            const lado = c.celdasAntes.length;
            const sale = (b?.x ?? 0) < -0.5 || (b?.x ?? 0) > lado - 0.5 || (b?.y ?? 0) < -0.5 || (b?.y ?? 0) > lado - 0.5;
            expect(sale).toBe(true);
          }
        }
      }
      inicio += p.duracion;
    }
  });

  it('en la alerta la carga no cambia y la intensidad está entre 0 y 1; en la adición hay apariciones', () => {
    for (const c of cascadas()) {
      let inicio = 0;
      for (const p of c.pasos) {
        const cuadro = muestrear(c, inicio + 0.5 * p.duracion);
        if (p.tipo === 'alerta') {
          expect(cuadro.celdas).toEqual(p.rejilla);
          expect(cuadro.alertas.map((a) => ({ x: a.x, y: a.y }))).toEqual(p.celdas);
          for (const a of cuadro.alertas) {
            expect(a.intensidad).toBeGreaterThanOrEqual(0);
            expect(a.intensidad).toBeLessThanOrEqual(1);
          }
        }
        if (p.tipo === 'adicion') expect(cuadro.adiciones.map((a) => ({ x: a.x, y: a.y }))).toEqual(p.celdas);
        inicio += p.duracion;
      }
    }
  });

  it('es determinista y no muta la cascada', () => {
    for (const c of cascadas()) {
      const copia = structuredClone(c);
      for (const t of [0, 13, 250, 777, c.duracionTotal / 2, c.duracionTotal]) expect(muestrear(c, t)).toEqual(muestrear(c, t));
      expect(c).toEqual(copia);
    }
  });
});
