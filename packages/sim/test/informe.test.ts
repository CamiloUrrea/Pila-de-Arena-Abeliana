import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CONFIG_INICIAL } from '@pila/core';
import type { Config } from '@pila/core';
import { Recuento, resumir, wilson } from '../src/estadistica.ts';
import { UMBRALES_ALARMA, analizar, principal, renderizar } from '../src/informe.ts';
import type { Analisis } from '../src/informe.ts';
import { principal as simular } from '../src/simular.ts';

const temporal = mkdtempSync(join(tmpdir(), 'pila-informe-'));
afterAll(() => rmSync(temporal, { recursive: true, force: true }));

type RondaEscrita = {
  readonly semilla: number;
  readonly ganada?: boolean;
  readonly puntos?: number;
  /** Pares [oleadas, derrumbes] de cada tirada. */
  readonly tiradas?: readonly (readonly [number, number])[];
};

let contador = 0;

/** Escribe a mano un archivo JSONL con el formato del simulador y devuelve su ruta. */
function archivo(bot: string, rondas: readonly RondaEscrita[], config: Partial<Config> = {}): string {
  const ruta = join(temporal, `${contador++}-${bot}.jsonl`);
  const lineas = [
    JSON.stringify({ tipo: 'cabecera', formato: 1, bot, config: { ...CONFIG_INICIAL, ...config }, semillaInicial: 0, desde: 0, rondas: rondas.length }),
    ...rondas.map((r, indice) => {
      const tiradas = r.tiradas ?? [[1, 1]];
      return JSON.stringify({
        tipo: 'ronda',
        indice,
        semilla: r.semilla,
        fase: r.ganada === true ? 'ganada' : 'perdida',
        puntos: r.puntos ?? 100,
        tiradas: tiradas.length,
        porTirada: tiradas.map(([oleadas, derrumbes]) => ({ oleadas, derrumbes, granosFuera: 0, puntosGanados: 0 })),
      });
    }),
  ];
  writeFileSync(ruta, `${lineas.join('\n')}\n`);
  return ruta;
}

/** `n` rondas con semillas 0..n−1, de las que ganan las `ganadas` primeras. */
function rondas(n: number, ganadas: number, extra: Omit<RondaEscrita, 'semilla' | 'ganada'> = {}): RondaEscrita[] {
  return Array.from({ length: n }, (_, semilla) => ({ semilla, ganada: semilla < ganadas, ...extra }));
}

const codigos = (a: Analisis, codigo: string): number => a.alarmas.filter((x) => x.codigo === codigo).length;

async function informe(...argv: string[]): Promise<{ codigo: number; texto: string; errores: string[] }> {
  let texto = '';
  const errores: string[] = [];
  const codigo = await principal(argv, { escribir: (t) => (texto += t), error: (l) => errores.push(l) });
  return { codigo, texto, errores };
}

describe('estadística', () => {
  it('Wilson: 7 de 10 da [0,3968; 0,8922]', () => {
    const { inferior, superior } = wilson(7, 10);
    expect(Math.abs(inferior - 0.3968)).toBeLessThan(0.001);
    expect(Math.abs(superior - 0.8922)).toBeLessThan(0.001);
  });

  it('desviación muestral: [1000, 2000, 3000] da media 2000 y desviación 1000', () => {
    const r = resumir([1000, 2000, 3000]);
    expect(r.media).toBe(2000);
    expect(r.desviacion).toBeCloseTo(1000, 9);
    expect(resumir([5]).desviacion).toBeUndefined();
  });

  it('recuento por tamaño: mediana, percentil 90 por rango más cercano, histograma y parte de los mayores', () => {
    const r = new Recuento();
    for (const t of [1, 1, 2, 2, 10]) r.agregar(t);
    expect(r.percentil(0.5)).toBe(2);
    expect(r.percentil(0.9)).toBe(10);
    expect(r.histograma()).toEqual([80, 0, 20, 0, 0]);
    expect(r.parteDeLosMayores(0.1)).toBeCloseTo(10 / 16, 12);
    expect(r.resumen().media).toBeCloseTo(3.2, 12);
  });
});

