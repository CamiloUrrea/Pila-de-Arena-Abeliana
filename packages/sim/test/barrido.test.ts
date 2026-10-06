import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configDeBarrido, metaObjetivo, principal, simularPotencial, victoriasConMeta } from '../src/barrido.ts';
import { BOTS } from '../src/bots/index.ts';
import { semillaDeRonda, simularRonda } from '../src/simulacion.ts';

const temporal = mkdtempSync(join(tmpdir(), 'pila-barrido-'));
afterAll(() => rmSync(temporal, { recursive: true, force: true }));

function barrido(...argv: string[]): { codigo: number; texto: string; errores: string[] } {
  let texto = '';
  const errores: string[] = [];
  const codigo = principal(argv, { escribir: (t) => (texto += t), error: (l) => errores.push(l) });
  return { codigo, texto, errores };
}

describe('equivalencia: victorias derivadas del potencial = victorias simuladas con la meta', () => {
  const RONDAS = 300;
  const SEMILLA = 1;
  const casos = Object.keys(BOTS).flatMap((bot) => [3, 4].flatMap((lado) => [10, 50].map((m) => [bot, lado, m] as const)));

  it.each(casos)('%s, lado %i, multiplicador %i', (nombre, lado, multiplicador) => {
    const bot = BOTS[nombre];
    if (bot === undefined) throw new Error(nombre);
    const config = configDeBarrido(lado, multiplicador);
    const potencial = simularPotencial(config, bot, SEMILLA, RONDAS);
    const ordenados = [...potencial.porSemilla.values()].sort((a, b) => a - b);
    // Mínimo, primer cuartil, mediana, tercer cuartil y máximo; la meta debe ser al menos 1.
    const metas = [0, 0.25, 0.5, 0.75, 1].map((q) => Math.max(1, ordenados[Math.min(RONDAS - 1, Math.floor(q * RONDAS))] ?? 1));
    for (const meta of metas) {
      const derivadas = victoriasConMeta(potencial.porSemilla, meta);
      const simuladas = new Map<number, boolean>();
      for (let i = 0; i < RONDAS; i++) {
        const r = simularRonda({ ...config, meta }, semillaDeRonda(SEMILLA, i), bot);
        simuladas.set(r.semilla, r.fase === 'ganada');
      }
      expect(derivadas).toEqual(simuladas);
    }
  });
});

describe('meta objetivo', () => {
  const potenciales = [3000, 1000, 5000, 2000, 4000];

  it.each<[number, number]>([
    [0.6, 3000],
    [0.5, 3000],
    [1.0, 1000],
    [0.2, 5000],
  ])('objetivo %d da meta %i', (objetivo, meta) => {
    expect(metaObjetivo(potenciales, objetivo)).toBe(meta);
  });

  it('es exacta con objetivos decimales: 0,7 de 20000 es la posición 14000', () => {
    const valores = Array.from({ length: 20000 }, (_, i) => i + 1);
    expect(metaObjetivo(valores, 0.7)).toBe(20000 - 14000 + 1);
  });

  it('propiedad: con la meta la tasa es ≥ objetivo y con la meta + 1 es < objetivo', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 5000 }), { minLength: 1, maxLength: 200 }),
        fc.integer({ min: 1, max: 100 }).map((k) => k / 100),
        (valores, objetivo) => {
          const meta = metaObjetivo(valores, objetivo);
          const tasa = (m: number): number => valores.filter((v) => v >= m).length / valores.length;
          expect(tasa(meta)).toBeGreaterThanOrEqual(objetivo);
          expect(tasa(meta + 1)).toBeLessThan(objetivo);
        },
      ),
    );
  });
});

describe('línea de comandos del barrido', () => {
  const argumentos = ['--lados', '3', '--multiplicadores', '10,50', '--rondas', '200'];
  let primera: { codigo: number; texto: string; errores: string[] };

  beforeAll(() => {
    primera = barrido('--', ...argumentos);
  });

  it('de punta a punta con 200 rondas: código 0 y las cuatro tablas', () => {
    expect(primera.codigo).toBe(0);
    for (const titulo of ['## A) Potencial', '## B) Metas objetivo', '## C) Habilidad', '## D) Avalanchas']) {
      expect(primera.texto).toContain(titulo);
    }
    // Una fila de la tabla C por combinación y objetivo por defecto (0,7, 0,5 y 0,3).
    const filasC = primera.texto.split('\n').filter((l) => /^\| 3 \| (10|50) \| \d+,\d+ % \| [\d,]+ \| \d/.test(l));
    expect(filasC).toHaveLength(6);
  });

  it('es determinista byte a byte; --salida guarda el mismo texto', () => {
    const destino = join(temporal, 'informes', 'barrido.md');
    const segunda = barrido(...argumentos, '--salida', destino);
    expect(segunda.texto).toBe(primera.texto);
    expect(readFileSync(destino, 'utf8')).toBe(primera.texto);
  });

  it.each<[string, string[]]>([
    ['lado 0', ['--lados', '0', '--multiplicadores', '10', '--rondas', '5']],
    ['lado 9', ['--lados', '3,9', '--multiplicadores', '10', '--rondas', '5']],
    ['lado no entero', ['--lados', '3.5', '--multiplicadores', '10', '--rondas', '5']],
    ['multiplicador negativo', ['--lados', '3', '--multiplicadores', '-1', '--rondas', '5']],
    ['multiplicador no entero', ['--lados', '3', '--multiplicadores', '2.5', '--rondas', '5']],
    ['multiplicador vacío', ['--lados', '3', '--multiplicadores', '10,', '--rondas', '5']],
    ['objetivo 0', ['--lados', '3', '--multiplicadores', '10', '--rondas', '5', '--objetivos', '0']],
    ['objetivo 1', ['--lados', '3', '--multiplicadores', '10', '--rondas', '5', '--objetivos', '0.5,1']],
    ['objetivo no numérico', ['--lados', '3', '--multiplicadores', '10', '--rondas', '5', '--objetivos', 'medio']],
    ['sin --rondas', ['--lados', '3', '--multiplicadores', '10']],
    ['sin --lados', ['--multiplicadores', '10', '--rondas', '5']],
    ['una opción desconocida', ['--lados', '3', '--multiplicadores', '10', '--rondas', '5', '--rapido']],
  ])('%s da código 2 con un mensaje claro', (_, argv) => {
    const r = barrido(...argv);
    expect(r.codigo).toBe(2);
    expect(r.texto).toBe('');
    expect(r.errores.join('\n')).toMatch(/^error: /);
  });
});
