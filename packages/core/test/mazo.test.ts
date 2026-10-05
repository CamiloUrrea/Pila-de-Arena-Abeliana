import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CONFIG_INICIAL, barajar, crearMazo, derivarFlujo, robarMano } from '../src/index.ts';
import type { Config, EstadoFlujo, GranoMano, TipoGrano } from '../src/index.ts';
import { congelar } from './ayudantes.ts';

function contar(tipos: readonly TipoGrano[]): Record<TipoGrano, number> {
  return {
    normal: tipos.filter((t) => t === 'normal').length,
    pesado: tipos.filter((t) => t === 'pesado').length,
    explosivo: tipos.filter((t) => t === 'explosivo').length,
  };
}

const tiposDe = (mano: readonly GranoMano[]): TipoGrano[] => mano.map((g) => g.tipo);

type Paso = {
  readonly mano: readonly GranoMano[];
  readonly mazo: readonly TipoGrano[];
  readonly usados: readonly TipoGrano[];
  readonly flujo: EstadoFlujo;
};

/** Crea el mazo y roba `robos` manos, pasando cada mano jugada a `usados` antes del siguiente robo. */
function partida(composicion: Config['mazo'], tamanoMano: number, robos: number, semilla: number): Paso[] {
  const inicial = crearMazo(composicion, derivarFlujo(semilla, 'mazo'));
  const pasos: Paso[] = [];
  let mazo = inicial.mazo;
  let usados: readonly TipoGrano[] = [];
  let flujo = inicial.flujo;
  for (let i = 0; i < robos; i++) {
    const robo = robarMano(mazo, usados, tamanoMano, flujo);
    pasos.push(robo);
    mazo = robo.mazo;
    usados = [...robo.usados, ...tiposDe(robo.mano)];
    flujo = robo.flujo;
  }
  return pasos;
}

const flujo = derivarFlujo(12345, 'mazo');

describe('crearMazo', () => {
  it('tiene exactamente la composición configurada', () => {
    expect(contar(crearMazo(CONFIG_INICIAL.mazo, flujo).mazo)).toEqual(CONFIG_INICIAL.mazo);
  });

  it('baraja de forma determinista con la semilla', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), (semilla) => {
        const f = derivarFlujo(semilla, 'mazo');
        expect(crearMazo(CONFIG_INICIAL.mazo, f)).toEqual(crearMazo(CONFIG_INICIAL.mazo, f));
      }),
    );
  });

  it('regresión (no independiente: valores fijados con esta implementación): CONFIG_INICIAL y semilla 12345', () => {
    expect(crearMazo(CONFIG_INICIAL.mazo, flujo)).toEqual({
      mazo: [
        'pesado', 'normal', 'normal', 'normal', 'normal', 'explosivo', 'normal', 'explosivo', 'normal', 'pesado',
        'normal', 'pesado', 'normal', 'normal', 'pesado', 'normal', 'normal', 'normal', 'pesado', 'normal',
        'normal', 'explosivo', 'pesado', 'normal', 'normal', 'explosivo', 'normal', 'normal', 'normal', 'normal',
      ],
      flujo: [4270033129, 3302256988, 1994151541, 2874483822],
    });
  });
});