describe('ventaja del cargador sobre el borde', () => {
  const victoriasCargador = [true, true, false, true];
  const victoriasBorde = [true, false, false, false];

  it('por pares de semilla: media 0,5, intervalo [−0,0658; 1,0658] y alarma (b)', async () => {
    const a = await analizar([
      archivo('cargador', victoriasCargador.map((ganada, semilla) => ({ semilla, ganada }))),
      archivo('borde', victoriasBorde.map((ganada, semilla) => ({ semilla, ganada }))),
    ]);
    const [v] = a.ventajas;
    expect(v?.diferencia.n).toBe(4);
    expect(v?.diferencia.media).toBeCloseTo(0.5, 12);
    expect(v?.diferencia.intervalo?.inferior).toBeCloseTo(-0.0658, 4);
    expect(v?.diferencia.intervalo?.superior).toBeCloseTo(1.0658, 4);
    expect(codigos(a, 'b')).toBe(1);
  });

  it('empareja por semilla, no por posición, y usa la intersección', async () => {
    const cargador = [3, 2, 1, 0].map((semilla) => ({ semilla, ganada: victoriasCargador[semilla] === true }));
    const borde = [1, 0, 3, 2].map((semilla) => ({ semilla, ganada: victoriasBorde[semilla] === true }));
    const a = await analizar([
      archivo('cargador', [...cargador, { semilla: 50, ganada: true }, { semilla: 51, ganada: true }]),
      archivo('borde', [{ semilla: 60, ganada: false }, ...borde]),
    ]);
    const [v] = a.ventajas;
    expect([v?.diferencia.n, v?.semillasCargador, v?.semillasBorde]).toEqual([4, 6, 5]);
    expect(v?.diferencia.media).toBeCloseTo(0.5, 12);
    expect(v?.diferencia.intervalo?.inferior).toBeCloseTo(-0.0658, 4);
    expect(renderizar(a)).toContain('4 (intersección; cargador 6, borde 5)');
  });
});

