import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { principal } from '../src/simular.ts';

const temporal = mkdtempSync(join(tmpdir(), 'pila-cli-'));
afterAll(() => rmSync(temporal, { recursive: true, force: true }));

/** Ejecuta la línea de comandos en el mismo proceso y captura su salida. */
function ejecutar(...argv: string[]): { codigo: number; salida: string[]; errores: string[] } {
  const salida: string[] = [];
  const errores: string[] = [];
  const codigo = principal(argv, { escribir: (l) => salida.push(l), error: (l) => errores.push(l) });
  return { codigo, salida, errores };
}

function cabecera(archivo: string): { config: Record<string, unknown> } {
  const primera = readFileSync(archivo, 'utf8').split('\n')[0] ?? '';
  return JSON.parse(primera);
}

describe('línea de comandos: configuración', () => {
  it('--set meta=1500 aparece en la cabecera', () => {
    const archivo = join(temporal, 'meta.jsonl');
    const r = ejecutar('--bot', 'ciclico', '--rondas', '5', '--set', 'meta=1500', '--salida', archivo);
    expect(r.codigo).toBe(0);
    expect(cabecera(archivo).config['meta']).toBe(1500);
  });

  it.each<[string, string[]]>([
    ['--set tiradas=0', ['--set', 'tiradas=0']],
    ['--set lado=0', ['--set', 'lado=0']],
    ['un campo desconocido', ['--set', 'vidas=3']],
    ['un campo anidado en --set', ['--set', 'siembra=2']],
    ['un valor no numérico', ['--set', 'meta=mucho']],
    ['una asignación sin =', ['--set', 'meta']],
  ])('%s da código 2', (_, extra) => {
    const r = ejecutar('--bot', 'ciclico', '--rondas', '5', '--salida', join(temporal, 'no.jsonl'), ...extra);
    expect(r.codigo).toBe(2);
    expect(r.errores.join('\n')).toMatch(/^error: /);
  });

  it('la configuración inválida explica el campo', () => {
    const r = ejecutar('--bot', 'ciclico', '--rondas', '5', '--set', 'tiradas=0');
    expect(r.errores).toEqual(['error: configuración inválida: tiradas: debe ser al menos 1']);
  });

  it('--config con una anulación parcial se fusiona en profundidad', () => {
    const anulaciones = join(temporal, 'anulaciones.json');
    writeFileSync(anulaciones, JSON.stringify({ siembra: { max: 3 }, mazo: { explosivo: 8 } }));
    const archivo = join(temporal, 'config.jsonl');
    const r = ejecutar('--bot', 'ciclico', '--rondas', '3', '--config', anulaciones, '--salida', archivo);
    expect(r.codigo).toBe(0);
    expect(cabecera(archivo).config).toMatchObject({
      siembra: { min: 0, max: 3 },
      mazo: { normal: 20, pesado: 6, explosivo: 8 },
      meta: 5000,
    });
  });

  it.each<[string, unknown]>([
    ['un campo desconocido', { vidas: 3 }],
    ['un subcampo desconocido', { mazo: { arcilla: 1 } }],
    ['un tipo incorrecto', { meta: '1500' }],
    ['una siembra inválida para el umbral', { siembra: { max: 4 } }],
  ])('--config con %s da código 2', (_, contenido) => {
    const anulaciones = join(temporal, 'mala.json');
    writeFileSync(anulaciones, JSON.stringify(contenido));
    expect(ejecutar('--bot', 'ciclico', '--rondas', '3', '--config', anulaciones).codigo).toBe(2);
  });

  it('un bot desconocido da código 2 y lista los disponibles', () => {
    const r = ejecutar('--bot', 'genio', '--rondas', '5');
    expect(r.codigo).toBe(2);
    expect(r.errores.join('\n')).toContain('disponibles: ciclico');
  });

  it.each<[string, string[]]>([
    ['sin --bot', ['--rondas', '5']],
    ['sin --rondas', ['--bot', 'ciclico']],
    ['--rondas 0', ['--bot', 'ciclico', '--rondas', '0']],
    ['--semilla negativa', ['--bot', 'ciclico', '--rondas', '5', '--semilla', '-1']],
    ['una opción desconocida', ['--bot', 'ciclico', '--rondas', '5', '--rapido']],
  ])('%s da código 2', (_, argv) => {
    expect(ejecutar(...argv).codigo).toBe(2);
  });
});

describe('línea de comandos de punta a punta', () => {
  it('el script termina con código 0, informa por pantalla y escribe rondas + 1 líneas', () => {
    const archivo = join(temporal, 'e2e.jsonl');
    const proceso = spawnSync(
      process.execPath,
      ['src/simular.ts', '--', '--bot', 'ciclico', '--rondas', '40', '--semilla', '3', '--salida', archivo],
      { cwd: join(import.meta.dirname, '..'), encoding: 'utf8' },
    );
    expect(proceso.status, proceso.stderr).toBe(0);
    for (const etiqueta of ['bot: ciclico', 'rondas: 40', 'ganadas:', 'perdidas:', 'ganadas (%):', 'tiempo:', 'rondas por segundo:']) {
      expect(proceso.stdout).toContain(etiqueta);
    }
    expect(proceso.stdout).toContain(`archivo: ${archivo}`);
    expect(readFileSync(archivo, 'utf8').split('\n').filter((l) => l !== '')).toHaveLength(41);
  });
});
