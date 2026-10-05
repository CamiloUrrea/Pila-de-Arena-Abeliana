// Estadística del informe de balance: funciones puras y acumuladores en streaming.

/** Cuantil normal del 97,5 %: intervalos al 95 %. */
export const Z_95 = 1.96;

export type Intervalo = { readonly inferior: number; readonly superior: number };

/**
 * Intervalo de Wilson al 95 % para una proporción de `exitos` sobre `n`:
 * centro (p + z²/2n) / (1 + z²/n) y semiancho z / (1 + z²/n) · √(p(1−p)/n + z²/4n²).
 */
export function wilson(exitos: number, n: number, z: number = Z_95): Intervalo {
  if (n === 0) return { inferior: 0, superior: 1 };
  const p = exitos / n;
  const z2 = z * z;
  const denominador = 1 + z2 / n;
  const centro = (p + z2 / (2 * n)) / denominador;
  const semiancho = (z / denominador) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { inferior: Math.max(0, centro - semiancho), superior: Math.min(1, centro + semiancho) };
}

/** Media y desviación muestral (n − 1) acumuladas en streaming con el algoritmo de Welford, más mínimo y máximo. */
export class Resumen {
  n = 0;
  media = 0;
  private m2 = 0;
  minimo = Number.POSITIVE_INFINITY;
  maximo = Number.NEGATIVE_INFINITY;

  agregar(valor: number, veces = 1): void {
    for (let i = 0; i < veces; i++) {
      this.n++;
      const delta = valor - this.media;
      this.media += delta / this.n;
      this.m2 += delta * (valor - this.media);
    }
    if (veces > 0) {
      this.minimo = Math.min(this.minimo, valor);
      this.maximo = Math.max(this.maximo, valor);
    }
  }

  /** Desviación muestral, con n − 1; `undefined` con menos de 2 valores. */
  get desviacion(): number | undefined {
    return this.n < 2 ? undefined : Math.sqrt(this.m2 / (this.n - 1));
  }
}

/** Media y desviación muestral de una lista; atajo de `Resumen` para listas cortas. */
export function resumir(valores: readonly number[]): Resumen {
  const r = new Resumen();
  for (const v of valores) r.agregar(v);
  return r;
}

export type DiferenciaPorPares = {
  /** Pares usados: semillas presentes en los dos grupos. */
  readonly n: number;
  readonly media: number;
  /** Media ± z · s/√n, con s la desviación muestral de las diferencias; `undefined` con menos de 2 pares. */
  readonly intervalo: Intervalo | undefined;
};

/** Diferencia media por pares (`a − b`) con su intervalo al 95 % por aproximación normal. */
export function diferenciaPorPares(diferencias: readonly number[], z: number = Z_95): DiferenciaPorPares {
  const r = resumir(diferencias);
  const s = r.desviacion;
  const error = s === undefined ? undefined : s / Math.sqrt(r.n);
  return {
    n: r.n,
    media: r.n === 0 ? 0 : r.media,
    intervalo: error === undefined ? undefined : { inferior: r.media - z * error, superior: r.media + z * error },
  };
}

/** Tramos del histograma de avalanchas: [desde, hasta] inclusivos; `hasta` indefinido es «o más». */
export const TRAMOS_AVALANCHA: readonly { readonly desde: number; readonly hasta?: number }[] = [
  { desde: 1, hasta: 2 },
  { desde: 3, hasta: 5 },
  { desde: 6, hasta: 10 },
  { desde: 11, hasta: 20 },
  { desde: 21 },
];

/**
 * Recuento por tamaño de valores enteros positivos (los tamaños de avalancha): permite media, desviación,
 * percentiles e histograma sin guardar cada valor.
 */
export class Recuento {
  private readonly cuentas = new Map<number, number>();
  n = 0;

  agregar(tamano: number): void {
    this.cuentas.set(tamano, (this.cuentas.get(tamano) ?? 0) + 1);
    this.n++;
  }

  /** Tamaños distintos en orden creciente, con su número de apariciones. */
  private ordenados(): [number, number][] {
    return [...this.cuentas.entries()].sort(([a], [b]) => a - b);
  }

  resumen(): Resumen {
    const r = new Resumen();
    for (const [tamano, veces] of this.ordenados()) r.agregar(tamano, veces);
    return r;
  }

  /** Percentil por rango más cercano: el elemento de posición ⌈q · n⌉ (desde 1) de los valores ordenados. */
  percentil(q: number): number | undefined {
    if (this.n === 0) return undefined;
    const posicion = Math.max(1, Math.ceil(q * this.n));
    let acumulado = 0;
    for (const [tamano, veces] of this.ordenados()) {
      acumulado += veces;
      if (acumulado >= posicion) return tamano;
    }
    return undefined;
  }

  /** Porcentaje de valores en cada tramo de `TRAMOS_AVALANCHA`. */
  histograma(): number[] {
    return TRAMOS_AVALANCHA.map(({ desde, hasta }) => {
      let veces = 0;
      for (const [tamano, v] of this.cuentas) if (tamano >= desde && (hasta === undefined || tamano <= hasta)) veces += v;
      return this.n === 0 ? 0 : (100 * veces) / this.n;
    });
  }

  /** Fracción de la suma total que aportan los ⌈fraccion · n⌉ valores más grandes. */
  parteDeLosMayores(fraccion: number): number {
    if (this.n === 0) return 0;
    let quedan = Math.ceil(fraccion * this.n);
    let total = 0;
    let mayores = 0;
    for (const [tamano, veces] of this.ordenados().reverse()) {
      total += tamano * veces;
      const tomados = Math.min(quedan, veces);
      mayores += tamano * tomados;
      quedan -= tomados;
    }
    return total === 0 ? 0 : mayores / total;
  }
}