describe('alarmas', () => {
  it('(c) puntos [0, 0, 0, 4000]: media 1000, desviación 2000 y alarma; [1000, 2000, 3000] no', async () => {
    const dispersos = await analizar([archivo('avaro', [0, 0, 0, 4000].map((puntos, semilla) => ({ semilla, puntos })))]);
    expect(dispersos.grupos[0]?.puntos.media).toBe(1000);
    expect(dispersos.grupos[0]?.puntos.desviacion).toBeCloseTo(2000, 9);
    expect(codigos(dispersos, 'c')).toBe(1);
    const juntos = await analizar([archivo('avaro', [1000, 2000, 3000].map((puntos, semilla) => ({ semilla, puntos })))]);
    expect(juntos.grupos[0]?.puntos.desviacion).toBeCloseTo(1000, 9);
    expect(codigos(juntos, 'c')).toBe(0);
  });

  it('(d) avalanchas: [1, 1, 2, 2, 10] da sus métricas sin alarma; todas de 4 derrumbes, alarma', async () => {
    const variadas = await analizar([
      archivo('avaro', [
        { semilla: 0, tiradas: [[1, 1], [1, 1], [0, 0]] },
        { semilla: 1, tiradas: [[1, 2], [2, 2], [5, 10]] },
      ]),
    ]);
    const v = variadas.grupos[0]?.avalanchas;
    expect([v?.tiradas, v?.numero, v?.mediana, v?.percentil90, v?.maximo]).toEqual([6, 5, 2, 10, 10]);
    expect(v?.sinDerrumbes).toBeCloseTo(1 / 6, 12);
    expect(v?.histograma).toEqual([80, 0, 20, 0, 0]);
    expect(v?.parteDelDiezPorCiento).toBeCloseTo(0.625, 12);
    expect(codigos(variadas, 'd')).toBe(0);
    const iguales = await analizar([archivo('avaro', rondas(5, 0, { tiradas: [[2, 4], [1, 4]] }))]);
    expect(codigos(iguales, 'd')).toBe(1);
  });

  it('(e) con topeOleadas 100: 50 oleadas activan la alarma y 49 no (límite exacto)', async () => {
    const tope = { topeOleadas: 100 };
    expect(UMBRALES_ALARMA.fraccionTopeOleadas).toBe(0.5);
    const cincuenta = await analizar([archivo('avaro', [{ semilla: 0, tiradas: [[50, 60]] }, { semilla: 1, tiradas: [[3, 4]] }], tope)]);
    expect(cincuenta.grupos[0]?.oleadasMaximas).toBe(50);
    expect(codigos(cincuenta, 'e')).toBe(1);
    const cuarentaNueve = await analizar([archivo('avaro', [{ semilla: 0, tiradas: [[49, 60]] }, { semilla: 1, tiradas: [[3, 4]] }], tope)]);
    expect(codigos(cuarentaNueve, 'e')).toBe(0);
  });

  it.each<[string, number, number]>([
    ['95 %', 19, 1],
    ['5 %', 1, 1],
    ['50 %', 10, 0],
  ])('(a) el aleatorio con %s de victorias', async (_, ganadas, alarmas) => {
    const a = await analizar([archivo('aleatorio', rondas(20, ganadas))]);
    expect(codigos(a, 'a')).toBe(alarmas);
  });

  it('(a) solo se aplica al bot aleatorio', async () => {
    expect(codigos(await analizar([archivo('avaro', rondas(20, 20))]), 'a')).toBe(0);
  });
});

describe('agrupación y tabla cruzada', () => {
  it('dos metas de un bot y otro bot dan la tabla cruzada con sus porcentajes', async () => {
    const a = await analizar([
      archivo('avaro', rondas(4, 2), { meta: 2000 }),
      archivo('avaro', rondas(4, 1), { meta: 3000 }),
      archivo('borde', rondas(4, 4), { meta: 2000 }),
    ]);
    expect(a.configuraciones).toEqual([
      'meta=2000, lado=3, tiradas=5, tamanoMano=5, multiplicadorPorOleada=10',
      'meta=3000, lado=3, tiradas=5, tamanoMano=5, multiplicadorPorOleada=10',
    ]);
    const texto = renderizar(a);
    expect(texto).toContain('| avaro | 50,00 % | 25,00 % |');
    expect(texto).toContain('| borde | 100,00 % | — |');
  });

  it('con una sola configuración no hay tabla cruzada', async () => {
    const a = await analizar([archivo('avaro', rondas(4, 2)), archivo('borde', rondas(4, 1))]);
    expect(renderizar(a)).not.toContain('Porcentaje de victorias por bot (filas)');
  });

  it('una semilla repetida en el mismo grupo es un error', async () => {
    const r = await informe(archivo('avaro', rondas(3, 1)), archivo('avaro', rondas(3, 1)));
    expect(r.codigo).toBe(2);
    expect(r.errores.join('\n')).toContain('la semilla 0 ya apareció');
  });
});

