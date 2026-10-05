import fc from 'fast-check';
import type { Celdas, Coordenada, TipoGrano } from '../src/index.ts';

// Oráculos y generadores para las pruebas de propiedades de la resolución.
// No reutilizan código de src/oleadas.ts ni de src/rejilla.ts: son independientes a propósito.

const VECINOS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** Rejilla mutable en un arreglo plano, con lecturas y escrituras comprobadas. */
class Plana {
  readonly lado: number;
  readonly valores: number[];
  constructor(lado: number, celdas: Celdas) {
    this.lado = lado;
    this.valores = celdas.flat();
    if (this.valores.length !== lado * lado) throw new Error('la rejilla no mide lado × lado');
  }
  dentro(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.lado && y < this.lado;
  }
  leer(x: number, y: number): number {
    const v = this.valores[y * this.lado + x];
    if (v === undefined) throw new Error(`celda fuera: (${x}, ${y})`);
    return v;
  }
  sumar(x: number, y: number, n: number): void {
    this.valores[y * this.lado + x] = this.leer(x, y) + n;
  }
  matriz(): number[][] {
    return Array.from({ length: this.lado }, (_, y) => this.valores.slice(y * this.lado, (y + 1) * this.lado));
  }
}

export type ResultadoUnoAUno = {
  readonly celdas: number[][];
  readonly derrumbesPorCelda: number[][];
  readonly granosFuera: number;
};

/**
 * Resolvedor de referencia: mientras haya celdas con 4 granos o más, derrumba UNA, la que diga `elegir`
 * entre las inestables por filas. Pierde 4, da 1 a cada vecino dentro y cuenta como fuera los demás.
 */
export function resolverUnoAUno(
  celdas: Celdas,
  lado: number,
  elegir: (inestables: readonly Coordenada[]) => Coordenada,
): ResultadoUnoAUno {
  const rejilla = new Plana(lado, celdas);
  const derrumbes = new Plana(lado, Array.from({ length: lado }, () => Array.from({ length: lado }, () => 0)));
  let granosFuera = 0;
  for (;;) {
    const inestables: Coordenada[] = [];
    for (let y = 0; y < lado; y++) {
      for (let x = 0; x < lado; x++) if (rejilla.leer(x, y) >= 4) inestables.push({ x, y });
    }
    if (inestables.length === 0) break;
    const { x, y } = elegir(inestables);
    rejilla.sumar(x, y, -4);
    derrumbes.sumar(x, y, 1);
    for (const [dx, dy] of VECINOS) {
      if (rejilla.dentro(x + dx, y + dy)) rejilla.sumar(x + dx, y + dy, 1);
      else granosFuera++;
    }
  }
  return { celdas: rejilla.matriz(), derrumbesPorCelda: derrumbes.matriz(), granosFuera };
}

/** `elegir` reproducible: recorre en ciclo los enteros que genera fast-check. */
export function eleccionCiclica(enteros: readonly number[]): (inestables: readonly Coordenada[]) => Coordenada {
  let i = 0;
  return (inestables) => {
    const n = enteros[i % enteros.length] ?? 0;
    i++;
    const elegida = inestables[n % inestables.length];
    if (elegida === undefined) throw new Error('no hay inestables entre las que elegir');
    return elegida;
  };
}

export type Colocacion = { readonly tipo: TipoGrano; readonly x: number; readonly y: number };

/**
 * Paso 1 de la resolución: normal suma 1, pesado 2 y explosivo 1 más 1 a cada vecino dentro.
 * Provisional: T1.5 implementará el de src y lo cruzará con este.
 */
export function sumarAdiciones(celdas: Celdas, lado: number, colocaciones: readonly Colocacion[]): number[][] {
  const rejilla = new Plana(lado, celdas);
  for (const { tipo, x, y } of colocaciones) {
    rejilla.sumar(x, y, tipo === 'pesado' ? 2 : 1);
    if (tipo === 'explosivo') {
      for (const [dx, dy] of VECINOS) if (rejilla.dentro(x + dx, y + dy)) rejilla.sumar(x + dx, y + dy, 1);
    }
  }
  return rejilla.matriz();
}

export type Carga = { readonly lado: number; readonly celdas: number[][] };

function arbMatriz(lado: number, valor: fc.Arbitrary<number>): fc.Arbitrary<number[][]> {
  return fc.array(fc.array(valor, { minLength: lado, maxLength: lado }), { minLength: lado, maxLength: lado });
}

/** Rejillas de lado 1 a 6 con celdas de 0 a 12. Necesitan un topeOleadas alto. */
export const arbRejillaArbitraria: fc.Arbitrary<Carga> = fc
  .integer({ min: 1, max: 6 })
  .chain((lado) => arbMatriz(lado, fc.integer({ min: 0, max: 12 })).map((celdas) => ({ lado, celdas })));

/** Rejilla estable de lado 1 a 9 más una mano legal de 1 a 6 granos aplicada con `sumarAdiciones`. */
export const arbCargaAlcanzable: fc.Arbitrary<Carga> = fc.integer({ min: 1, max: 9 }).chain((lado) => {
  const coordenada = fc.integer({ min: 0, max: lado - 1 });
  const colocacion = fc.record({
    tipo: fc.constantFrom<TipoGrano>('normal', 'pesado', 'explosivo'),
    x: coordenada,
    y: coordenada,
  });
  return fc
    .record({
      estable: arbMatriz(lado, fc.integer({ min: 0, max: 3 })),
      mano: fc.array(colocacion, { minLength: 1, maxLength: 6 }),
    })
    .map(({ estable, mano }) => ({ lado, celdas: sumarAdiciones(estable, lado, mano) }));
});
