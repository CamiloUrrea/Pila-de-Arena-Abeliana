import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CONFIG_INICIAL, accionesLegales, aplicar, crearRonda, derivarFlujo } from '@pila/core';
import type { Accion, Config, Estado, GranoMano, TipoGrano } from '@pila/core';
import {
  BOTS,
  BOT_ALEATORIO,
  BOT_AVARO,
  BOT_BORDE,
  BOT_CARGADOR,
  distanciaAlCentro,
  flujoDelBot,
  jugarConBot,
  proyectar,
  simularRonda,
} from '../src/index.ts';
import type { Bot } from '../src/index.ts';
import { estadoDePrueba } from './ayudantes.ts';

const arbSemilla = fc.integer({ min: 0, max: 0xffffffff });

/** Configuraciones variadas con el mazo de CONFIG_INICIAL. */
const arbConfig: fc.Arbitrary<Config> = fc
  .record({
    lado: fc.integer({ min: 1, max: 6 }),
    tiradas: fc.integer({ min: 1, max: 5 }),
    tamanoMano: fc.integer({ min: 1, max: 6 }),
    meta: fc.integer({ min: 1, max: 4000 }),
  })
  .map((r) => ({ ...CONFIG_INICIAL, ...r }));

const libre = (tipo: TipoGrano): GranoMano => ({ tipo, celda: null });

function celda(accion: Accion | undefined): string {
  return accion?.tipo === 'Colocar' ? `${accion.x},${accion.y}` : String(accion?.tipo);
}

function elige(bot: Bot, estado: Estado): string {
  return celda(bot.elegir(estado, accionesLegales(estado), derivarFlujo(1, 'mazo'))[0]);
}

/** Estado de lado 3 con la rejilla y la mano dadas (por defecto, un grano normal) y 5 tiradas restantes. */
function con(celdas: number[][], mano: readonly GranoMano[] = [libre('normal')], extra: Partial<Estado> = {}): Estado {
  return estadoDePrueba(celdas.length, { celdas, mano, ordenColocacion: [], ...extra });
}

/** Aplica la acción que elige el bot y devuelve el estado siguiente. */
function paso(bot: Bot, estado: Estado): { readonly accion: Accion; readonly estado: Estado } {
  const [accion] = bot.elegir(estado, accionesLegales(estado), derivarFlujo(1, 'mazo'));
  const r = aplicar(estado, accion);
  if (!r.ok) throw new Error(`acción rechazada: ${JSON.stringify(r.error)}`);
  return { accion, estado: r.valor.estado };
}

describe('registro', () => {
  it('avaro y cargador están en BOTS con su nombre', () => {
    expect(BOTS['avaro']).toBe(BOT_AVARO);
    expect(BOTS['cargador']).toBe(BOT_CARGADOR);
  });
});

describe.each([BOT_AVARO, BOT_CARGADOR])('bot $nombre', (bot) => {
  it('juega 500 rondas con configuraciones variadas sin acciones ilegales', () => {
    fc.assert(
      fc.property(arbConfig, arbSemilla, (config, semilla) => {
        expect(['ganada', 'perdida']).toContain(simularRonda(config, semilla, bot).fase);
      }),
      { numRuns: 500 },
    );
  });

  it('es determinista, nunca deshace y no consume azar', () => {
    expect(simularRonda(CONFIG_INICIAL, 31, bot)).toEqual(simularRonda(CONFIG_INICIAL, 31, bot));
    const { acciones } = jugarConBot(CONFIG_INICIAL, 31, bot);
    expect(acciones.some((a) => a.tipo === 'Deshacer')).toBe(false);
    const flujo = derivarFlujo(9, 'siembra');
    const estado = estadoDePrueba(3);
    expect(bot.elegir(estado, accionesLegales(estado), flujo)[1]).toBe(flujo);
  });

  it('confirma cuando todos los granos están colocados', () => {
    let estado = estadoDePrueba(3);
    for (let i = 0; i < estado.mano.length; i++) estado = paso(BOT_ALEATORIO, estado).estado;
    expect(accionesLegales(estado)).toEqual([{ tipo: 'Deshacer' }, { tipo: 'Confirmar' }]);
    expect(elige(bot, estado)).toBe('Confirmar');
  });
});

