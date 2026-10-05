import type { Config } from '../tipos.ts';

/** Valores iniciales de la especificación del núcleo (sección «Datos»). */
export const CONFIG_INICIAL: Config = {
  lado: 3,
  umbral: 4,
  tiradas: 5,
  tamanoMano: 5,
  siembra: { min: 0, max: 2 },
  mazo: { normal: 20, pesado: 6, explosivo: 4 },
  meta: 1000,
  multiplicadorPorOleada: 10,
  topeOleadas: 1000,
};