describe('de punta a punta con el simulador', () => {
  it('las victorias coinciden con el resumen del simulador y están todas las secciones', async () => {
    const rutas: string[] = [];
    const ganadas = new Map<string, string>();
    for (const bot of ['ciclico', 'aleatorio']) {
      const salida = join(temporal, `e2e-${bot}.jsonl`);
      const lineas: string[] = [];
      const codigo = simular(['--bot', bot, '--rondas', '200', '--set', 'meta=3000', '--salida', salida], {
        escribir: (l) => lineas.push(l),
        error: () => {},
      });
      expect(codigo).toBe(0);
      ganadas.set(bot, lineas.find((l) => l.startsWith('ganadas: '))?.slice('ganadas: '.length) ?? '');
      rutas.push(salida);
    }
    const r = await informe(...rutas);
    expect(r.codigo).toBe(0);
    for (const [bot, n] of ganadas) expect(r.texto).toMatch(new RegExp(`\\| ${bot} \\| [^|]+ \\| 200 \\| ${n} \\|`));
    for (const seccion of ['Resumen', 'Victorias', 'Ventaja del cargador sobre el borde', 'Puntos de desborde por ronda', 'Avalanchas', 'Oleadas máximas', 'Bonus', 'Alarmas']) {
      expect(r.texto).toContain(`## ${seccion}`);
    }
    expect(r.texto).toContain('No disponible hasta H5.');
    expect(r.texto).not.toContain(temporal);
  });
});

describe('línea de comandos', () => {
  it('es determinista y no modifica los archivos de entrada; --salida escribe el mismo texto', async () => {
    const entradas = [archivo('cargador', rondas(6, 3)), archivo('borde', rondas(6, 2))];
    const antes = entradas.map((e) => readFileSync(e, 'utf8'));
    const destino = join(temporal, 'informes', 'informe.md');
    const a = await informe(...entradas, '--salida', destino);
    const b = await informe('--', ...entradas);
    expect(a.texto).toBe(b.texto);
    expect(readFileSync(destino, 'utf8')).toBe(a.texto);
    expect(entradas.map((e) => readFileSync(e, 'utf8'))).toEqual(antes);
  });

  it.each<[string, () => string, string]>([
    ['un archivo inexistente', () => join(temporal, 'no-existe.jsonl'), 'no se puede leer'],
    ['un archivo vacío', () => escribir('vacio', ''), 'falta la cabecera'],
    ['un archivo sin cabecera', () => escribir('sin-cabecera', '{"tipo":"ronda","semilla":1}\n'), 'la primera línea debe ser la cabecera'],
    ['un formato 2', () => escribir('formato-2', '{"tipo":"cabecera","formato":2,"bot":"x","config":{}}\n'), 'formato desconocido 2'],
    ['una línea rota', () => escribir('rota', `${readFileSync(archivo('avaro', rondas(2, 1)), 'utf8')}{"tipo":"ronda",\n`), 'línea 4: no es JSON válido'],
    ['una ronda mal formada', () => escribir('mal', `${readFileSync(archivo('avaro', rondas(1, 1)), 'utf8')}{"tipo":"ronda","semilla":"x"}\n`), 'línea 3'],
  ])('%s da código 2 con un mensaje claro', async (_, crear, mensaje) => {
    const r = await informe(crear());
    expect(r.codigo).toBe(2);
    expect(r.errores.join('\n')).toContain(mensaje);
  });

  it('sin archivos o con una opción desconocida da código 2', async () => {
    expect((await informe()).codigo).toBe(2);
    expect((await informe(archivo('avaro', rondas(2, 1)), '--rapido')).codigo).toBe(2);
  });

  it('--estricto da código 1 con alguna alarma y 0 sin ninguna', async () => {
    const conAlarma = archivo('aleatorio', rondas(10, 10));
    expect((await informe(conAlarma, '--estricto')).codigo).toBe(1);
    expect((await informe(conAlarma)).codigo).toBe(0);
    const sinAlarma = archivo('avaro', [
      { semilla: 0, puntos: 900, tiradas: [[1, 1], [2, 5]] },
      { semilla: 1, puntos: 1100, tiradas: [[3, 9], [1, 2]] },
    ]);
    const r = await informe(sinAlarma, '--estricto');
    expect(r.texto).toContain('## Alarmas\n\nNinguna.');
    expect(r.codigo).toBe(0);
  });
});

function escribir(nombre: string, contenido: string): string {
  const ruta = join(temporal, `${contador++}-${nombre}.jsonl`);
  writeFileSync(ruta, contenido);
  return ruta;
}
