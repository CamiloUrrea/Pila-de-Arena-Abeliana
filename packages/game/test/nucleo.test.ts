import { describe, expect, it } from 'vitest';
import { CONFIG_INICIAL, accionesLegales, crearRonda, validarEstado } from '@pila/core';

describe('@pila/game usa la interfaz pública de @pila/core', () => {
  it('crearRonda con CONFIG_INICIAL devuelve una ronda válida con acciones legales', () => {
    const ronda = crearRonda(CONFIG_INICIAL, 2026);
    expect(ronda.ok).toBe(true);
    if (ronda.ok) {
      expect(validarEstado(ronda.valor.estado).ok).toBe(true);
      expect(ronda.valor.eventos).toEqual([
        { tipo: 'ManoRobada', tipos: ronda.valor.estado.mano.map((grano) => grano.tipo) },
      ]);
      expect(accionesLegales(ronda.valor.estado)).toHaveLength(CONFIG_INICIAL.tamanoMano * CONFIG_INICIAL.lado ** 2);
    }
  });
});