describe('bot avaro', () => {
  it('elige la celda con más granos aunque sea la central', () => {
    expect(elige(BOT_AVARO, con([[1, 0, 2], [0, 3, 0], [2, 0, 0]]))).toBe('1,1');
  });

  it('en empate elige la primera por filas', () => {
    expect(elige(BOT_AVARO, con([[0, 0, 0], [0, 2, 2], [2, 0, 0]]))).toBe('1,1');
    expect(elige(BOT_AVARO, con([[0, 0, 0], [0, 0, 0], [0, 0, 0]]))).toBe('0,0');
  });

  it('propiedad: la celda del primer grano tiene la carga máxima de la rejilla', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 7 }), arbSemilla, (lado, semilla) => {
        const ronda = crearRonda({ ...CONFIG_INICIAL, lado }, semilla);
        if (!ronda.ok) throw new Error('configuración inválida');
        const estado = ronda.valor.estado;
        const [accion] = BOT_AVARO.elegir(estado, accionesLegales(estado), flujoDelBot(semilla));
        if (accion.tipo !== 'Colocar') throw new Error('se esperaba Colocar');
        expect(estado.celdas[accion.y]?.[accion.x]).toBe(Math.max(...estado.celdas.flat()));
      }),
      { numRuns: 300 },
    );
  });
});

describe('proyectar', () => {
  const vacia = (): number[][] => [
    [0, 0, 0],
    [0, 1, 0],
    [0, 0, 0],
  ];

  it('normal suma 1 y pesado suma 2 en su celda', () => {
    expect(proyectar(vacia(), [], { tipo: 'normal', x: 1, y: 1 })).toEqual([
      [0, 0, 0],
      [0, 2, 0],
      [0, 0, 0],
    ]);
    expect(proyectar(vacia(), [], { tipo: 'pesado', x: 2, y: 0 })).toEqual([
      [0, 0, 2],
      [0, 1, 0],
      [0, 0, 0],
    ]);
  });

  it('explosivo suma a su celda y a los vecinos dentro, sin contar los de fuera', () => {
    expect(proyectar(vacia(), [], { tipo: 'explosivo', x: 1, y: 1 })).toEqual([
      [0, 1, 0],
      [1, 2, 1],
      [0, 1, 0],
    ]);
    const esquina = proyectar(vacia(), [], { tipo: 'explosivo', x: 0, y: 0 });
    expect(esquina).toEqual([
      [1, 1, 0],
      [1, 1, 0],
      [0, 0, 0],
    ]);
    expect(esquina.flat().reduce((a, b) => a + b, 0)).toBe(1 + 3);
    expect(proyectar([[0]], [], { tipo: 'explosivo', x: 0, y: 0 })).toEqual([[1]]);
  });

  it('tiene en cuenta las colocaciones provisionales y no muta la entrada', () => {
    const celdas = vacia();
    const provisionales: GranoMano[] = [
      { tipo: 'pesado', celda: { x: 0, y: 2 } },
      { tipo: 'normal', celda: null },
      { tipo: 'explosivo', celda: { x: 2, y: 2 } },
    ];
    expect(proyectar(celdas, provisionales, { tipo: 'normal', x: 0, y: 2 })).toEqual([
      [0, 0, 0],
      [0, 1, 1],
      [3, 1, 1],
    ]);
    expect(celdas).toEqual(vacia());
  });

  it('la distancia al centro es entera y simétrica', () => {
    expect(distanciaAlCentro(1, 1, 3)).toBe(0);
    expect(distanciaAlCentro(0, 0, 3)).toBe(4);
    expect([distanciaAlCentro(1, 1, 4), distanciaAlCentro(2, 2, 4), distanciaAlCentro(0, 0, 4)]).toEqual([2, 2, 6]);
  });
});

