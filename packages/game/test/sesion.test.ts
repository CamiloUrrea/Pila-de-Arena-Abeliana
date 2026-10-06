import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { RegistroRonda } from '../src/registro.ts';
import { resumenSesion } from '../src/sesion.ts';

/** Registro mínimo con un resultado y `pidioOtra`. */
function registro(resultado: 'ganada' | 'perdida', pidioOtra = false, indice = 1): RegistroRonda {
  return {
    version: 1,
    sesion: 's',
    jugador: null,
    indice,
    semilla: indice,
    lado: 3,
    resultado,
    puntos: 0,
    meta: 5000,
    tiradasUsadas: 5,
    tiradasTotales: 5,
    oleadasMax: 0,
    avalanchaMax: 0,
    deshacer: 0,
    duracionMs: 0,
    pidioOtra,
    fecha: '',
  };
}

/** «G G P» → registros ganada, ganada, perdida. */
const secuencia = (texto: string): RegistroRonda[] =>
  texto
    .split(' ')
    .filter((x) => x !== '')
    .map((x, i) => registro(x === 'G' ? 'ganada' : 'perdida', false, i + 1));

describe('resumenSesion', () => {
  it('G G P G G G: racha actual 3 y mejor racha 3', () => {
    expect(resumenSesion(secuencia('G G P G G G'))).toEqual({
      rondas: 6,
      ganadas: 5,
      perdidas: 1,
      rachaActual: 3,
      mejorRacha: 3,
      pidioOtra: 0,
    });
  });

  it('G G G P G: la derrota rompe la racha (actual 1, mejor 3)', () => {
    const r = resumenSesion(secuencia('G G G P G'));
    expect([r.rachaActual, r.mejorRacha]).toEqual([1, 3]);
  });

  it('P: racha 0', () => {
    expect(resumenSesion(secuencia('P'))).toEqual({ rondas: 1, ganadas: 0, perdidas: 1, rachaActual: 0, mejorRacha: 0, pidioOtra: 0 });
  });

  it('G G P: la racha actual es 0 porque la última se perdió', () => {
    const r = resumenSesion(secuencia('G G P'));
    expect([r.rachaActual, r.mejorRacha]).toEqual([0, 2]);
  });

  it('vacío: todo a cero', () => {
    expect(resumenSesion([])).toEqual({ rondas: 0, ganadas: 0, perdidas: 0, rachaActual: 0, mejorRacha: 0, pidioOtra: 0 });
  });

  it('propiedad: ganadas + perdidas = rondas, mejor racha ≥ racha actual, y pidioOtra cuenta los marcados', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.boolean(), fc.boolean()), { maxLength: 60 }), (rondas) => {
        const registros = rondas.map(([gano, pidio], i) => registro(gano ? 'ganada' : 'perdida', pidio, i + 1));
        const r = resumenSesion(registros);
        expect(r.ganadas + r.perdidas).toBe(r.rondas);
        expect(r.rondas).toBe(registros.length);
        expect(r.mejorRacha).toBeGreaterThanOrEqual(r.rachaActual);
        expect(r.pidioOtra).toBe(rondas.filter(([, p]) => p).length);
        // La racha actual son las victorias seguidas al final.
        let esperada = 0;
        for (let i = rondas.length - 1; i >= 0 && rondas[i]?.[0] === true; i--) esperada++;
        expect(r.rachaActual).toBe(esperada);
      }),
    );
  });
});
