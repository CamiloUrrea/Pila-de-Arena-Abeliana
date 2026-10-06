import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { COLUMNAS, aCsv, copiarAlPortapapeles } from '../src/exportacion.ts';
import type { RegistroRonda } from '../src/registro.ts';

function registro(indice: number, jugador: string | null): RegistroRonda {
  return {
    version: 1,
    sesion: '0a1b2c3d',
    jugador,
    indice,
    semilla: 4294967295 - indice,
    lado: 3,
    resultado: indice === 2 ? 'perdida' : 'ganada',
    puntos: 523450 + indice,
    meta: 5000,
    tiradasUsadas: 4,
    tiradasTotales: 5,
    oleadasMax: 7,
    avalanchaMax: 21,
    deshacer: 2,
    duracionMs: 1234567.5,
    pidioOtra: indice !== 2,
    fecha: '2026-10-06T12:00:00.000Z',
  };
}

/**
 * Analizador de CSV sencillo (RFC 4180), escrito aparte de la exportación: campos entre comillas con comillas dobladas
 * dentro, comas y saltos de línea dentro de un campo entrecomillado, y filas separadas por CRLF.
 */
function analizarCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') entreComillas = false;
      else campo += c;
    } else if (c === '"') entreComillas = true;
    else if (c === ',') {
      fila.push(campo);
      campo = '';
    } else if (c === '\r' && texto[i + 1] === '\n') {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
      i++;
    } else campo += c;
  }
  if (campo !== '' || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

describe('aCsv', () => {
  it('cabecera con las columnas en el orden del tipo y una fila por registro', () => {
    const filas = analizarCsv(aCsv([registro(1, 'Ana'), registro(2, null), registro(3, 'José')]));
    expect(filas[0]).toEqual([
      'version',
      'sesion',
      'jugador',
      'indice',
      'semilla',
      'lado',
      'resultado',
      'puntos',
      'meta',
      'tiradasUsadas',
      'tiradasTotales',
      'oleadasMax',
      'avalanchaMax',
      'deshacer',
      'duracionMs',
      'pidioOtra',
      'fecha',
    ]);
    expect(filas).toHaveLength(4);
    expect(Object.keys(registro(1, null))).toEqual(COLUMNAS);
  });

  it('números sin formato regional, booleanos como true y false, y null como campo vacío', () => {
    const [, ana, nadie] = analizarCsv(aCsv([registro(1, 'Ana'), registro(2, null)]));
    expect(ana).toEqual([
      '1',
      '0a1b2c3d',
      'Ana',
      '1',
      '4294967294',
      '3',
      'ganada',
      '523451',
      '5000',
      '4',
      '5',
      '7',
      '21',
      '2',
      '1234567.5',
      'true',
      '2026-10-06T12:00:00.000Z',
    ]);
    expect(nadie?.[2]).toBe('');
    expect(nadie?.[15]).toBe('false');
  });

  it('escapa comas, comillas y saltos de línea en el nombre del jugador', () => {
    const csv = aCsv([registro(1, 'Pérez, Ana'), registro(2, 'el "rápido"'), registro(3, 'dos\nlíneas'), registro(4, 'a,"b"\r\nc')]);
    expect(csv).toContain('"Pérez, Ana"');
    expect(csv).toContain('"el ""rápido"""');
    const filas = analizarCsv(csv);
    expect(filas).toHaveLength(5);
    expect(filas.slice(1).map((f) => f[2])).toEqual(['Pérez, Ana', 'el "rápido"', 'dos\nlíneas', 'a,"b"\r\nc']);
    for (const f of filas) expect(f).toHaveLength(COLUMNAS.length);
  });

  it('propiedad: cualquier nombre de jugador sobrevive a la ida y vuelta', () => {
    fc.assert(
      fc.property(fc.array(fc.option(fc.string({ maxLength: 30 }), { nil: null }), { minLength: 1, maxLength: 8 }), (nombres) => {
        const filas = analizarCsv(aCsv(nombres.map((n, i) => registro(i + 1, n))));
        expect(filas).toHaveLength(nombres.length + 1);
        expect(filas.slice(1).map((f) => f[2])).toEqual(nombres.map((n) => n ?? ''));
      }),
    );
  });

  it('una lista vacía da solo la cabecera', () => {
    expect(aCsv([])).toBe(`${COLUMNAS.join(',')}\r\n`);
  });
});

describe('copiarAlPortapapeles', () => {
  it('con un portapapeles que acepta, copia el texto', async () => {
    let copiado = '';
    const navegador = { clipboard: { writeText: async (t: string) => void (copiado = t) } };
    expect(await copiarAlPortapapeles('a,b', navegador)).toEqual({ ok: true, valor: undefined });
    expect(copiado).toBe('a,b');
  });

  it('con un portapapeles que rechaza, da CopiaFallida sin lanzar', async () => {
    const navegador = { clipboard: { writeText: () => Promise.reject(new Error('NotAllowedError')) } };
    expect(await copiarAlPortapapeles('x', navegador)).toEqual({ ok: false, error: { tipo: 'CopiaFallida', detalle: 'NotAllowedError' } });
  });

  it('sin portapapeles, o sin navegador, da SinPortapapeles', async () => {
    expect(await copiarAlPortapapeles('x', {})).toEqual({ ok: false, error: { tipo: 'SinPortapapeles' } });
    expect(await copiarAlPortapapeles('x', undefined)).toEqual({ ok: false, error: { tipo: 'SinPortapapeles' } });
  });
});
