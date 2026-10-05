import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CONFIG_INICIAL, accionesLegales, aplicar, derivarFlujo, validarEstado } from '@pila/core';
import type { Accion, Config, Estado, EstadoFlujo } from '@pila/core';
import { BOTS, BOT_ALEATORIO, BOT_BORDE, jugarConBot, simularLote, simularRonda } from '../src/index.ts';
import { estadoDePrueba } from './ayudantes.ts';

const temporal = mkdtempSync(join(tmpdir(), 'pila-bots-'));
afterAll(() => rmSync(temporal, { recursive: true, force: true }));

/** Configuraciones variadas: lado 1 a 6, tiradas 1 a 5, tamanoMano 1 a 6 y meta variable. */
const arbConfig: fc.Arbitrary<Config> = fc
  .record({
    lado: fc.integer({ min: 1, max: 6 }),
    tiradas: fc.integer({ min: 1, max: 5 }),
    tamanoMano: fc.integer({ min: 1, max: 6 }),
    meta: fc.integer({ min: 1, max: 4000 }),
  })
  .map((r) => ({ ...CONFIG_INICIAL, ...r }));

const arbSemilla = fc.integer({ min: 0, max: 0xffffffff });

/** Llama a `elegir` sobre el mismo estado `n` veces, avanzando el flujo, y devuelve las acciones. */
function elecciones(estado: Estado, n: number, flujo: EstadoFlujo = derivarFlujo(5, 'mazo')): Accion[] {
  const acciones = accionesLegales(estado);
  const salida: Accion[] = [];
  let azar = flujo;
  for (let i = 0; i < n; i++) {
    const [accion, siguiente] = BOT_ALEATORIO.elegir(estado, acciones, azar);
    salida.push(accion);
    azar = siguiente;
  }
  return salida;
}

function celda(accion: Accion | undefined): string {
  return accion?.tipo === 'Colocar' ? `${accion.x},${accion.y}` : String(accion?.tipo);
}

/** Coloca todos los granos de la mano en (0, 0). */
function todoColocado(estado: Estado): Estado {
  return estado.mano.reduce((e, _, indiceMano) => {
    const paso = aplicar(e, { tipo: 'Colocar', indiceMano, x: 0, y: 0 });
    if (!paso.ok) throw new Error('colocación rechazada');
    return paso.valor.estado;
  }, estado);
}

describe('registro de bots', () => {
  it('aleatorio y borde están en BOTS con su nombre', () => {
    expect(BOTS['aleatorio']).toBe(BOT_ALEATORIO);
    expect(BOTS['borde']).toBe(BOT_BORDE);
    expect(Object.entries(BOTS).every(([nombre, bot]) => bot.nombre === nombre)).toBe(true);
  });
});

describe.each([BOT_ALEATORIO, BOT_BORDE])('bot $nombre', (bot) => {
  it('juega 500 rondas con configuraciones variadas sin acciones ilegales', () => {
    fc.assert(
      fc.property(arbConfig, arbSemilla, (config, semilla) => {
        const registro = simularRonda(config, semilla, bot);
        expect(['ganada', 'perdida']).toContain(registro.fase);
      }),
      { numRuns: 500 },
    );
  });

  it('es determinista: la misma semilla da el mismo registro y el mismo archivo', () => {
    expect(simularRonda(CONFIG_INICIAL, 99, bot)).toEqual(simularRonda(CONFIG_INICIAL, 99, bot));
    const archivos = ['a', 'b'].map((sufijo) => join(temporal, `${bot.nombre}-${sufijo}.jsonl`));
    for (const salida of archivos) {
      simularLote({ config: CONFIG_INICIAL, bot, semillaInicial: 40, desde: 0, rondas: 100, salida });
    }
    const [a, b] = archivos.map((archivo) => readFileSync(archivo));
    expect(a !== undefined && b !== undefined && a.equals(b)).toBe(true);
  });

  it('nunca deshace y confirma cuando todos los granos están colocados', () => {
    const colocado = todoColocado(estadoDePrueba(3));
    expect(accionesLegales(colocado)).toEqual([{ tipo: 'Deshacer' }, { tipo: 'Confirmar' }]);
    const flujo = derivarFlujo(3, 'siembra');
    expect(bot.elegir(colocado, accionesLegales(colocado), flujo)).toEqual([{ tipo: 'Confirmar' }, flujo]);
    const { acciones } = jugarConBot(CONFIG_INICIAL, 8, bot);
    expect(acciones.some((a) => a.tipo === 'Deshacer')).toBe(false);
  });
});

