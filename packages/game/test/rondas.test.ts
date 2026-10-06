import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CONFIG_INICIAL, crearRonda, derivarFlujo, enteroEnRango, serializar, validarEstado } from '@pila/core';
import type { EstadoFlujo } from '@pila/core';
import { colocar, confirmar } from '../src/controlador.ts';
import type { EstadoInterfaz } from '../src/controlador.ts';
import { faseDeFlujo } from '../src/flujo.ts';
import { nuevaRonda } from '../src/rondas.ts';
import config from '../vite.config.ts';

describe('nuevaRonda', () => {
  it('propiedad: con varios lados y semillas da un estado válido con la selección inicial', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9 }), fc.nat({ max: 0xffffffff }), (lado, semilla) => {
        const r = nuevaRonda({ lado, semilla });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(validarEstado(r.valor.estado).ok).toBe(true);
        expect(r.valor.estado.config).toEqual({ ...CONFIG_INICIAL, lado });
        expect(r.valor.seleccionado).toBe(0);
        // Es la misma ronda que crea el núcleo con esa configuración y esa semilla.
        const directa = crearRonda({ ...CONFIG_INICIAL, lado }, semilla);
        expect(directa.ok && serializar(directa.valor.estado)).toBe(serializar(r.valor.estado));
      }),
    );
  });

  it('el mismo lado con semillas distintas da rondas distintas', () => {
    const vistas = new Set<string>();
    for (const semilla of [1, 2, 3, 2026, 99999]) {
      const r = nuevaRonda({ lado: 4, semilla });
      if (!r.ok) throw new Error('ronda rechazada');
      vistas.add(serializar(r.valor.estado));
    }
    expect(vistas.size).toBe(5);
  });

  it.each([0, -1, 2.5, Number.NaN])('un lado inválido (%d) devuelve el error de configuración sin lanzar', (lado) => {
    const r = nuevaRonda({ lado, semilla: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.campo).toBe('lado');
  });

  it.each([-1, 1.5, 4294967296, Number.NaN])('una semilla inválida (%d) devuelve un error sin lanzar', (semilla) => {
    expect(() => nuevaRonda({ lado: 3, semilla })).not.toThrow();
    const r = nuevaRonda({ lado: 3, semilla });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.campo).toBe('semilla');
  });
});

/** Juega una ronda hasta su fin con el controlador puro, colocando al azar con el flujo del bot. */
function jugarHastaElFin(inicio: EstadoInterfaz, semillaBot: number): EstadoInterfaz {
  let ui = inicio;
  let flujo: EstadoFlujo = derivarFlujo(semillaBot, 'mazo');
  const lado = ui.estado.config.lado;
  for (let tiradas = 0; faseDeFlujo({ animando: false, estado: ui.estado }) === 'jugando'; tiradas++) {
    if (tiradas > 100) throw new Error('la ronda no termina');
    while (ui.seleccionado !== null) {
      const [x, f1] = enteroEnRango(flujo, 0, lado - 1);
      const [y, f2] = enteroEnRango(f1, 0, lado - 1);
      flujo = f2;
      const paso = colocar(ui, x, y);
      if (!paso.ok) throw new Error('colocación rechazada');
      ui = paso.valor.ui;
    }
    const paso = confirmar(ui);
    if (!paso.ok) throw new Error('confirmación rechazada');
    ui = paso.valor.ui;
  }
  return ui;
}

describe('sesión simulada', () => {
  it('tres rondas seguidas con semillas distintas: cada una termina, pasa a fin y se crea la siguiente', () => {
    const semillas = [11, 222, 3333];
    const finales: string[] = [];
    let actual = nuevaRonda({ lado: 3, semilla: semillas[0] ?? 0 });
    for (const [i, semilla] of semillas.entries()) {
      if (!actual.ok) throw new Error('ronda rechazada');
      const inicial = actual.valor;
      const final = jugarHastaElFin(inicial, semilla + 7);
      expect(['ganada', 'perdida']).toContain(final.estado.fase);
      expect(faseDeFlujo({ animando: false, estado: final.estado })).toBe('fin');
      expect(final.seleccionado).toBeNull();
      finales.push(serializar(final.estado));
      // Otra ronda: mismo lado, semilla siguiente.
      const siguiente = semillas[i + 1];
      if (siguiente !== undefined) {
        actual = nuevaRonda({ lado: inicial.estado.config.lado, semilla: siguiente });
        if (!actual.ok) throw new Error('ronda rechazada');
        expect(faseDeFlujo({ animando: false, estado: actual.valor.estado })).toBe('jugando');
        expect(serializar(actual.valor.estado)).not.toBe(serializar(inicial.estado));
        expect(actual.valor.estado.config.lado).toBe(3);
      }
    }
    expect(new Set(finales).size).toBe(3);
  });
});

describe('configuración de Vite', () => {
  it('usa una base relativa, para servir la compilación desde cualquier carpeta', () => {
    expect((config as { base?: string }).base).toBe('./');
  });
});
