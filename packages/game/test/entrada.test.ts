import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { accionDeTecla } from '../src/entrada.ts';

const sinModificadores = { ctrl: false, alt: false, meta: false };
const tecla = (t: string) => accionDeTecla({ tecla: t, ...sinModificadores });

describe('accionDeTecla', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])('la tecla %i selecciona el índice número − 1', (n) => {
    expect(tecla(String(n))).toEqual({ tipo: 'seleccionar', indice: n - 1 });
  });

  it('las flechas ciclan: izquierda −1 y derecha +1', () => {
    expect(tecla('ArrowLeft')).toEqual({ tipo: 'ciclar', direccion: -1 });
    expect(tecla('ArrowRight')).toEqual({ tipo: 'ciclar', direccion: 1 });
  });

  it.each(['z', 'Z', 'Backspace'])('%s deshace', (t) => {
    expect(tecla(t)).toEqual({ tipo: 'deshacer' });
  });

  it('+ (o su alias =) sube el ritmo y - lo baja', () => {
    expect(tecla('+')).toEqual({ tipo: 'ritmo', direccion: 1 });
    expect(tecla('=')).toEqual({ tipo: 'ritmo', direccion: 1 });
    expect(tecla('-')).toEqual({ tipo: 'ritmo', direccion: -1 });
  });

  it.each(['r', 'R'])('«%s» pide otra ronda', (t) => {
    expect(tecla(t)).toEqual({ tipo: 'otraRonda' });
  });

  it.each(['Enter', ' '])('«%s» acepta', (t) => {
    expect(tecla(t)).toEqual({ tipo: 'aceptar' });
  });

  it.each(['0', 'a', 'x', 'Tab', 'Spacebar', '_', '*', 'ArrowUp', 'ArrowDown', 'Escape', 'Delete', '10', 'F1', ''])(
    'la tecla «%s» no está mapeada',
    (t) => {
      expect(tecla(t)).toBeNull();
    },
  );

  it.each([
    { ctrl: true, alt: false, meta: false },
    { ctrl: false, alt: true, meta: false },
    { ctrl: false, alt: false, meta: true },
    { ctrl: true, alt: true, meta: true },
  ])('con modificadores %o ninguna tecla hace nada', (mods) => {
    for (const t of ['1', '9', 'ArrowLeft', 'ArrowRight', 'z', 'Z', 'Backspace', 'Enter', ' ', '+', '=', '-', 'r', 'R']) {
      expect(accionDeTecla({ tecla: t, ...mods })).toBeNull();
    }
  });

  it('propiedad: nunca lanza y solo devuelve acciones bien formadas', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 12 }), fc.boolean(), fc.boolean(), fc.boolean(), (t, ctrl, alt, meta) => {
        const accion = accionDeTecla({ tecla: t, ctrl, alt, meta });
        if (ctrl || alt || meta) expect(accion).toBeNull();
        if (accion?.tipo === 'seleccionar') expect(accion.indice).toBeGreaterThanOrEqual(0);
        if (accion?.tipo === 'seleccionar') expect(accion.indice).toBeLessThanOrEqual(8);
      }),
    );
  });
});
