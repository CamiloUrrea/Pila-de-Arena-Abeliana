import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CONFIG_INICIAL, validarConfig } from '../src/index.ts';
import type { Config } from '../src/index.ts';
import { arbConfig } from './ayudantes.ts';

describe('validarConfig', () => {
  it('acepta CONFIG_INICIAL con sus valores de la especificación', () => {
    expect(validarConfig(CONFIG_INICIAL)).toEqual({ ok: true, valor: CONFIG_INICIAL });
    expect(CONFIG_INICIAL).toEqual({
      lado: 3,
      umbral: 4,
      tiradas: 5,
      tamanoMano: 5,
      siembra: { min: 0, max: 2 },
      mazo: { normal: 20, pesado: 6, explosivo: 4 },
      meta: 5000,
      multiplicadorPorOleada: 50,
      topeOleadas: 1000,
    });
  });

  it.each<[string, Config]>([
    ['lado 1', { ...CONFIG_INICIAL, lado: 1 }],
    ['tamanoMano igual al total del mazo', { ...CONFIG_INICIAL, tamanoMano: 30 }],
    ['siembra con mínimo igual al máximo', { ...CONFIG_INICIAL, siembra: { min: 2, max: 2 } }],
    ['multiplicadorPorOleada 0', { ...CONFIG_INICIAL, multiplicadorPorOleada: 0 }],
    ['siembra.max igual a umbral − 1', { ...CONFIG_INICIAL, siembra: { min: 0, max: 3 } }],
    ['un tipo del mazo a 0', { ...CONFIG_INICIAL, mazo: { normal: 5, pesado: 0, explosivo: 0 } }],
  ])('acepta el caso límite: %s', (_, config) => {
    expect(validarConfig(config).ok).toBe(true);
  });

  it('acepta las configuraciones generadas', () => {
    fc.assert(fc.property(arbConfig, (config) => validarConfig(config).ok));
  });

  it.each<[string, Config, string]>([
    ['lado no entero', { ...CONFIG_INICIAL, lado: 2.5 }, 'lado'],
    ['lado NaN', { ...CONFIG_INICIAL, lado: Number.NaN }, 'lado'],
    ['lado no seguro', { ...CONFIG_INICIAL, lado: 2 ** 53 }, 'lado'],
    ['lado 0', { ...CONFIG_INICIAL, lado: 0 }, 'lado'],
    ['umbral 3', { ...CONFIG_INICIAL, umbral: 3 }, 'umbral'],
    ['umbral 5', { ...CONFIG_INICIAL, umbral: 5 }, 'umbral'],
    ['tiradas 0', { ...CONFIG_INICIAL, tiradas: 0 }, 'tiradas'],
    ['tamanoMano 0', { ...CONFIG_INICIAL, tamanoMano: 0 }, 'tamanoMano'],
    ['tamanoMano mayor que el mazo', { ...CONFIG_INICIAL, tamanoMano: 31 }, 'tamanoMano'],
    ['mazo vacío', { ...CONFIG_INICIAL, mazo: { normal: 0, pesado: 0, explosivo: 0 } }, 'tamanoMano'],
    ['siembra.min negativo', { ...CONFIG_INICIAL, siembra: { min: -1, max: 2 } }, 'siembra.min'],
    ['siembra.min no entero', { ...CONFIG_INICIAL, siembra: { min: 0.5, max: 2 } }, 'siembra.min'],
    ['siembra.min mayor que siembra.max', { ...CONFIG_INICIAL, siembra: { min: 3, max: 2 } }, 'siembra.max'],
    ['siembra.max igual al umbral', { ...CONFIG_INICIAL, siembra: { min: 0, max: 4 } }, 'siembra.max'],
    ['siembra.max mayor que el umbral', { ...CONFIG_INICIAL, siembra: { min: 2, max: 7 } }, 'siembra.max'],
    ['mazo.pesado negativo', { ...CONFIG_INICIAL, mazo: { normal: 20, pesado: -1, explosivo: 4 } }, 'mazo.pesado'],
    ['mazo.normal no entero', { ...CONFIG_INICIAL, mazo: { normal: 1.5, pesado: 6, explosivo: 4 } }, 'mazo.normal'],
    ['meta 0', { ...CONFIG_INICIAL, meta: 0 }, 'meta'],
    ['multiplicadorPorOleada negativo', { ...CONFIG_INICIAL, multiplicadorPorOleada: -1 }, 'multiplicadorPorOleada'],
    ['topeOleadas 0', { ...CONFIG_INICIAL, topeOleadas: 0 }, 'topeOleadas'],
    ['topeOleadas infinito', { ...CONFIG_INICIAL, topeOleadas: Number.POSITIVE_INFINITY }, 'topeOleadas'],
  ])('rechaza %s', (_, config, campo) => {
    const resultado = validarConfig(config);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.campo).toBe(campo);
      if (campo === 'siembra.max' && config.siembra.max >= config.umbral) {
        expect(resultado.error.motivo).toContain('rejilla inicial sea estable');
      }
      expect(resultado.error.motivo).not.toBe('');
    }
  });
});
