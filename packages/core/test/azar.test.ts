import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { barajar, derivarFlujo, deserializar, enteroEnRango, serializar, siguienteU32 } from '../src/index.ts';
import type { EstadoFlujo } from '../src/index.ts';
import { arbFlujo, congelar, estadoDePrueba } from './ayudantes.ts';

const DOS_A_LA_30 = 2 ** 30;
const DOS_A_LA_32 = 2 ** 32;

/** Las `n` siguientes salidas de 32 bits y el estado final. */
function salidas(flujo: EstadoFlujo, n: number): readonly [number[], EstadoFlujo] {
  const valores: number[] = [];
  let actual = flujo;
  for (let i = 0; i < n; i++) {
    const [valor, siguiente] = siguienteU32(actual);
    valores.push(valor);
    actual = siguiente;
  }
  return [valores, actual];
}

function esFlujoValido(flujo: EstadoFlujo): boolean {
  return (
    flujo.length === 4 &&
    flujo.every((p) => Number.isInteger(p) && p >= 0 && p <= 0xffffffff) &&
    flujo.some((p) => p !== 0)
  );
}

/** Estadístico chi-cuadrado frente a una distribución uniforme. */
function chiCuadrado(cuentas: readonly number[], total: number): number {
  const esperado = total / cuentas.length;
  return cuentas.reduce((suma, c) => suma + (c - esperado) ** 2 / esperado, 0);
}

describe('siguienteU32: vectores de referencia', () => {
  // Fuente independiente: xoshiro128starstar.c de https://prng.di.unimi.it/ (versión 1.1),
  // compilado sin modificar con zig cc e incluido desde un arnés que fija s[] y llama a next().
  // Ver docs/azar.md.
  it.each<[EstadoFlujo, number[], EstadoFlujo]>([
    [
      [1, 2, 3, 4],
      [11520, 0, 5927040, 70819200, 2031721883, 1637235492, 1287239034, 3734860849, 3729100597, 4258142804],
      [939045227, 1864939416, 1451579149, 2199351389],
    ],
    [
      [2654435769, 608135816, 3084996962, 3735928559],
      [2463954730, 5524658, 74256371, 1905451993, 3123413897, 314453775, 1263677054, 1531511215, 693760292, 1307612896],
      [4005083434, 346906862, 2347368909, 1629188934],
    ],
    [
      [4294967295, 4294967295, 4294967295, 4294967295],
      [4294962679, 4294962679, 4292019319, 2943360, 1509943680, 246671744, 2681405836, 4051244843, 1053453815, 832600121],
      [4026263102, 130810370, 4750275, 1352015486],
    ],
    [
      [1, 0, 0, 0],
      [0, 5760, 5760, 2954880, 14745600, 4197258880, 1524706560, 1536491700, 3772860173, 4195808116],
      [1226967301, 2831691840, 2827893573, 4054463049],
    ],
  ])('desde %j', (inicial, esperadas, final) => {
    expect(salidas(inicial, 10)).toEqual([esperadas, final]);
  });
});

describe('regresión (no independiente: valores fijados con esta implementación)', () => {
  it('derivarFlujo(12345, …)', () => {
    expect(derivarFlujo(12345, 'siembra')).toEqual([4119970299, 3499359283, 3813384076, 1650873911]);
    expect(derivarFlujo(12345, 'mazo')).toEqual([817380383, 321862996, 899882096, 2624516712]);
  });

  it('barajar [0..9] con el flujo mazo de 12345', () => {
    expect(barajar([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], derivarFlujo(12345, 'mazo'))).toEqual([
      [5, 4, 9, 1, 8, 3, 0, 6, 2, 7],
      [1183083917, 1859178289, 2388998877, 866832300],
    ]);
  });
});

