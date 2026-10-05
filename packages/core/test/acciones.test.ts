import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { accionesLegales, aplicar, crearRejilla, crearRonda, reproducir, validarEstado } from '../src/index.ts';
import type { Accion, Celdas, Config, Estado, Evento, GranoMano } from '../src/index.ts';
import { arbEscenario, jugar, rondaDe } from './bot.ts';
import { congelar, conMano, estadoDePrueba } from './ayudantes.ts';

/** Configuración explícita: no depende de CONFIG_INICIAL, que se recalibra en H2. */
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

const ANTES_A: Celdas = [
  [3, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
];

const normalEn = (x: number, y: number): GranoMano => ({ tipo: 'normal', celda: { x, y } });

/** Estado en fase colocando con la mano dada (ya colocada) y el resto del mazo en orden de composición. */
function listo(celdas: Celdas, mano: readonly GranoMano[], config: Partial<Config> = {}, extra: Partial<Estado> = {}): Estado {
  return conMano(estadoDePrueba({ config: { ...CONFIG, ...config }, celdas, ...extra }), mano);
}

function inicial(semilla = 1): Estado {
  const ronda = crearRonda(CONFIG, semilla);
  if (!ronda.ok) throw new Error('configuración inválida');
  return ronda.valor.estado;
}

function aplicarBien(estado: Estado, accion: Accion): { readonly estado: Estado; readonly eventos: readonly Evento[] } {
  const r = aplicar(estado, accion);
  if (!r.ok) throw new Error(`acción rechazada: ${JSON.stringify(r.error)}`);
  return r.valor;
}

function aplicarTodas(estado: Estado, acciones: readonly Accion[]): Estado {
  return acciones.reduce((e, a) => aplicarBien(e, a).estado, estado);
}

/** Copia profunda de un estado JSON plano, para comprobar que nada lo muta. */
function copia(estado: Estado): Estado {
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

const colocar = (indiceMano: number, x: number, y: number): Accion => ({ tipo: 'Colocar', indiceMano, x, y });
const DESHACER: Accion = { tipo: 'Deshacer' };
const CONFIRMAR: Accion = { tipo: 'Confirmar' };

describe('Colocar', () => {
  it('asigna la celda, apila el índice y no cambia la rejilla', () => {
    const e = inicial();
    const r = aplicarBien(e, colocar(2, 1, 2));
    expect(r.eventos).toEqual([{ tipo: 'GranoColocado', indiceMano: 2, x: 1, y: 2 }]);
    expect(r.estado.mano[2]).toEqual({ tipo: e.mano[2]?.tipo, celda: { x: 1, y: 2 } });
    expect(r.estado.ordenColocacion).toEqual([2]);
    expect(r.estado.celdas).toEqual(e.celdas);
    expect(validarEstado(r.estado).ok).toBe(true);
  });

  it.each<[string, Accion, string]>([
    ['índice igual al tamaño de la mano', colocar(5, 0, 0), 'IndiceManoInvalido'],
    ['índice negativo', colocar(-1, 0, 0), 'IndiceManoInvalido'],
    ['índice no entero', colocar(1.5, 0, 0), 'IndiceManoInvalido'],
    ['grano ya colocado', colocar(0, 2, 2), 'GranoYaColocado'],
    ['x fuera de la rejilla', colocar(1, 3, 0), 'CeldaFueraDeRejilla'],
    ['y negativa', colocar(1, 0, -1), 'CeldaFueraDeRejilla'],
    ['x no entera', colocar(1, 0.5, 0), 'CeldaFueraDeRejilla'],
    ['y NaN', colocar(1, 0, Number.NaN), 'CeldaFueraDeRejilla'],
  ])('rechaza %s y deja el estado intacto', (_, accion, motivo) => {
    const e = aplicarBien(inicial(), colocar(0, 1, 1)).estado;
    const antes = copia(e);
    expect(aplicar(congelar(e), accion)).toEqual({ ok: false, error: { tipo: 'AccionIlegal', motivo } });
    expect(e).toEqual(antes);
  });
});

describe('Deshacer', () => {
  it('es una pila: deshace la última colocación, no la de mayor índice', () => {
    const colocados = aplicarTodas(inicial(), [colocar(3, 0, 0), colocar(1, 2, 2)]);
    const primero = aplicarBien(colocados, DESHACER);
    expect(primero.eventos).toEqual([{ tipo: 'ColocacionDeshecha', indiceMano: 1 }]);
    expect(primero.estado.mano[1]?.celda).toBeNull();
    expect(primero.estado.mano[3]?.celda).toEqual({ x: 0, y: 0 });
    expect(primero.estado.ordenColocacion).toEqual([3]);
    const segundo = aplicarBien(primero.estado, DESHACER);
    expect(segundo.eventos).toEqual([{ tipo: 'ColocacionDeshecha', indiceMano: 3 }]);
    expect(segundo.estado.ordenColocacion).toEqual([]);
    expect(segundo.estado.mano).toEqual(inicial().mano);
  });

  it('sin colocaciones devuelve NadaQueDeshacer', () => {
    expect(aplicar(inicial(), DESHACER)).toEqual({ ok: false, error: { tipo: 'AccionIlegal', motivo: 'NadaQueDeshacer' } });
  });

  it('tras deshacer se puede colocar el mismo grano en otra celda', () => {
    const e = aplicarTodas(inicial(), [colocar(4, 0, 0), DESHACER, colocar(4, 2, 1)]);
    expect(e.mano[4]?.celda).toEqual({ x: 2, y: 1 });
    expect(e.ordenColocacion).toEqual([4]);
    expect(validarEstado(e).ok).toBe(true);
  });
});

describe('Confirmar', () => {
  it('con algún grano sin colocar devuelve ManoIncompleta', () => {
    const e = aplicarBien(inicial(), colocar(0, 0, 0)).estado;
    expect(aplicar(e, CONFIRMAR)).toEqual({ ok: false, error: { tipo: 'AccionIlegal', motivo: 'ManoIncompleta' } });
  });

  it('con la mano vacía devuelve ManoIncompleta', () => {
    expect(aplicar(listo(ANTES_A, []), CONFIRMAR)).toEqual({
      ok: false,
      error: { tipo: 'AccionIlegal', motivo: 'ManoIncompleta' },
    });
  });

  it('continúa: resuelve, roba la cabeza del mazo y deja un estado válido', () => {
    const e = listo(ANTES_A, [normalEn(0, 0)]);
    const r = aplicarBien(e, CONFIRMAR);
    expect(r.eventos.map((ev) => ev.tipo)).toEqual([
      'TiradaConfirmada',
      'AdicionAplicada',
      'OleadaIniciada',
      'Derrumbe',
      'GranoFuera',
      'GranoFuera',
      'OleadaTerminada',
      'TiradaResuelta',
      'ManoRobada',
    ]);
    expect(r.estado.fase).toBe('colocando');
    expect(r.estado.mano).toEqual(e.mazo.slice(0, CONFIG.tamanoMano).map((tipo) => ({ tipo, celda: null })));
    expect(r.eventos.at(-1)).toEqual({ tipo: 'ManoRobada', tipos: e.mazo.slice(0, CONFIG.tamanoMano) });
    expect(r.estado.mazo).toEqual(e.mazo.slice(CONFIG.tamanoMano));
    expect(r.estado.usados).toEqual(['normal']);
    expect(r.estado.ordenColocacion).toEqual([]);
    expect(r.estado.tiradasRestantes).toBe(e.tiradasRestantes - 1);
    expect(r.estado.puntos).toBe(200);
    expect(r.estado.rng).toEqual(e.rng);
    expect(validarEstado(r.estado)).toEqual({ ok: true, valor: r.estado });
  });

  it('gana con puntos >= meta, conserva los sobrantes y no roba', () => {
    const e = listo(ANTES_A, [normalEn(0, 0)], { meta: 150 });
    const r = aplicarBien(e, CONFIRMAR);
    expect(r.estado.fase).toBe('ganada');
    expect(r.estado.puntos).toBe(200);
    expect(r.eventos.at(-1)).toEqual({ tipo: 'RondaGanada', puntos: 200 });
    expect(r.eventos.some((ev) => ev.tipo === 'ManoRobada')).toBe(false);
    expect(r.estado.mano).toEqual([]);
    expect(r.estado.mazo).toEqual(e.mazo);
    expect(validarEstado(r.estado).ok).toBe(true);
  });

  it('pierde en la última tirada con puntos < meta', () => {
    const e = listo(ANTES_A, [normalEn(0, 0)], {}, { tiradasRestantes: 1 });
    const r = aplicarBien(e, CONFIRMAR);
    expect(r.estado.fase).toBe('perdida');
    expect(r.estado.tiradasRestantes).toBe(0);
    expect(r.eventos.at(-1)).toEqual({ tipo: 'RondaPerdida', puntos: 200 });
    expect(r.eventos.some((ev) => ev.tipo === 'ManoRobada')).toBe(false);
    expect(validarEstado(r.estado).ok).toBe(true);
  });

  it('la victoria gana a la derrota en la última tirada', () => {
    const e = listo(ANTES_A, [normalEn(0, 0)], { meta: 200 }, { tiradasRestantes: 1 });
    const r = aplicarBien(e, CONFIRMAR);
    expect(r.estado.fase).toBe('ganada');
    expect(r.estado.tiradasRestantes).toBe(0);
    expect(r.eventos.at(-1)).toEqual({ tipo: 'RondaGanada', puntos: 200 });
    expect(r.eventos.some((ev) => ev.tipo === 'RondaPerdida')).toBe(false);
    expect(validarEstado(r.estado).ok).toBe(true);
  });

  it('ResolucionNoTermino deja el estado y el azar intactos', () => {
    const e = listo(crearRejilla(3, 3), [normalEn(1, 1)], { topeOleadas: 2 });
    const antes = copia(e);
    expect(aplicar(congelar(e), CONFIRMAR)).toEqual({ ok: false, error: { tipo: 'ResolucionNoTermino', topeOleadas: 2 } });
    expect(e).toEqual(antes);
  });

  it.each<[string, Partial<Config>, Partial<Estado>]>([
    ['ganada', { meta: 150 }, {}],
    ['perdida', {}, { tiradasRestantes: 1 }],
  ])('tras la fase %s toda acción da FaseIncorrecta', (_, config, extra) => {
    const terminal = aplicarBien(listo(ANTES_A, [normalEn(0, 0)], config, extra), CONFIRMAR).estado;
    for (const accion of [colocar(0, 0, 0), DESHACER, CONFIRMAR]) {
      expect(aplicar(terminal, accion)).toEqual({ ok: false, error: { tipo: 'AccionIlegal', motivo: 'FaseIncorrecta' } });
    }
  });
});

describe('accionesLegales', () => {
  it('en el estado inicial solo hay tamanoMano × lado² Colocar, en orden por índice y por filas', () => {
    const acciones = accionesLegales(inicial());
    expect(acciones).toHaveLength(CONFIG.tamanoMano * CONFIG.lado ** 2);
    expect(acciones.every((a) => a.tipo === 'Colocar')).toBe(true);
    expect(acciones.slice(0, 4)).toEqual([colocar(0, 0, 0), colocar(0, 1, 0), colocar(0, 2, 0), colocar(0, 0, 1)]);
    expect(acciones.at(-1)).toEqual(colocar(4, 2, 2));
    expect(accionesLegales(inicial())).toEqual(acciones);
  });

  it('tras colocar uno aparece Deshacer al final', () => {
    const acciones = accionesLegales(aplicarBien(inicial(), colocar(1, 0, 0)).estado);
    expect(acciones).toHaveLength((CONFIG.tamanoMano - 1) * 9 + 1);
    expect(acciones.at(-1)).toEqual(DESHACER);
    expect(acciones.some((a) => a.tipo === 'Colocar' && a.indiceMano === 1)).toBe(false);
  });

  it('con todos colocados solo quedan Deshacer y Confirmar', () => {
    const e = aplicarTodas(inicial(), [0, 1, 2, 3, 4].map((i) => colocar(i, i % 3, 1)));
    expect(accionesLegales(e)).toEqual([DESHACER, CONFIRMAR]);
  });

  it('en una fase terminal la lista está vacía', () => {
    expect(accionesLegales(aplicarBien(listo(ANTES_A, [normalEn(0, 0)], { meta: 150 }), CONFIRMAR).estado)).toEqual([]);
  });

  it('toda acción listada se acepta y las ilegales muestreadas se rechazan', () => {
    fc.assert(
      fc.property(arbEscenario, (escenario) => {
        const { pasos } = jugar(rondaDe(escenario).estado, escenario.enteros);
        for (const { antes: e } of pasos) {
          for (const accion of accionesLegales(e)) expect(aplicar(e, accion).ok).toBe(true);
          const motivo = (accion: Accion) => {
            const r = aplicar(e, accion);
            return r.ok ? 'aceptada' : r.error.tipo === 'AccionIlegal' ? r.error.motivo : r.error.tipo;
          };
          const colocado = e.ordenColocacion[0];
          const libre = e.mano.findIndex((g) => g.celda === null);
          if (colocado !== undefined) expect(motivo(colocar(colocado, 0, 0))).toBe('GranoYaColocado');
          else expect(motivo(DESHACER)).toBe('NadaQueDeshacer');
          if (libre >= 0) {
            expect(motivo(colocar(libre, e.config.lado, 0))).toBe('CeldaFueraDeRejilla');
            expect(motivo(CONFIRMAR)).toBe('ManoIncompleta');
          }
          expect(motivo(colocar(e.mano.length, 0, 0))).toBe('IndiceManoInvalido');
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('reproducir', () => {
  const GUION_CONFIG: Config = { ...CONFIG, tiradas: 3, meta: 5000 };
  const tirada = (fila: number): Accion[] => [...[0, 1, 2, 3, 4].map((i) => colocar(i, i % 3, fila)), CONFIRMAR];
  const GUION: Accion[] = [...tirada(0), colocar(2, 1, 1), DESHACER, ...tirada(2), ...tirada(1)];

  it('reproduce una partida guionizada igual que el pliegue paso a paso de aplicar', () => {
    const ronda = crearRonda(GUION_CONFIG, 12345);
    if (!ronda.ok) throw new Error('configuración inválida');
    let estado = ronda.valor.estado;
    const eventos: Evento[] = [...ronda.valor.eventos];
    for (const accion of GUION) {
      const paso = aplicarBien(estado, accion);
      estado = paso.estado;
      eventos.push(...paso.eventos);
    }
    expect(estado.fase).toBe('perdida');
    expect(reproducir(GUION_CONFIG, 12345, GUION)).toEqual({ ok: true, valor: { estado, eventos } });
  });

  it('determinismo (especificación): dos ejecuciones dan estados y eventos idénticos', () => {
    fc.assert(
      fc.property(arbEscenario, (escenario) => {
        const acciones = jugar(rondaDe(escenario).estado, escenario.enteros).pasos.map((p) => p.accion);
        const a = reproducir(escenario.config, escenario.semilla, acciones);
        expect(a.ok).toBe(true);
        expect(reproducir(escenario.config, escenario.semilla, acciones)).toEqual(a);
      }),
      { numRuns: 200 },
    );
  });

  it('informa el índice de la acción que falla', () => {
    expect(reproducir(CONFIG, 7, [colocar(0, 0, 0), colocar(1, 1, 1), colocar(0, 2, 2)])).toEqual({
      ok: false,
      error: { tipo: 'AccionFallida', indice: 2, error: { tipo: 'AccionIlegal', motivo: 'GranoYaColocado' } },
    });
  });

  it('devuelve ConfigInvalida con una configuración inválida', () => {
    expect(reproducir({ ...CONFIG, siembra: { min: 0, max: 4 } }, 7, [])).toEqual({
      ok: false,
      error: { tipo: 'ConfigInvalida', error: { campo: 'siembra.max', motivo: expect.any(String) } },
    });
  });
});

describe('reciclaje de punta a punta', () => {
  /** Coloca cada grano de la mano en la rejilla, por filas, y confirma. */
  function tiradaCompleta(estado: Estado): { readonly estado: Estado; readonly eventos: readonly Evento[] } {
    const lado = estado.config.lado;
    const colocado = aplicarTodas(
      estado,
      estado.mano.map((_, i) => colocar(i, i % lado, Math.floor(i / lado) % lado)),
    );
    return aplicarBien(colocado, CONFIRMAR);
  }

  it('tamanoMano 6 y 6 tiradas: 6 manos, 36 granos de un mazo de 30 y reciclaje en la sexta mano', () => {
    const config: Config = { ...CONFIG, tiradas: 6, tamanoMano: 6, meta: 1_000_000_000 };
    const ronda = crearRonda(config, 2026);
    if (!ronda.ok) throw new Error('configuración inválida');
    let estado = ronda.valor.estado;
    const manos: (readonly string[])[] = [estado.mano.map((g) => g.tipo)];
    const flujoCambio: boolean[] = [];
    while (estado.fase === 'colocando') {
      const r = tiradaCompleta(estado);
      expect(validarEstado(r.estado)).toEqual({ ok: true, valor: r.estado });
      const robo = r.eventos.find((ev) => ev.tipo === 'ManoRobada');
      if (robo?.tipo === 'ManoRobada') {
        manos.push(robo.tipos);
        flujoCambio.push(r.estado.rng.mazo.join() !== estado.rng.mazo.join());
      }
      estado = r.estado;
    }
    expect(estado.fase).toBe('perdida');
    expect(manos).toHaveLength(6);
    expect(manos.flat()).toHaveLength(36);
    expect(flujoCambio).toEqual([false, false, false, false, true]);
  });

  it('tamanoMano 7: la quinta mano empieza con los dos últimos granos del mazo inicial', () => {
    const config: Config = { ...CONFIG, tiradas: 6, tamanoMano: 7, meta: 1_000_000_000 };
    const ronda = crearRonda(config, 2026);
    if (!ronda.ok) throw new Error('configuración inválida');
    let estado = ronda.valor.estado;
    const ordenInicial = [...estado.mano.map((g) => g.tipo), ...estado.mazo];
    for (let i = 0; i < 4; i++) estado = tiradaCompleta(estado).estado;
    expect(estado.mano.slice(0, 2).map((g) => g.tipo)).toEqual(ordenInicial.slice(28));
    expect(estado.mano).toHaveLength(7);
    expect(estado.usados).toEqual([]);
    expect(validarEstado(estado).ok).toBe(true);
  });
});