describe('bot aleatorio', () => {
  it('elige la celda con distribución uniforme en lado 3 (chi-cuadrado < 26,124, nivel 0,001)', () => {
    const estado = estadoDePrueba(3);
    const cuentas = new Map<string, number>();
    for (const accion of elecciones(estado, 20_000)) {
      expect(accion).toMatchObject({ tipo: 'Colocar', indiceMano: 0 });
      cuentas.set(celda(accion), (cuentas.get(celda(accion)) ?? 0) + 1);
    }
    expect(cuentas.size).toBe(9);
    const esperado = 20_000 / 9;
    const chi = [...cuentas.values()].reduce((t, c) => t + (c - esperado) ** 2 / esperado, 0);
    expect(chi).toBeLessThan(26.124);
  });

  it.each([1, 2, 3, 4, 5])('en lado %i aparecen todas las celdas', (lado) => {
    const vistas = new Set(elecciones(estadoDePrueba(lado), 60 * lado * lado).map(celda));
    expect(vistas.size).toBe(lado * lado);
  });

  it('flujos distintos dan elecciones distintas y el flujo avanza', () => {
    const estado = estadoDePrueba(4);
    const acciones = accionesLegales(estado);
    const resultados = Array.from({ length: 50 }, (_, s) => BOT_ALEATORIO.elegir(estado, acciones, derivarFlujo(s, 'mazo')));
    expect(new Set(resultados.map(([accion]) => celda(accion))).size).toBeGreaterThan(1);
    for (const [s, [, siguiente]] of resultados.entries()) expect(siguiente).not.toEqual(derivarFlujo(s, 'mazo'));
  });
});

describe('bot borde', () => {
  const elegirBorde = (estado: Estado, flujo: EstadoFlujo = derivarFlujo(1, 'mazo')) =>
    BOT_BORDE.elegir(estado, accionesLegales(estado), flujo);
  const colocaEn = (estado: Estado) => {
    const [accion] = elegirBorde(estado);
    return celda(accion);
  };

  it('elige la celda del perímetro con más granos aunque el centro tenga más', () => {
    expect(
      colocaEn(
        estadoDePrueba(3, {
          celdas: [
            [0, 0, 0],
            [0, 3, 2],
            [1, 0, 0],
          ],
        }),
      ),
    ).toBe('2,1');
  });

  it('en empate entre esquina y borde elige la esquina, aunque el borde vaya antes por filas', () => {
    expect(
      colocaEn(
        estadoDePrueba(3, {
          celdas: [
            [0, 2, 0],
            [0, 0, 0],
            [0, 0, 2],
          ],
        }),
      ),
    ).toBe('2,2');
  });

  it('en empate dentro de la misma categoría elige la primera por filas', () => {
    expect(
      colocaEn(
        estadoDePrueba(3, {
          celdas: [
            [0, 0, 1],
            [0, 3, 0],
            [1, 0, 0],
          ],
        }),
      ),
    ).toBe('2,0');
    expect(
      colocaEn(
        estadoDePrueba(3, {
          celdas: [
            [0, 0, 0],
            [2, 0, 2],
            [0, 0, 0],
          ],
        }),
      ),
    ).toBe('0,1');
    expect(colocaEn(estadoDePrueba(3, { celdas: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] }))).toBe('0,0');
  });

  it('no consume el flujo', () => {
    const flujo = derivarFlujo(77, 'siembra');
    expect(elegirBorde(estadoDePrueba(4), flujo)[1]).toBe(flujo);
  });

  it('funciona en lados 1 y 2, donde todas las celdas son perímetro', () => {
    expect(colocaEn(estadoDePrueba(1, { celdas: [[2]] }))).toBe('0,0');
    expect(colocaEn(estadoDePrueba(2, { celdas: [[0, 0], [0, 0]] }))).toBe('0,0');
    expect(colocaEn(estadoDePrueba(2, { celdas: [[1, 0], [0, 3]] }))).toBe('1,1');
    expect(colocaEn(estadoDePrueba(2, { celdas: [[0, 2], [2, 0]] }))).toBe('1,0');
  });

  it('los estados de prueba son válidos', () => {
    expect(validarEstado(estadoDePrueba(3, { celdas: [[0, 0, 0], [0, 3, 2], [1, 0, 0]] })).ok).toBe(true);
  });

  it('en rondas completas con lados 1 a 8 toda colocación está en el perímetro', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8 }), arbSemilla, (lado, semilla) => {
        const { acciones } = jugarConBot({ ...CONFIG_INICIAL, lado }, semilla, BOT_BORDE);
        for (const a of acciones) {
          if (a.tipo === 'Colocar') {
            expect(a.x === 0 || a.y === 0 || a.x === lado - 1 || a.y === lado - 1, JSON.stringify(a)).toBe(true);
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe('comparación', () => {
  it('con 300 semillas los registros de aleatorio y borde no son idénticos', () => {
    const registros = (bot: typeof BOT_ALEATORIO) =>
      Array.from({ length: 300 }, (_, semilla) => simularRonda(CONFIG_INICIAL, semilla, bot));
    expect(registros(BOT_ALEATORIO)).not.toEqual(registros(BOT_BORDE));
  });
});
