import { describe, expect, it } from 'vitest';
import { CLAVE_REGISTRO, MAXIMO_REGISTROS, guardarRegistros, leerRegistros } from '../src/almacenamiento.ts';
import type { Almacen } from '../src/almacenamiento.ts';
import type { RegistroRonda } from '../src/registro.ts';

/** Almacén falso en memoria, como `localStorage`. */
function almacenFalso(inicial: Record<string, string> = {}): Almacen & { datos: Record<string, string> } {
  const datos = { ...inicial };
  return {
    datos,
    getItem: (k) => datos[k] ?? null,
    setItem: (k, v) => {
      datos[k] = v;
    },
  };
}

const roto: Almacen = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

function registro(indice: number, jugador: string | null = null): RegistroRonda {
  return {
    version: 1,
    sesion: 'abcd1234',
    jugador,
    indice,
    semilla: indice * 7,
    lado: 3,
    resultado: indice % 2 === 0 ? 'ganada' : 'perdida',
    puntos: indice * 100,
    meta: 5000,
    tiradasUsadas: 5,
    tiradasTotales: 5,
    oleadasMax: 3,
    avalanchaMax: 8,
    deshacer: 1,
    duracionMs: 61_250,
    pidioOtra: indice % 3 === 0,
    fecha: '2026-10-06T12:00:00.000Z',
  };
}

describe('almacenamiento del registro', () => {
  it('ida y vuelta de varios registros, bajo la clave con el prefijo del proyecto', () => {
    const almacen = almacenFalso();
    const registros = [registro(1, 'Ana'), registro(2, 'José, "el de, las comas"'), registro(3)];
    expect(guardarRegistros(almacen, registros)).toEqual({ ok: true, valor: registros });
    expect(CLAVE_REGISTRO).toMatch(/^pila-arena-abeliana:/);
    expect(Object.keys(almacen.datos)).toEqual([CLAVE_REGISTRO]);
    expect(JSON.parse(almacen.datos[CLAVE_REGISTRO] ?? '')).toEqual({ version: 1, registros });
    expect(leerRegistros(almacen)).toEqual({ ok: true, valor: registros });
  });

  it('sin nada guardado devuelve una lista vacía', () => {
    expect(leerRegistros(almacenFalso())).toEqual({ ok: true, valor: [] });
  });

  it.each<[string, string, string]>([
    ['JSON roto', '{"version":1,"registros":[', 'RegistroIlegible'],
    ['texto que no es JSON', 'hola', 'RegistroIlegible'],
    ['versión desconocida', '{"version":2,"registros":[]}', 'VersionDesconocida'],
    ['sin versión', '{"registros":[]}', 'EstructuraInvalida'],
    ['registros que no son una lista', '{"version":1,"registros":{}}', 'EstructuraInvalida'],
    ['un número', '42', 'EstructuraInvalida'],
    ['null', 'null', 'EstructuraInvalida'],
  ])('%s da un error tipado sin lanzar', (_, texto, tipo) => {
    const almacen = almacenFalso({ [CLAVE_REGISTRO]: texto });
    let r: ReturnType<typeof leerRegistros> | undefined;
    expect(() => {
      r = leerRegistros(almacen);
    }).not.toThrow();
    expect(r?.ok).toBe(false);
    if (r !== undefined && !r.ok) expect(r.error.tipo).toBe(tipo);
  });

  it('un almacén que lanza da AlmacenNoDisponible al leer y al guardar, sin lanzar', () => {
    expect(() => leerRegistros(roto)).not.toThrow();
    expect(() => guardarRegistros(roto, [registro(1)])).not.toThrow();
    expect(leerRegistros(roto)).toEqual({ ok: false, error: { tipo: 'AlmacenNoDisponible', detalle: 'SecurityError' } });
    expect(guardarRegistros(roto, [registro(1)])).toEqual({ ok: false, error: { tipo: 'AlmacenNoDisponible', detalle: 'QuotaExceededError' } });
  });

  it('los registros mal formados se descartan y los buenos se conservan', () => {
    const buenos = [registro(1), registro(2)];
    const sinFecha: Record<string, unknown> = { ...registro(9) };
    delete sinFecha['fecha'];
    const malos = [
      null,
      42,
      'texto',
      { ...registro(9), version: 2 },
      { ...registro(9), resultado: 'empate' },
      { ...registro(9), puntos: '100' },
      { ...registro(9), indice: 0 },
      { ...registro(9), pidioOtra: 'sí' },
      sinFecha,
    ];
    const almacen = almacenFalso({ [CLAVE_REGISTRO]: JSON.stringify({ version: 1, registros: [malos[0], buenos[0], ...malos.slice(1), buenos[1]] }) });
    expect(leerRegistros(almacen)).toEqual({ ok: true, valor: buenos });
  });

  it(`conserva solo los ${MAXIMO_REGISTROS} más recientes, en orden`, () => {
    expect(MAXIMO_REGISTROS).toBe(2000);
    const almacen = almacenFalso();
    const muchos = Array.from({ length: 2005 }, (_, i) => registro(i + 1));
    const guardados = guardarRegistros(almacen, muchos);
    expect(guardados.ok && guardados.valor).toHaveLength(2000);
    const leidos = leerRegistros(almacen);
    if (!leidos.ok) throw new Error('lectura rechazada');
    expect(leidos.valor).toHaveLength(2000);
    expect(leidos.valor[0]?.indice).toBe(6);
    expect(leidos.valor.at(-1)?.indice).toBe(2005);
    expect(leidos.valor.map((r) => r.indice)).toEqual(muchos.slice(5).map((r) => r.indice));
  });
});
