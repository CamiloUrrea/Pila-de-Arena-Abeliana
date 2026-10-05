import fc from 'fast-check';
import { CONFIG_INICIAL, FASES, TIPOS_GRANO, crearRejilla } from '../src/index.ts';
import type { Config, Estado, EstadoFlujo, GranoMano, TipoGrano } from '../src/index.ts';

/** Lista de tipos con la composición de `mazo`, en el orden de `TIPOS_GRANO`. */
export function composicion(mazo: Config['mazo']): TipoGrano[] {
  return TIPOS_GRANO.flatMap((tipo) => Array.from({ length: mazo[tipo] }, () => tipo));
}

/**
 * Estado válido con `CONFIG_INICIAL`: rejilla vacía, cinco normales en la mano sin colocar
 * y el resto del mazo en orden. `overrides` sustituye campos completos.
 */
export function estadoDePrueba(overrides: Partial<Estado> = {}): Estado {
  const tipos = composicion(CONFIG_INICIAL.mazo);
  return {
    config: CONFIG_INICIAL,
    celdas: crearRejilla(CONFIG_INICIAL.lado),
    fase: 'colocando',
    mano: tipos.slice(0, CONFIG_INICIAL.tamanoMano).map((tipo) => ({ tipo, celda: null })),
    mazo: tipos.slice(CONFIG_INICIAL.tamanoMano),
    usados: [],
    tiradasRestantes: CONFIG_INICIAL.tiradas,
    puntos: 0,
    rng: { siembra: [1, 2, 3, 4], mazo: [5, 6, 7, 8] },
    ...overrides,
  };
}

/** Configuraciones válidas con rejillas de lado 1 a 9. */
export const arbConfig: fc.Arbitrary<Config> = fc
  .record({
    lado: fc.integer({ min: 1, max: 9 }),
    tiradas: fc.integer({ min: 1, max: 10 }),
    tamanoMano: fc.integer({ min: 1, max: 12 }),
    siembraA: fc.integer({ min: 0, max: 3 }),
    siembraB: fc.integer({ min: 0, max: 3 }),
    mazo: fc
      .record({
        normal: fc.integer({ min: 0, max: 12 }),
        pesado: fc.integer({ min: 0, max: 12 }),
        explosivo: fc.integer({ min: 0, max: 12 }),
      })
      .filter((mazo) => mazo.normal + mazo.pesado + mazo.explosivo >= 1),
    meta: fc.integer({ min: 1, max: 5000 }),
    multiplicadorPorOleada: fc.integer({ min: 0, max: 100 }),
    topeOleadas: fc.integer({ min: 1, max: 1000 }),
  })
  .map((r) => ({
    lado: r.lado,
    umbral: 4,
    tiradas: r.tiradas,
    tamanoMano: Math.min(r.tamanoMano, r.mazo.normal + r.mazo.pesado + r.mazo.explosivo),
    siembra: { min: Math.min(r.siembraA, r.siembraB), max: Math.max(r.siembraA, r.siembraB) },
    mazo: r.mazo,
    meta: r.meta,
    multiplicadorPorOleada: r.multiplicadorPorOleada,
    topeOleadas: r.topeOleadas,
  }));

const palabra = fc.integer({ min: 0, max: 0xffffffff });

/** Estados de flujo válidos: cuatro palabras de 32 bits sin signo, no todas cero. */
export const arbFlujo: fc.Arbitrary<EstadoFlujo> = fc
  .tuple(palabra, palabra, palabra, palabra)
  .filter((flujo) => flujo.some((p) => p !== 0));

/** Estados válidos: celdas 0..7 y la composición del mazo repartida entre mazo, mano y usados. */
export const arbEstado: fc.Arbitrary<Estado> = arbConfig.chain((config) => {
  const { lado, tamanoMano } = config;
  const tipos = composicion(config.mazo);
  const coordenada = fc.integer({ min: 0, max: lado - 1 });
  return fc
    .record({
      celdas: fc.array(fc.array(fc.integer({ min: 0, max: 7 }), { minLength: lado, maxLength: lado }), {
        minLength: lado,
        maxLength: lado,
      }),
      orden: fc.shuffledSubarray(tipos, { minLength: tipos.length, maxLength: tipos.length }),
      nMano: fc.integer({ min: 0, max: tamanoMano }),
      nUsados: fc.integer({ min: 0, max: tipos.length }),
      celdasMano: fc.array(fc.option(fc.record({ x: coordenada, y: coordenada }), { nil: null }), {
        minLength: tamanoMano,
        maxLength: tamanoMano,
      }),
      fase: fc.constantFrom(...FASES),
      tiradasRestantes: fc.integer({ min: 0, max: config.tiradas }),
      puntos: fc.integer({ min: 0, max: 1_000_000 }),
      rng: fc.record({ siembra: arbFlujo, mazo: arbFlujo }),
    })
    .map((r): Estado => {
      const finUsados = r.nMano + Math.min(r.nUsados, tipos.length - r.nMano);
      return {
        config,
        celdas: r.celdas,
        fase: r.fase,
        mano: r.orden.slice(0, r.nMano).map((tipo, i) => ({ tipo, celda: r.celdasMano[i] ?? null })),
        mazo: r.orden.slice(finUsados),
        usados: r.orden.slice(r.nMano, finUsados),
        tiradasRestantes: r.tiradasRestantes,
        puntos: r.puntos,
        rng: r.rng,
      };
    });
});