describe('robarMano', () => {
  it('toma la cabeza del mazo en orden y no consume el flujo si el mazo alcanza', () => {
    const r = robarMano(['pesado', 'normal', 'explosivo', 'normal'], ['pesado'], 3, flujo);
    expect(r).toEqual({
      mano: [
        { tipo: 'pesado', celda: null },
        { tipo: 'normal', celda: null },
        { tipo: 'explosivo', celda: null },
      ],
      mazo: ['normal'],
      usados: ['pesado'],
      flujo,
      evento: { tipo: 'ManoRobada', tipos: ['pesado', 'normal', 'explosivo'] },
    });
  });

  it('con el mazo justo tampoco consume el flujo', () => {
    const r = robarMano(['normal', 'pesado'], ['explosivo'], 2, flujo);
    expect(r.flujo).toBe(flujo);
    expect(r.mazo).toEqual([]);
    expect(r.usados).toEqual(['explosivo']);
  });

  it('recicla: mazo [a,b], usados [c,d,e] y tamanoMano 3', () => {
    const usados: TipoGrano[] = ['explosivo', 'pesado', 'normal'];
    const [barajado, trasBarajar] = barajar(usados, flujo);
    const r = robarMano(['pesado', 'explosivo'], usados, 3, flujo);
    expect(tiposDe(r.mano)).toEqual(['pesado', 'explosivo', barajado[0]]);
    expect(r.mazo).toEqual(barajado.slice(1));
    expect(r.usados).toEqual([]);
    expect(r.flujo).toEqual(trasBarajar);
    expect(r.evento).toEqual({ tipo: 'ManoRobada', tipos: tiposDe(r.mano) });
  });

  it('reciclaje del mazo (especificación): tamanoMano 6, seis robos y 36 granos de un mazo de 30', () => {
    const inicial = crearMazo(CONFIG_INICIAL.mazo, flujo);
    let mazo = inicial.mazo;
    let usados: readonly TipoGrano[] = [];
    let f = inicial.flujo;
    let robados = 0;
    for (let i = 0; i < 6; i++) {
      const r = robarMano(mazo, usados, 6, f);
      robados += r.mano.length;
      expect(contar([...r.mazo, ...tiposDe(r.mano), ...r.usados])).toEqual(CONFIG_INICIAL.mazo);
      if (i < 5) expect(r.flujo).toBe(f);
      else expect(r.flujo).not.toEqual(f);
      mazo = r.mazo;
      usados = [...r.usados, ...tiposDe(r.mano)];
      f = r.flujo;
    }
    expect(robados).toBe(36);
  });

  it('reciclaje del mazo (especificación): tamanoMano 7 toma los 2 restantes antes que los usados barajados', () => {
    const composicion = { normal: 20, pesado: 6, explosivo: 4 };
    const inicial = crearMazo(composicion, flujo);
    let mazo = inicial.mazo;
    let usados: readonly TipoGrano[] = [];
    let f = inicial.flujo;
    for (let i = 0; i < 4; i++) {
      const r = robarMano(mazo, usados, 7, f);
      expect(contar([...r.mazo, ...tiposDe(r.mano), ...r.usados])).toEqual(composicion);
      expect(r.flujo).toBe(f);
      mazo = r.mazo;
      usados = [...r.usados, ...tiposDe(r.mano)];
      f = r.flujo;
    }
    expect(mazo).toHaveLength(2);
    expect(usados).toHaveLength(28);

    const [barajado, trasBarajar] = barajar(usados, f);
    const quinto = robarMano(mazo, usados, 7, f);
    expect(tiposDe(quinto.mano)).toEqual([...mazo, ...barajado.slice(0, 5)]);
    expect(quinto.mazo).toEqual(barajado.slice(5));
    expect(quinto.usados).toEqual([]);
    expect(quinto.flujo).toEqual(trasBarajar);
    expect(quinto.flujo).not.toEqual(f);
    expect(contar([...quinto.mazo, ...tiposDe(quinto.mano), ...quinto.usados])).toEqual(composicion);
  });

  const arbPartida = fc
    .record({
      normal: fc.integer({ min: 0, max: 10 }),
      pesado: fc.integer({ min: 0, max: 10 }),
      explosivo: fc.integer({ min: 0, max: 10 }),
    })
    .filter((c) => c.normal + c.pesado + c.explosivo >= 1)
    .chain((composicion) =>
      fc.record({
        composicion: fc.constant(composicion),
        tamanoMano: fc.integer({ min: 1, max: composicion.normal + composicion.pesado + composicion.explosivo }),
        robos: fc.integer({ min: 1, max: 20 }),
        semilla: fc.integer({ min: 0, max: 0xffffffff }),
      }),
    );

  it('conserva la composición, roba siempre tamanoMano granos y es determinista', () => {
    fc.assert(
      fc.property(arbPartida, ({ composicion, tamanoMano, robos, semilla }) => {
        const pasos = partida(composicion, tamanoMano, robos, semilla);
        for (const paso of pasos) {
          expect(paso.mano).toHaveLength(tamanoMano);
          expect(paso.mano.every((g) => g.celda === null)).toBe(true);
          expect(contar([...paso.mazo, ...tiposDe(paso.mano), ...paso.usados])).toEqual(composicion);
        }
        expect(partida(composicion, tamanoMano, robos, semilla)).toEqual(pasos);
      }),
      { numRuns: 300 },
    );
  });

  it.each<[string, TipoGrano[], TipoGrano[], number]>([
    ['faltan granos entre mazo y usados', ['normal'], ['pesado'], 3],
    ['tamanoMano 0', ['normal'], [], 0],
    ['tamanoMano no entero', ['normal', 'normal'], [], 1.5],
  ])('lanza RangeError si %s', (_, mazo, usados, tamanoMano) => {
    expect(() => robarMano(mazo, usados, tamanoMano, flujo)).toThrow(RangeError);
  });
});

describe('pureza del mazo', () => {
  it('crearMazo y robarMano no mutan sus entradas', () => {
    const composicion = congelar({ ...CONFIG_INICIAL.mazo });
    const f = congelar(derivarFlujo(7, 'mazo'));
    crearMazo(composicion, f);
    const mazo = congelar<TipoGrano[]>(['normal', 'pesado']);
    const usados = congelar<TipoGrano[]>(['explosivo', 'normal', 'pesado']);
    robarMano(mazo, usados, 1, f);
    robarMano(mazo, usados, 4, f);
    expect(composicion).toEqual(CONFIG_INICIAL.mazo);
    expect(f).toEqual(derivarFlujo(7, 'mazo'));
    expect(mazo).toEqual(['normal', 'pesado']);
    expect(usados).toEqual(['explosivo', 'normal', 'pesado']);
  });
});
