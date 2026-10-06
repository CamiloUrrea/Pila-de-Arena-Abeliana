import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CONFIG_INICIAL, aplicar, crearRonda } from '@pila/core';
import type { Config, Estado, TipoGrano } from '@pila/core';
import { calcularPrevistas, calcularPrevistasConCandidata } from '../src/previsualizacion.ts';
import { describirCeldas } from '../src/vista.ts';

/** Ronda válida cuya mano es el mazo entero, con la composición dada (el orden lo baraja la semilla). */
function ronda(lado: number, mazo: Config['mazo'], semilla: number): Estado {
  const tamanoMano = mazo.normal + mazo.pesado + mazo.explosivo;
  const r = crearRonda({ ...CONFIG_INICIAL, lado, mazo, tamanoMano, topeOleadas: 1_000_000 }, semilla);
  if (!r.ok) throw new Error(`configuración inválida: ${r.error.campo}: ${r.error.motivo}`);
  return r.valor.estado;
}

function colocarReal(estado: Estado, indiceMano: number, x: number, y: number): Estado {
  const paso = aplicar(estado, { tipo: 'Colocar', indiceMano, x, y });
  if (!paso.ok) throw new Error(`colocación rechazada: ${JSON.stringify(paso.error)}`);
  return paso.valor.estado;
}

const restar = (a: Estado['celdas'], b: Estado['celdas']) => a.map((fila, y) => fila.map((v, x) => v - (b[y]?.[x] ?? 0)));

describe('calcularPrevistasConCandidata', () => {
  it.each<TipoGrano>(['normal', 'pesado', 'explosivo'])(
    'propiedad: con un %s candidato en cualquier celda, coincide con colocarlo de verdad y calcular las previstas',
    (tipo) => {
      const arb = fc
        .record({
          lado: fc.integer({ min: 1, max: 6 }),
          semilla: fc.nat({ max: 0xffffffff }),
          // Granos ya colocados de verdad antes de la candidata.
          otros: fc.integer({ min: 0, max: 4 }),
        })
        .chain((c) => {
          const celda = fc.tuple(fc.nat({ max: c.lado - 1 }), fc.nat({ max: c.lado - 1 }));
          return fc.record({
            c: fc.constant(c),
            previas: fc.array(celda, { minLength: c.otros, maxLength: c.otros }),
            candidata: celda,
          });
        });
      fc.assert(
        fc.property(arb, ({ c, previas, candidata }) => {
          // Mano: `otros` granos mezclados y, al final, uno del tipo probado (el mazo se baraja, así que se busca).
          const mazo = { normal: 1, pesado: 1, explosivo: 1 };
          mazo[tipo] += c.otros;
          let estado = ronda(c.lado, mazo, c.semilla);
          const indice = estado.mano.findIndex((g) => g.tipo === tipo);
          const libres = estado.mano.map((_, i) => i).filter((i) => i !== indice);
          for (const [k, [x, y]] of previas.entries()) estado = colocarReal(estado, libres[k] ?? -1, x, y);

          const copia = structuredClone(estado);
          const [x, y] = candidata;
          const conCandidata = calcularPrevistasConCandidata(estado, indice, { x, y });
          expect(estado).toEqual(copia);

          const real = calcularPrevistas(colocarReal(estado, indice, x, y));
          expect(conCandidata.proyectada).toEqual(real.proyectada);
          expect(conCandidata.previstas).toEqual(real.previstas);
          // Las de la candidata son exactamente la diferencia con la previsión sin ella.
          expect(conCandidata.candidata).toEqual(restar(real.previstas, calcularPrevistas(estado).previstas));
        }),
      );
    },
  );

  it.each<[string, number | null, { x: number; y: number } | null]>([
    ['sin grano seleccionado', null, { x: 1, y: 1 }],
    ['sin celda', 0, null],
    ['con x negativa', 0, { x: -1, y: 0 }],
    ['con y fuera', 0, { x: 0, y: 3 }],
    ['con una celda decimal', 0, { x: 0.5, y: 0 }],
    ['con un índice que no existe', 9, { x: 1, y: 1 }],
  ])('%s equivale a calcularPrevistas y no hay candidata', (_, indice, celda) => {
    const estado = colocarReal(ronda(3, { normal: 2, pesado: 1, explosivo: 2 }, 4), 1, 2, 2);
    const resultado = calcularPrevistasConCandidata(estado, indice, celda);
    expect({ proyectada: resultado.proyectada, previstas: resultado.previstas }).toEqual(calcularPrevistas(estado));
    expect(resultado.candidata.flat().every((v) => v === 0)).toBe(true);
  });

  it('un grano ya colocado no puede ser candidato', () => {
    const estado = colocarReal(ronda(3, { normal: 2, pesado: 1, explosivo: 2 }, 4), 1, 2, 2);
    expect(calcularPrevistasConCandidata(estado, 1, { x: 0, y: 0 }).candidata.flat().every((v) => v === 0)).toBe(true);
  });
});

describe('describirCeldas con candidata', () => {
  it('los fantasmas de la candidata llevan candidata: true y van al final; los demás no', () => {
    // Celda 0: carga 1, 1 previsto ya colocado y 2 de la candidata. Celda 1: sin candidata.
    const [a, b] = describirCeldas([[1, 2]], 99, [[3, 1]], [[2, 0]]);
    expect(a?.candidatos).toBe(2);
    expect(a?.granos.map((p) => [p.fantasma, p.candidata])).toEqual([
      [false, false],
      [true, false],
      [true, true],
      [true, true],
    ]);
    expect(b?.granos.every((p) => !p.candidata)).toBe(true);
  });

  it('nunca hay más candidatos que previstos', () => {
    const [c] = describirCeldas([[1]], 99, [[1]], [[5]]);
    expect(c?.candidatos).toBe(1);
    expect(c?.granos.filter((p) => p.candidata)).toHaveLength(1);
    expect(c?.granos.filter((p) => !p.fantasma)).toHaveLength(1);
  });

  it('distingue la inestable prevista solo por la candidata de la que ya lo era sin ella', () => {
    // Umbral 4. Celda 0: 2 + 1 colocado + 1 candidato → solo por la candidata. Celda 1: 2 + 2 colocados + 1 candidato
    // → ya lo era. Celda 2: 1 + 1 candidato → no llega. Celda 3: inestable de verdad.
    const d = describirCeldas([[2, 2, 1, 4]], 4, [[2, 3, 1, 1]], [[1, 1, 1, 1]]);
    expect(d.map((c) => c.inestablePrevista)).toEqual([true, true, false, false]);
    expect(d.map((c) => c.inestablePorCandidata)).toEqual([true, false, false, false]);
  });

  it('sin candidatas, ningún punto es de la candidata y nada es inestable por ella', () => {
    fc.assert(
      fc.property(
        fc.array(fc.array(fc.integer({ min: 0, max: 12 }), { minLength: 3, maxLength: 3 }), { minLength: 3, maxLength: 3 }),
        fc.array(fc.array(fc.integer({ min: 0, max: 6 }), { minLength: 3, maxLength: 3 }), { minLength: 3, maxLength: 3 }),
        (celdas, previstas) => {
          const d = describirCeldas(celdas, 4, previstas);
          expect(d).toEqual(describirCeldas(celdas, 4, previstas, previstas.map((f) => f.map(() => 0))));
          for (const c of d) {
            expect(c.candidatos).toBe(0);
            expect(c.inestablePorCandidata).toBe(false);
            expect(c.granos.some((p) => p.candidata)).toBe(false);
          }
        },
      ),
    );
  });
});