/** Congela un valor en profundidad y lo devuelve. */
export function congelar<T>(valor: T): T {
  if (typeof valor === 'object' && valor !== null) {
    Object.freeze(valor);
    for (const hijo of Object.values(valor)) congelar(hijo);
  }
  return valor;
}

/** Copia del estado con las claves de cada objeto en orden inverso al habitual. */
export function invertirClaves(e: Estado): Estado {
  const c = e.config;
  return {
    rng: { mazo: e.rng.mazo, siembra: e.rng.siembra },
    puntos: e.puntos,
    tiradasRestantes: e.tiradasRestantes,
    usados: e.usados,
    mazo: e.mazo,
    mano: e.mano.map((g) => ({ celda: g.celda === null ? null : { y: g.celda.y, x: g.celda.x }, tipo: g.tipo })),
    fase: e.fase,
    celdas: e.celdas,
    config: {
      topeOleadas: c.topeOleadas,
      multiplicadorPorOleada: c.multiplicadorPorOleada,
      meta: c.meta,
      mazo: { explosivo: c.mazo.explosivo, pesado: c.mazo.pesado, normal: c.mazo.normal },
      siembra: { max: c.siembra.max, min: c.siembra.min },
      tamanoMano: c.tamanoMano,
      tiradas: c.tiradas,
      umbral: c.umbral,
      lado: c.lado,
    },
  };
}

/** `tipos` sin una aparición de cada elemento de `quitar`. Falla si alguno no está. */
export function restar(tipos: readonly TipoGrano[], quitar: readonly TipoGrano[]): TipoGrano[] {
  const resto = [...tipos];
  for (const tipo of quitar) {
    const i = resto.indexOf(tipo);
    if (i < 0) throw new Error(`no queda ningún ${tipo} que quitar`);
    resto.splice(i, 1);
  }
  return resto;
}

/** Sustituye la mano y deja en el mazo, en orden de composición, lo que no está en la mano ni en `usados`. */
export function conMano(estado: Estado, mano: readonly GranoMano[]): Estado {
  const enJuego = [...estado.usados, ...mano.map((grano) => grano.tipo)];
  return { ...estado, mano, mazo: restar(composicion(estado.config.mazo), enJuego) };
}

/** Composición amplia para que cualquier mano de hasta 6 granos quepa en el mazo. */
const MAZO_AMPLIO: Config['mazo'] = { normal: 10, pesado: 6, explosivo: 6 };

/**
 * Estados válidos listos para `resolverTirada`: lado 1 a 9, rejilla estable, mano de 1 a 6 granos colocados
 * (varios pueden compartir celda), multiplicador 0 a 100, puntos previos 0 a 100000 y 1 a 5 tiradas restantes.
 */
export const arbEstadoListoParaConfirmar: fc.Arbitrary<Estado> = fc.integer({ min: 1, max: 9 }).chain((lado) => {
  const coordenada = fc.integer({ min: 0, max: lado - 1 });
  return fc
    .record({
      celdas: fc.array(fc.array(fc.integer({ min: 0, max: 3 }), { minLength: lado, maxLength: lado }), {
        minLength: lado,
        maxLength: lado,
      }),
      mano: fc.array(
        fc.record({
          tipo: fc.constantFrom<TipoGrano>(...TIPOS_GRANO),
          celda: fc.record({ x: coordenada, y: coordenada }),
        }),
        { minLength: 1, maxLength: 6 },
      ),
      nUsados: fc.nat({ max: 16 }),
      multiplicadorPorOleada: fc.integer({ min: 0, max: 100 }),
      puntos: fc.integer({ min: 0, max: 100_000 }),
      tiradasRestantes: fc.integer({ min: 1, max: 5 }),
    })
    .map((r) => {
      const config: Config = {
        ...CONFIG_INICIAL,
        lado,
        tiradas: 5,
        tamanoMano: r.mano.length,
        mazo: MAZO_AMPLIO,
        multiplicadorPorOleada: r.multiplicadorPorOleada,
      };
      const libres = restar(composicion(MAZO_AMPLIO), r.mano.map((grano) => grano.tipo));
      const base = estadoDePrueba({
        config,
        celdas: r.celdas,
        usados: libres.slice(0, r.nUsados),
        tiradasRestantes: r.tiradasRestantes,
        puntos: r.puntos,
      });
      return conMano(base, r.mano);
    });
});
