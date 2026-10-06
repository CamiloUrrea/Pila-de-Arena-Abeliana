import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { LADO_POR_DEFECTO, leerParametros } from '../src/parametros.ts';

const SEMILLA_INYECTADA = 777;
const generar = (): number => SEMILLA_INYECTADA;
const leer = (busqueda: string) => leerParametros(busqueda, generar);

describe('parámetros de la URL', () => {
  it('lee valores válidos: ?semilla=2026&lado=4', () => {
    expect(leer('?semilla=2026&lado=4')).toEqual({ ok: true, valor: { semilla: 2026, lado: 4 } });
  });

  it('acepta los extremos: semilla 0 y 4294967295, lado 1 y 9; también sin «?»', () => {
    expect(leer('semilla=0&lado=1')).toEqual({ ok: true, valor: { semilla: 0, lado: 1 } });
    expect(leer('?semilla=4294967295&lado=9')).toEqual({ ok: true, valor: { semilla: 4294967295, lado: 9 } });
  });

  it('sin parámetros usa el lado por defecto (3) y la semilla de la función inyectada', () => {
    expect(LADO_POR_DEFECTO).toBe(3);
    expect(leer('')).toEqual({ ok: true, valor: { semilla: SEMILLA_INYECTADA, lado: 3 } });
    expect(leer('?lado=5')).toEqual({ ok: true, valor: { semilla: SEMILLA_INYECTADA, lado: 5 } });
  });

  it('solo llama a la función de semilla cuando la URL no trae una', () => {
    let llamadas = 0;
    const contar = (): number => {
      llamadas++;
      return 1;
    };
    leerParametros('?semilla=5', contar);
    expect(llamadas).toBe(0);
    leerParametros('?lado=4', contar);
    expect(llamadas).toBe(1);
  });

  it('ignora los parámetros desconocidos', () => {
    expect(leer('?modo=rapido&semilla=9&x=&lado=2&debug')).toEqual({ ok: true, valor: { semilla: 9, lado: 2 } });
  });

  it.each(['0', '10', '3.5', 'tres', '', '-1', '+3', ' 3', '3e0'])('rechaza lado=%j con un mensaje claro', (lado) => {
    const r = leer(`?lado=${encodeURIComponent(lado)}&semilla=1`);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores).toHaveLength(1);
      expect(r.errores[0]?.campo).toBe('lado');
      expect(r.errores[0]?.recibido).toBe(lado);
      expect(r.errores[0]?.mensaje).toBe(`El lado debe ser un número entero de 1 a 9; se recibió «${lado}».`);
    }
  });

  it.each(['-1', '1.5', '4294967296', '99999999999999999999', 'abc', ''])('rechaza semilla=%j con un mensaje claro', (semilla) => {
    const r = leer(`?semilla=${encodeURIComponent(semilla)}`);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores.map((e) => e.campo)).toEqual(['semilla']);
      expect(r.errores[0]?.mensaje).toBe(`La semilla debe ser un número entero de 0 a 4294967295; se recibió «${semilla}».`);
    }
  });

  it('informa de los dos errores a la vez', () => {
    const r = leer('?semilla=x&lado=0');
    expect(r.ok ? [] : r.errores.map((e) => e.campo)).toEqual(['lado', 'semilla']);
  });

  it('propiedad: cualquier par válido se lee tal cual', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), fc.integer({ min: 1, max: 9 }), (semilla, lado) => {
        expect(leer(`?lado=${lado}&semilla=${semilla}`)).toEqual({ ok: true, valor: { semilla, lado } });
      }),
    );
  });
});