describe('propiedades del generador', () => {
  const arbSemilla = fc.integer({ min: 0, max: 0xffffffff });
  const arbNombre = fc.constantFrom<'siembra' | 'mazo'>('siembra', 'mazo');

  it('es determinista', () => {
    fc.assert(
      fc.property(arbFlujo, fc.integer({ min: 0, max: 50 }), (flujo, n) => {
        expect(salidas(flujo, n)).toEqual(salidas(flujo, n));
      }),
    );
  });

  it('tras N pasos el estado son cuatro palabras de 32 bits no todas cero', () => {
    fc.assert(
      fc.property(arbFlujo, fc.integer({ min: 0, max: 200 }), (flujo, n) => {
        const [valores, final] = salidas(flujo, n);
        expect(esFlujoValido(final)).toBe(true);
        expect(valores.every((v) => Number.isInteger(v) && v >= 0 && v < DOS_A_LA_32)).toBe(true);
      }),
    );
  });

  it('serializar el estado y continuar da la misma secuencia', () => {
    fc.assert(
      fc.property(arbFlujo, arbFlujo, fc.integer({ min: 0, max: 20 }), (siembra, mazo, n) => {
        const [, avanzado] = salidas(mazo, n);
        const leido = deserializar(serializar(estadoDePrueba({ rng: { siembra, mazo: avanzado } })));
        expect(leido.ok).toBe(true);
        if (leido.ok) {
          expect(salidas(leido.valor.rng.mazo, 10)).toEqual(salidas(avanzado, 10));
          expect(salidas(leido.valor.rng.siembra, 10)).toEqual(salidas(siembra, 10));
        }
      }),
    );
  });

  it('derivarFlujo da estados válidos e iguales con los mismos argumentos', () => {
    fc.assert(
      fc.property(arbSemilla, arbNombre, (semilla, nombre) => {
        const flujo = derivarFlujo(semilla, nombre);
        expect(esFlujoValido(flujo)).toBe(true);
        expect(derivarFlujo(semilla, nombre)).toEqual(flujo);
      }),
    );
  });

  it('derivarFlujo da estados distintos con nombres distintos', () => {
    fc.assert(
      fc.property(arbSemilla, (semilla) => {
        expect(derivarFlujo(semilla, 'siembra')).not.toEqual(derivarFlujo(semilla, 'mazo'));
      }),
    );
  });

  it('derivarFlujo da estados distintos con semillas distintas', () => {
    fc.assert(
      fc.property(arbSemilla, arbSemilla, arbNombre, (a, b, nombre) => {
        fc.pre(a !== b);
        expect(derivarFlujo(a, nombre)).not.toEqual(derivarFlujo(b, nombre));
      }),
    );
  });

  it('consumir mazo no cambia el estado ni la secuencia de siembra', () => {
    fc.assert(
      fc.property(arbSemilla, fc.integer({ min: 1, max: 50 }), (semilla, n) => {
        const rng = { siembra: derivarFlujo(semilla, 'siembra'), mazo: derivarFlujo(semilla, 'mazo') };
        const [, mazo] = barajar(Array.from({ length: n }, (_, i) => i), rng.mazo);
        const despues = { ...rng, mazo };
        expect(despues.siembra).toEqual(derivarFlujo(semilla, 'siembra'));
        expect(salidas(despues.siembra, 10)).toEqual(salidas(rng.siembra, 10));
      }),
    );
  });

  it('ninguna función muta sus entradas', () => {
    fc.assert(
      fc.property(arbFlujo, fc.array(fc.integer(), { maxLength: 20 }), (flujo, items) => {
        const copiaFlujo = [...flujo];
        const copiaItems = [...items];
        const congeladoFlujo = congelar(flujo);
        const congeladoItems = congelar(items);
        siguienteU32(congeladoFlujo);
        enteroEnRango(congeladoFlujo, -5, 5);
        barajar(congeladoItems, congeladoFlujo);
        expect(congeladoFlujo).toEqual(copiaFlujo);
        expect(congeladoItems).toEqual(copiaItems);
      }),
    );
  });

  it.each([-1, DOS_A_LA_32, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('derivarFlujo lanza RangeError con la semilla %s', (semilla) => {
    expect(() => derivarFlujo(semilla, 'mazo')).toThrow(RangeError);
  });

  it('derivarFlujo admite los extremos de la semilla', () => {
    expect(esFlujoValido(derivarFlujo(0, 'siembra'))).toBe(true);
    expect(esFlujoValido(derivarFlujo(0xffffffff, 'mazo'))).toBe(true);
  });
});

describe('enteroEnRango', () => {
  const flujo = derivarFlujo(2026, 'mazo');

  it('siempre cae dentro del rango', () => {
    fc.assert(
      fc.property(
        arbFlujo,
        fc.integer({ min: -(2 ** 40), max: 2 ** 40 }),
        fc.integer({ min: 0, max: DOS_A_LA_32 - 1 }),
        (f, min, ancho) => {
          const [valor, siguiente] = enteroEnRango(f, min, min + ancho);
          expect(Number.isSafeInteger(valor)).toBe(true);
          expect(valor).toBeGreaterThanOrEqual(min);
          expect(valor).toBeLessThanOrEqual(min + ancho);
          expect(esFlujoValido(siguiente)).toBe(true);
        },
      ),
    );
  });

  it('un rango de un solo valor lo devuelve sin consumir el flujo', () => {
    expect(enteroEnRango(flujo, 7, 7)).toEqual([7, flujo]);
    expect(enteroEnRango(flujo, -3, -3)).toEqual([-3, flujo]);
  });

  it('el rango completo de 2^32 valores devuelve la salida bruta desplazada', () => {
    const [bruto, trasBruto] = siguienteU32(flujo);
    expect(enteroEnRango(flujo, 0, DOS_A_LA_32 - 1)).toEqual([bruto, trasBruto]);
    expect(enteroEnRango(flujo, -(2 ** 31), 2 ** 31 - 1)).toEqual([bruto - 2 ** 31, trasBruto]);
  });

  it.each<[string, number, number]>([
    ['min > max', 5, 4],
    ['más de 2^32 valores', 0, DOS_A_LA_32],
    ['min no entero', 0.5, 3],
    ['max no entero', 0, 2.5],
    ['max no seguro', 0, 2 ** 53],
    ['NaN', Number.NaN, 3],
  ])('lanza RangeError con %s', (_, min, max) => {
    expect(() => enteroEnRango(flujo, min, max)).toThrow(RangeError);
  });

  it.each<[number, number]>([
    [6, 20.515],
    [7, 22.458],
  ])('es uniforme para n=%i (chi-cuadrado < %f, nivel 0,001)', (n, critico) => {
    const cuentas = Array.from({ length: n }, () => 0);
    let actual = derivarFlujo(42, 'mazo');
    for (let i = 0; i < 100_000; i++) {
      const [valor, siguiente] = enteroEnRango(actual, 0, n - 1);
      cuentas[valor] = (cuentas[valor] ?? 0) + 1;
      actual = siguiente;
    }
    expect(chiCuadrado(cuentas, 100_000)).toBeLessThan(critico);
  });

  it('no tiene sesgo de módulo: con 3·2^30 valores, 1/3 cae por debajo de 2^30', () => {
    let bajos = 0;
    let actual = derivarFlujo(42, 'siembra');
    for (let i = 0; i < 30_000; i++) {
      const [valor, siguiente] = enteroEnRango(actual, 0, 3 * DOS_A_LA_30 - 1);
      if (valor < DOS_A_LA_30) bajos++;
      actual = siguiente;
    }
    expect(Math.abs(bajos / 30_000 - 1 / 3)).toBeLessThan(0.02);
  });
});

describe('barajar', () => {
  it('devuelve una permutación del mismo multiconjunto', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 5 }), { maxLength: 40 }), arbFlujo, (items, flujo) => {
        const [barajado] = barajar(items, flujo);
        expect(barajado).not.toBe(items);
        expect([...barajado].sort()).toEqual([...items].sort());
      }),
    );
  });

  it('con 0 o 1 elementos no consume el flujo', () => {
    const flujo = derivarFlujo(1, 'mazo');
    expect(barajar([], flujo)).toEqual([[], flujo]);
    expect(barajar(['a'], flujo)).toEqual([['a'], flujo]);
  });

  it('es uniforme sobre las 24 permutaciones de 4 elementos (chi-cuadrado < 49,728, nivel 0,001)', () => {
    const cuentas = new Map<string, number>();
    let actual = derivarFlujo(7, 'mazo');
    for (let i = 0; i < 48_000; i++) {
      const [barajado, siguiente] = barajar([0, 1, 2, 3], actual);
      const clave = barajado.join('');
      cuentas.set(clave, (cuentas.get(clave) ?? 0) + 1);
      actual = siguiente;
    }
    expect(cuentas.size).toBe(24);
    expect(chiCuadrado([...cuentas.values()], 48_000)).toBeLessThan(49.728);
  });
});
