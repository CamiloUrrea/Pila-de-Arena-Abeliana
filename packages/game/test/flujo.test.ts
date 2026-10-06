import { describe, expect, it } from 'vitest';
import { CONFIG_INICIAL, crearRonda } from '@pila/core';
import type { Estado, Fase } from '@pila/core';
import { faseDeFlujo, interpretarAceptar, permitida } from '../src/flujo.ts';
import type { AccionFlujo, FaseFlujo } from '../src/flujo.ts';

function estadoEn(fase: Fase): Estado {
  const r = crearRonda(CONFIG_INICIAL, 1);
  if (!r.ok) throw new Error('configuración inválida');
  return { ...r.valor.estado, fase };
}

describe('faseDeFlujo', () => {
  it.each<Fase>(['colocando', 'ganada', 'perdida'])('con una cascada en curso es animando, aunque la ronda esté en %s', (fase) => {
    expect(faseDeFlujo({ animando: true, estado: estadoEn(fase) })).toBe('animando');
  });

  it.each<[Fase, FaseFlujo]>([
    ['colocando', 'jugando'],
    ['ganada', 'fin'],
    ['perdida', 'fin'],
  ])('sin cascada, la ronda en %s es %s', (fase, esperada) => {
    expect(faseDeFlujo({ animando: false, estado: estadoEn(fase) })).toBe(esperada);
  });
});

describe('permitida', () => {
  const ACCIONES: readonly AccionFlujo[] = [
    'seleccionar',
    'ciclar',
    'colocar',
    'deshacer',
    'confirmar',
    'ritmo',
    'saltar',
    'otraRonda',
    'copiar',
  ];

  /** Tabla esperada, explícita: cada acción en cada fase. */
  const TABLA: Readonly<Record<FaseFlujo, Readonly<Record<AccionFlujo, boolean>>>> = {
    jugando: {
      seleccionar: true,
      ciclar: true,
      colocar: true,
      deshacer: true,
      confirmar: true,
      ritmo: true,
      saltar: false,
      otraRonda: false,
      copiar: true,
    },
    animando: {
      seleccionar: false,
      ciclar: false,
      colocar: false,
      deshacer: false,
      confirmar: false,
      ritmo: true,
      saltar: true,
      otraRonda: false,
      copiar: true,
    },
    fin: {
      seleccionar: false,
      ciclar: false,
      colocar: false,
      deshacer: false,
      confirmar: false,
      ritmo: true,
      saltar: false,
      otraRonda: true,
      copiar: true,
    },
  };

  for (const fase of ['jugando', 'animando', 'fin'] as const) {
    it.each(ACCIONES.map((a) => [a]))(`en ${fase}, %s sigue la tabla`, (accion) => {
      expect(permitida(fase, accion)).toBe(TABLA[fase][accion]);
    });
  }

  it('el ritmo y copiar el registro se aceptan en todas las fases', () => {
    expect((['jugando', 'animando', 'fin'] as const).every((f) => permitida(f, 'ritmo'))).toBe(true);
    expect((['jugando', 'animando', 'fin'] as const).every((f) => permitida(f, 'copiar'))).toBe(true);
  });
});

describe('interpretarAceptar', () => {
  it.each<[FaseFlujo, AccionFlujo]>([
    ['jugando', 'confirmar'],
    ['animando', 'saltar'],
    ['fin', 'otraRonda'],
  ])('Intro o Espacio en %s significan %s, que la fase permite', (fase, accion) => {
    expect(interpretarAceptar(fase)).toBe(accion);
    expect(permitida(fase, interpretarAceptar(fase))).toBe(true);
  });
});