describe('bot cargador', () => {
  it('con un normal y una celda en 2, elige esa celda (queda en 3)', () => {
    expect(elige(BOT_CARGADOR, con([[0, 0, 0], [0, 2, 0], [0, 0, 1]]))).toBe('1,1');
  });

  it('salta las celdas en 3 y elige la siguiente de mayor carga válida', () => {
    expect(elige(BOT_CARGADOR, con([[3, 0, 0], [0, 3, 0], [1, 2, 0]]))).toBe('1,2');
  });

  it('con un pesado evita las celdas en 2 o más y elige la mayor que quede por debajo de 4', () => {
    expect(elige(BOT_CARGADOR, con([[2, 0, 0], [0, 3, 0], [1, 0, 0]], [libre('pesado')]))).toBe('0,2');
  });

  it('con un explosivo evita las celdas cuyo efecto haría colapsar a un vecino', () => {
    // En (0,0) quedaría en 3, pero su vecino (0,1) pasaría de 3 a 4; (2,2) también queda en 3 y nadie colapsa.
    expect(elige(BOT_CARGADOR, con([[2, 0, 0], [3, 0, 0], [0, 0, 2]], [libre('explosivo')]))).toBe('2,2');
  });

  it('cuenta las colocaciones provisionales: el segundo grano ve la carga que dejó el primero', () => {
    const inicio = con([[0, 0, 0], [0, 2, 0], [0, 0, 1]], [libre('normal'), libre('normal')]);
    const primero = paso(BOT_CARGADOR, inicio);
    expect(celda(primero.accion)).toBe('1,1');
    expect(elige(BOT_CARGADOR, primero.estado)).toBe('2,2');
  });

  it('sin celda válida, detona en la más cercana al centro', () => {
    expect(elige(BOT_CARGADOR, con([[3, 3, 3], [3, 3, 3], [3, 3, 3]]))).toBe('1,1');
    expect(elige(BOT_CARGADOR, con([[2, 3, 3], [3, 3, 3], [3, 3, 3]], [libre('pesado')]))).toBe('1,1');
  });

  it('en la última tirada coloca todos los granos en la más cercana al centro aunque haya celdas válidas', () => {
    let estado = con([[2, 0, 0], [0, 0, 0], [0, 0, 0]], [libre('normal'), libre('pesado'), libre('explosivo')], {
      tiradasRestantes: 1,
    });
    const colocaciones: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = paso(BOT_CARGADOR, estado);
      colocaciones.push(celda(r.accion));
      estado = r.estado;
    }
    expect(colocaciones).toEqual(['1,1', '1,1', '1,1']);
    expect(elige(BOT_CARGADOR, con([[2, 0, 0], [0, 0, 0], [0, 0, 0]]))).toBe('0,0');
  });

  it('con lado par, en la última tirada desempata por filas', () => {
    const cuatro = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    expect(elige(BOT_CARGADOR, con(cuatro, [libre('normal')], { tiradasRestantes: 1 }))).toBe('1,1');
    expect(elige(BOT_CARGADOR, con([[0, 0], [0, 0]], [libre('normal')], { tiradasRestantes: 1 }))).toBe('0,0');
  });

  describe('comportamiento estadístico en lado 5 con meta inalcanzable (500 rondas)', () => {
    // Medido con 4 bloques de 500 semillas: oleadas medias de la última tirada 8,42–8,95 frente a
    // 0,53–0,65 en las anteriores; carga media por celda al empezar la última tirada 2,12–2,14 con el
    // cargador y 1,85–1,86 con el aleatorio. Pisos holgados por debajo de esos valores.
    const config: Config = { ...CONFIG_INICIAL, lado: 5, meta: 1_000_000_000 };
    const SEMILLAS = Array.from({ length: 500 }, (_, i) => i);

    /** Carga media por celda al empezar la última tirada, jugando con la interfaz pública de core. */
    function cargaAntesDeLaUltima(bot: Bot, semilla: number): number {
      const ronda = crearRonda(config, semilla);
      if (!ronda.ok) throw new Error('configuración inválida');
      let estado = ronda.valor.estado;
      let azar = flujoDelBot(semilla);
      while (!(estado.tiradasRestantes === 1 && estado.ordenColocacion.length === 0)) {
        const [accion, siguiente] = bot.elegir(estado, accionesLegales(estado), azar);
        const r = aplicar(estado, accion);
        if (!r.ok) throw new Error('acción rechazada');
        estado = r.valor.estado;
        azar = siguiente;
      }
      return estado.celdas.flat().reduce((a, b) => a + b, 0) / config.lado ** 2;
    }

    const media = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

    it('las oleadas de la última tirada superan con mucho a las de las anteriores', () => {
      const registros = SEMILLAS.map((s) => simularRonda(config, s, BOT_CARGADOR));
      const ultima = media(registros.map((r) => r.porTirada.at(-1)?.oleadas ?? 0));
      const anteriores = media(registros.flatMap((r) => r.porTirada.slice(0, -1).map((t) => t.oleadas)));
      expect(ultima).toBeGreaterThan(6);
      expect(ultima).toBeGreaterThan(5 * anteriores);
    });

    it('la carga al empezar la última tirada es mayor que con el bot aleatorio', () => {
      const cargador = media(SEMILLAS.map((s) => cargaAntesDeLaUltima(BOT_CARGADOR, s)));
      const aleatorio = media(SEMILLAS.map((s) => cargaAntesDeLaUltima(BOT_ALEATORIO, s)));
      expect(cargador).toBeGreaterThan(aleatorio + 0.15);
    });
  });
});

describe('comparación', () => {
  const registros = (bot: Bot) => Array.from({ length: 300 }, (_, s) => simularRonda(CONFIG_INICIAL, s, bot));

  it('con 300 semillas, cargador y aleatorio no dan registros idénticos', () => {
    expect(registros(BOT_CARGADOR)).not.toEqual(registros(BOT_ALEATORIO));
  });

  it('con 300 semillas, avaro y borde no dan registros idénticos', () => {
    expect(registros(BOT_AVARO)).not.toEqual(registros(BOT_BORDE));
  });
});
