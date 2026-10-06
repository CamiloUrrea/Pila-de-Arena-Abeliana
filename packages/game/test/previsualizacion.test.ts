import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CONFIG_INICIAL, aplicar, crearRonda } from '@pila/core';
import type { Config, Estado } from '@pila/core';
import { calcularPrevistas } from '../src/previsualizacion.ts';

/** Ronda válida cuya mano es el mazo entero, con la composición dada (el orden lo baraja la semilla). */
function ronda(lado: number, mazo: Config['mazo'], semilla: number): Estado {
  const tamanoMano = mazo.normal + mazo.pesado + mazo.explosivo;
  const r = crearRonda({ ...CONFIG_INICIAL, lado, mazo, tamanoMano, topeOleadas: 1_000_000 }, semilla);
  if (!r.ok) throw new Error(`configuración inválida: ${r.error.campo}: ${r.error.motivo}`);
  return r.valor.estado;
}

/** Coloca el grano `i` de la mano en `celdas[i]` con `aplicar`. */
function colocarTodos(estado: Estado, celdas: readonly (readonly [number, number])[]): Estado {
  return celdas.reduce((e, [x, y], indiceMano) => {
    const paso = aplicar(e, { tipo: 'Colocar', indiceMano, x, y });
    if (!paso.ok) throw new Error(`colocación rechazada: ${JSON.stringify(paso.error)}`);
    return paso.valor.estado;
  }, estado);
}

/** Granos que recibe cada celda según los `AdicionAplicada` de un `Confirmar` real. */
function adicionesDeConfirmar(estado: Estado): number[][] {
  const paso = aplicar(estado, { tipo: 'Confirmar' });
  if (!paso.ok) throw new Error(`confirmación rechazada: ${JSON.stringify(paso.error)}`);
  const { lado } = estado.config;
  const recibido = Array.from({ length: lado }, () => Array.from({ length: lado }, () => 0));
  for (const e of paso.valor.eventos) {
    if (e.tipo !== 'AdicionAplicada') continue;
    const fila = recibido[e.y];
    if (fila?.[e.x] === undefined) throw new Error(`adición fuera de la rejilla: (${e.x}, ${e.y})`);
    fila[e.x] = (fila[e.x] ?? 0) + e.cantidad;
  }
  return recibido;
}

/** Comprueba que la vista previa coincide celda a celda con un `Confirmar` real sobre el mismo estado. */
function comprobarEquivalencia(estado: Estado): void {
  const { proyectada, previstas } = calcularPrevistas(estado);
  const esperado = adicionesDeConfirmar(estado);
  expect(previstas).toEqual(esperado);
  expect(proyectada).toEqual(estado.celdas.map((fila, y) => fila.map((v, x) => v + (esperado[y]?.[x] ?? 0))));
}

describe('calcularPrevistas', () => {
  it('explosivos en las cuatro esquinas: los vecinos fuera de la rejilla se ignoran', () => {
    const e = colocarTodos(ronda(3, { normal: 0, pesado: 0, explosivo: 4 }, 7), [[0, 0], [2, 0], [0, 2], [2, 2]]);
    expect(calcularPrevistas(e).previstas).toEqual([
      [1, 2, 1],
      [2, 0, 2],
      [1, 2, 1],
    ]);
    comprobarEquivalencia(e);
  });

  it('un explosivo en un borde', () => {
    const e = colocarTodos(ronda(4, { normal: 0, pesado: 0, explosivo: 1 }, 3), [[0, 2]]);
    expect(calcularPrevistas(e).previstas).toEqual([
      [0, 0, 0, 0],
      [1, 0, 0, 0],
      [1, 1, 0, 0],
      [1, 0, 0, 0],
    ]);
    comprobarEquivalencia(e);
  });

  it('normal, pesado y explosivo en la misma celda se suman', () => {
    const e = colocarTodos(ronda(3, { normal: 1, pesado: 1, explosivo: 1 }, 11), [[1, 1], [1, 1], [1, 1]]);
    expect(calcularPrevistas(e).previstas).toEqual([
      [0, 1, 0],
      [1, 4, 1],
      [0, 1, 0],
    ]);
    comprobarEquivalencia(e);
  });

  it('un explosivo en una rejilla de lado 1 solo suma en su celda', () => {
    const e = colocarTodos(ronda(1, { normal: 0, pesado: 0, explosivo: 1 }, 5), [[0, 0]]);
    expect(calcularPrevistas(e).previstas).toEqual([[1]]);
    comprobarEquivalencia(e);
  });

  it('propiedad: con manos mezcladas y celdas cualesquiera (también repetidas), coincide con Confirmar', () => {
    const arb = fc
      .record({
        lado: fc.integer({ min: 1, max: 6 }),
        semilla: fc.nat({ max: 0xffffffff }),
        normal: fc.integer({ min: 0, max: 4 }),
        pesado: fc.integer({ min: 0, max: 4 }),
        explosivo: fc.integer({ min: 0, max: 4 }),
      })
      .filter(({ normal, pesado, explosivo }) => normal + pesado + explosivo > 0)
      .chain((c) => {
        const n = c.normal + c.pesado + c.explosivo;
        const celda = fc.tuple(fc.nat({ max: c.lado - 1 }), fc.nat({ max: c.lado - 1 }));
        return fc.record({ c: fc.constant(c), celdas: fc.array(celda, { minLength: n, maxLength: n }) });
      });
    fc.assert(
      fc.property(arb, ({ c, celdas }) => {
        const inicial = ronda(c.lado, { normal: c.normal, pesado: c.pesado, explosivo: c.explosivo }, c.semilla);
        comprobarEquivalencia(colocarTodos(inicial, celdas));
      }),
    );
  });

  it('sin colocaciones no hay nada previsto y la proyección es la rejilla actual', () => {
    const e = ronda(4, CONFIG_INICIAL.mazo, 2026);
    const { proyectada, previstas } = calcularPrevistas(e);
    expect(previstas.flat().every((v) => v === 0)).toBe(true);
    expect(proyectada).toEqual(e.celdas);
  });

  it('solo cuentan los granos colocados: con la mano a medias, los demás no suman', () => {
    const inicial = ronda(3, { normal: 0, pesado: 2, explosivo: 0 }, 9);
    const paso = aplicar(inicial, { tipo: 'Colocar', indiceMano: 1, x: 2, y: 1 });
    if (!paso.ok) throw new Error('colocación rechazada');
    expect(calcularPrevistas(paso.valor.estado).previstas).toEqual([
      [0, 0, 0],
      [0, 0, 2],
      [0, 0, 0],
    ]);
  });

  it('no muta su entrada', () => {
    const e = colocarTodos(ronda(3, { normal: 1, pesado: 1, explosivo: 1 }, 1), [[0, 0], [1, 2], [2, 1]]);
    const copia = structuredClone(e);
    calcularPrevistas(e);
    expect(e).toEqual(copia);
  });
});
