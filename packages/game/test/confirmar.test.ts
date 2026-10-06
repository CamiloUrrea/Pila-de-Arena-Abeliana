import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CONFIG_INICIAL, aplicar, crearRonda } from '@pila/core';
import type { Estado } from '@pila/core';
import { colocar, confirmar, iniciarControlador } from '../src/controlador.ts';
import type { EstadoInterfaz } from '../src/controlador.ts';

function ronda(semilla: number, cambios: Partial<typeof CONFIG_INICIAL> = {}): Estado {
  const r = crearRonda({ ...CONFIG_INICIAL, ...cambios }, semilla);
  if (!r.ok) throw new Error('configuración inválida');
  return r.valor.estado;
}

/** Coloca todos los granos de la mano en (x, y) con el controlador. */
function llenar(ui: EstadoInterfaz, x = 1, y = 1): EstadoInterfaz {
  let actual = ui;
  while (actual.seleccionado !== null) {
    const paso = colocar(actual, x, y);
    if (!paso.ok) throw new Error('colocación rechazada');
    actual = paso.valor.ui;
  }
  return actual;
}

describe('confirmar', () => {
  it('con la mano completa equivale a aplicar Confirmar a mano y selecciona el primer grano de la mano nueva', () => {
    const ui = llenar(iniciarControlador(ronda(2026)));
    const paso = confirmar(ui);
    const esperado = aplicar(ui.estado, { tipo: 'Confirmar' });
    if (!paso.ok || !esperado.ok) throw new Error('confirmación rechazada');
    expect(paso.valor.ui.estado).toEqual(esperado.valor.estado);
    expect(paso.valor.eventos).toEqual(esperado.valor.eventos);
    expect(paso.valor.estadoAntes).toBe(ui.estado);
    expect(paso.valor.ui.estado.fase).toBe('colocando');
    expect(paso.valor.ui.seleccionado).toBe(0);
  });

  it('si la ronda termina, no hay selección', () => {
    // Una sola tirada y una meta inalcanzable: la ronda se pierde al confirmar.
    const ui = llenar(iniciarControlador(ronda(5, { tiradas: 1, meta: 1_000_000_000 })));
    const paso = confirmar(ui);
    if (!paso.ok) throw new Error('confirmación rechazada');
    expect(paso.valor.ui.estado.fase).toBe('perdida');
    expect(paso.valor.ui.seleccionado).toBeNull();
    expect(paso.valor.eventos.at(-1)?.tipo).toBe('RondaPerdida');
  });

  it('con la mano incompleta devuelve ManoIncompleta de core', () => {
    const ui = iniciarControlador(ronda(1));
    expect(confirmar(ui)).toEqual({ ok: false, error: { tipo: 'AccionIlegal', motivo: 'ManoIncompleta' } });
    const unGrano = colocar(ui, 0, 0);
    if (!unGrano.ok) throw new Error('colocación rechazada');
    expect(confirmar(unGrano.valor.ui)).toEqual({ ok: false, error: { tipo: 'AccionIlegal', motivo: 'ManoIncompleta' } });
  });

  it('propiedad: en rondas aleatorias el estado, los eventos y la selección coinciden con core y no muta', () => {
    fc.assert(
      fc.property(fc.nat({ max: 0xffffffff }), fc.integer({ min: 1, max: 5 }), fc.nat({ max: 4 }), (semilla, lado, celda) => {
        const ui = llenar(iniciarControlador(ronda(semilla, { lado })), celda % lado, Math.floor(celda / 2) % lado);
        const copia = structuredClone(ui);
        const paso = confirmar(ui);
        expect(ui).toEqual(copia);
        const esperado = aplicar(ui.estado, { tipo: 'Confirmar' });
        if (!esperado.ok) {
          expect(paso).toEqual({ ok: false, error: esperado.error });
          return;
        }
        if (!paso.ok) throw new Error('confirmación rechazada');
        expect(paso.valor.ui.estado).toEqual(esperado.valor.estado);
        const libre = esperado.valor.estado.mano.findIndex((g) => g.celda === null);
        expect(paso.valor.ui.seleccionado).toBe(libre === -1 ? null : libre);
      }),
    );
  });
});
