// Geometría pura de la pantalla: dado el tamaño de la ventana y el lado, dónde va cada banda y cada celda.
import { TEMA } from './tema.ts';
import type { Tema } from './tema.ts';

export type Rect = { readonly x: number; readonly y: number; readonly ancho: number; readonly alto: number };

/** Tamaño de la ventana en píxeles lógicos. */
export type Ventana = { readonly ancho: number; readonly alto: number };

export type Punto = { readonly x: number; readonly y: number };

/** Hueco circular de una ficha de la mano: centro y radio. */
export type Ficha = { readonly x: number; readonly y: number; readonly radio: number };

export type DisposicionMano = {
  readonly banda: Rect;
  /** Una ficha por grano de la mano, en orden, en una fila centrada en la banda. */
  readonly fichas: readonly Ficha[];
  /** Línea de texto bajo las fichas (la descripción del grano seleccionado). */
  readonly descripcion: Rect;
  /** Botón primario, a la derecha y encima de Deshacer. */
  readonly confirmar: Rect;
  readonly deshacer: Rect;
};

export type Disposicion = {
  readonly bandaSuperior: Rect;
  readonly bandaCentral: Rect;
  readonly bandaInferior: Rect;
  /** Rectángulo que ocupan todas las celdas, centrado en la banda central. */
  readonly tablero: Rect;
  /** Lado de cada celda (todas son cuadradas e iguales). */
  readonly celda: number;
  readonly hueco: number;
  /** Rectángulo de cada celda, indexado `celdas[y][x]` como la rejilla del núcleo. */
  readonly celdas: readonly (readonly Rect[])[];
};

/** Tamaño de ventana utilizable: negativo, NaN o infinito cuentan como 0. */
const medida = (valor: number): number => (Number.isFinite(valor) && valor > 0 ? valor : 0);

type Bandas = Pick<Disposicion, 'bandaSuperior' | 'bandaCentral' | 'bandaInferior'>;

/** Reparte la ventana en las tres bandas horizontales del tema. */
function repartirBandas(ancho: number, alto: number, tema: Tema): Bandas {
  const w = medida(ancho);
  const h = medida(alto);
  const altoSuperior = h * tema.bandas.superior;
  const altoCentral = h * tema.bandas.central;
  return {
    bandaSuperior: { x: 0, y: 0, ancho: w, alto: altoSuperior },
    bandaCentral: { x: 0, y: altoSuperior, ancho: w, alto: altoCentral },
    bandaInferior: { x: 0, y: altoSuperior + altoCentral, ancho: w, alto: h - altoSuperior - altoCentral },
  };
}

/**
 * Calcula la disposición para una ventana de `ancho × alto` píxeles lógicos y una rejilla de `lado × lado`.
 * El tablero es el mayor cuadrado que cabe en la banda central menos su margen, de modo que cabe siempre, sea la
 * ventana ancha, estrecha o muy pequeña. Una ventana degenerada da celdas de tamaño 0, nunca NaN.
 *
 * @throws RangeError si `lado` no es un entero mayor o igual que 1.
 */
export function disponer(ancho: number, alto: number, lado: number, tema: Tema = TEMA): Disposicion {
  if (!Number.isInteger(lado) || lado < 1) throw new RangeError(`lado debe ser un entero ≥ 1: ${lado}`);
  const { proporciones } = tema;
  const { bandaSuperior, bandaCentral, bandaInferior } = repartirBandas(ancho, alto, tema);

  const margen = Math.min(bandaCentral.ancho, bandaCentral.alto) * proporciones.margenTablero;
  const disponible = Math.min(bandaCentral.ancho - 2 * margen, bandaCentral.alto - 2 * margen);
  // lado · celda + (lado − 1) · hueco = disponible, con hueco = huecoCelda · celda.
  const celda = Math.max(0, disponible) / (lado + (lado - 1) * proporciones.huecoCelda);
  const hueco = celda * proporciones.huecoCelda;
  const tamano = lado * celda + (lado - 1) * hueco;
  const tablero: Rect = {
    x: bandaCentral.x + (bandaCentral.ancho - tamano) / 2,
    y: bandaCentral.y + (bandaCentral.alto - tamano) / 2,
    ancho: tamano,
    alto: tamano,
  };

  const celdas = Array.from({ length: lado }, (_, y) =>
    Array.from({ length: lado }, (_, x) => ({
      x: tablero.x + x * (celda + hueco),
      y: tablero.y + y * (celda + hueco),
      ancho: celda,
      alto: celda,
    })),
  );
  return { bandaSuperior, bandaCentral, bandaInferior, tablero, celda, hueco, celdas };
}

/**
 * Dispone la banda inferior para una mano de `numeroDeGranos` fichas: a la derecha, los botones Confirmar (arriba)
 * y Deshacer (abajo), apilados en el alto de la fila; las fichas en una fila centrada en la banda (con el mismo
 * espacio libre a cada lado que ocupan los botones, para que la fila quede centrada sin tocarlos) y la descripción
 * debajo. Las fichas se escalan para caber con cualquier número y
 * cualquier forma de ventana; una ventana degenerada da tamaños 0, nunca NaN.
 */
/** Medidas comunes de la banda inferior, para la mano y para el mazo. */
function geometriaInferior(ventana: Ventana, tema: Tema) {
  const banda = repartirBandas(ventana.ancho, ventana.alto, tema).bandaInferior;
  const p = tema.mano;
  const margen = Math.min(banda.ancho, banda.alto) * p.margen;
  const altoUtil = Math.max(0, banda.alto - 2 * margen);
  const altoFila = altoUtil * p.fila;
  const centroFila = banda.y + margen + altoFila / 2;
  const anchoBoton = Math.max(0, Math.min(banda.ancho * p.anchoBoton, altoUtil * p.anchoBotonPorAlto));
  return { banda, margen, altoUtil, altoFila, centroFila, anchoBoton };
}

export function disponerMano(ventana: Ventana, numeroDeGranos: number, tema: Tema = TEMA): DisposicionMano {
  const { banda, margen, altoUtil, altoFila, centroFila, anchoBoton } = geometriaInferior(ventana, tema);
  const p = tema.mano;
  const n = Number.isInteger(numeroDeGranos) && numeroDeGranos > 0 ? numeroDeGranos : 0;

  const separacion = altoFila * p.separacionBotones;
  const altoBoton = Math.max(0, Math.min(anchoBoton * p.altoBoton, (altoFila - separacion) / 2));
  const xBoton = banda.x + banda.ancho - margen - anchoBoton;
  const confirmar: Rect = { x: xBoton, y: centroFila - separacion / 2 - altoBoton, ancho: anchoBoton, alto: altoBoton };
  const deshacer: Rect = { x: xBoton, y: centroFila + separacion / 2, ancho: anchoBoton, alto: altoBoton };

  // Ancho simétrico disponible para la fila: la banda menos el botón y sus márgenes a cada lado.
  const anchoFila = Math.max(0, banda.ancho - 2 * (2 * margen + anchoBoton));
  // n · 2r + (n − 1) · hueco · 2r = anchoFila, y 2r ≤ altoFila.
  const radio = n === 0 ? 0 : Math.min(altoFila / 2, anchoFila / (2 * n + 2 * (n - 1) * p.hueco));
  const paso = 2 * radio * (1 + p.hueco);
  const centro = banda.x + banda.ancho / 2;
  const fichas = Array.from({ length: n }, (_, i) => ({ x: centro + (i - (n - 1) / 2) * paso, y: centroFila, radio }));

  const descripcion: Rect = {
    x: banda.x + margen,
    y: banda.y + margen + altoFila,
    ancho: Math.max(0, banda.ancho - 2 * margen),
    alto: altoUtil - altoFila,
  };
  return { banda, fichas, descripcion, confirmar, deshacer };
}

/**
 * Texto del mazo en la banda inferior: el hueco de la izquierda de la fila de fichas, del mismo ancho que los botones
 * de la derecha (la fila de fichas deja ese espacio libre a cada lado para quedar centrada). Así no pisa las fichas,
 * los botones ni la línea de información, con cualquier número de fichas.
 */
export function disponerMazo(ventana: Ventana, tema: Tema = TEMA): Rect {
  const { banda, margen, altoFila, anchoBoton } = geometriaInferior(ventana, tema);
  return { x: banda.x + margen, y: banda.y + margen, ancho: anchoBoton, alto: altoFila };
}

export type DisposicionIndicadores = {
  readonly banda: Rect;
  /** Fila de arriba: semilla y lado (izquierda), etiqueta de cadena (centro) y ritmo (derecha). */
  readonly semilla: Rect;
  readonly etiqueta: Rect;
  readonly ritmo: Rect;
  /** Fila de abajo: la barra del medidor, su texto «P / M» a la derecha (fuera de la barra) y las tiradas. */
  readonly barra: Rect;
  readonly textoMedidor: Rect;
  readonly tiradas: Rect;
};

/**
 * Dispone la banda superior en dos filas sin solapes: arriba, la semilla, la etiqueta de cadena y el ritmo; abajo,
 * la barra del medidor, su texto y las fichas de tiradas. Los anchos son fracciones de la banda, así que todo escala
 * con cualquier forma de ventana; una ventana degenerada da tamaños 0, nunca NaN.
 */
export function disponerIndicadores(ventana: Ventana, tema: Tema = TEMA): DisposicionIndicadores {
  const banda = repartirBandas(ventana.ancho, ventana.alto, tema).bandaSuperior;
  const margen = Math.min(banda.ancho, banda.alto) * tema.indicadores.margen;
  const x0 = banda.x + margen;
  const ancho = Math.max(0, banda.ancho - 2 * margen);
  const alto = Math.max(0, banda.alto - 2 * margen);
  const hueco = ancho * 0.02;
  const huecoFilas = alto * 0.08;
  const altoArriba = alto * 0.52;
  const yAbajo = banda.y + margen + altoArriba + huecoFilas;
  const altoAbajo = Math.max(0, alto - altoArriba - huecoFilas);
  const yArriba = banda.y + margen;

  // Columnas de cada fila, de izquierda a derecha, con un hueco entre ellas.
  const columnas = (fracciones: readonly number[], y: number, altoFila: number): Rect[] => {
    const util = Math.max(0, ancho - hueco * (fracciones.length - 1));
    let x = x0;
    return fracciones.map((f) => {
      const r = { x, y, ancho: util * f, alto: altoFila };
      x += util * f + hueco;
      return r;
    });
  };
  const [semilla, etiqueta, ritmo] = columnas([0.27, 0.57, 0.16], yArriba, altoArriba);
  const [zonaBarra, textoMedidor, tiradas] = columnas([0.56, 0.22, 0.22], yAbajo, altoAbajo);
  const vacio: Rect = { x: x0, y: yArriba, ancho: 0, alto: 0 };
  // La barra ocupa el centro vertical de su zona, algo más baja que el texto.
  const zona = zonaBarra ?? vacio;
  const altoBarra = zona.alto * 0.6;
  const barra: Rect = { x: zona.x, y: zona.y + (zona.alto - altoBarra) / 2, ancho: zona.ancho, alto: altoBarra };
  return {
    banda,
    semilla: semilla ?? vacio,
    etiqueta: etiqueta ?? vacio,
    ritmo: ritmo ?? vacio,
    barra,
    textoMedidor: textoMedidor ?? vacio,
    tiradas: tiradas ?? vacio,
  };
}

/** Fichas de tiradas dentro de `area`: `n` círculos iguales en fila, centrados, sin solaparse. */
export function disponerFichasTiradas(area: Rect, n: number): Ficha[] {
  const total = Number.isInteger(n) && n > 0 ? n : 0;
  if (total === 0) return [];
  const hueco = 0.5;
  // total · 2r + (total − 1) · hueco · 2r = ancho, y 2r ≤ alto · 0,8.
  const radio = Math.max(0, Math.min((area.alto * 0.8) / 2, area.ancho / (2 * total + 2 * (total - 1) * hueco)));
  const paso = 2 * radio * (1 + hueco);
  const centro = area.x + area.ancho / 2;
  const y = area.y + area.alto / 2;
  return Array.from({ length: total }, (_, i) => ({ x: centro + (i - (total - 1) / 2) * paso, y, radio }));
}

export type DisposicionFinDeRonda = {
  /** Cubre la banda central, donde está el tablero. */
  readonly velo: Rect;
  readonly titulo: Rect;
  /** Una línea por dato del resultado: los puntos, las tiradas usadas y las estadísticas de la sesión. */
  readonly lineas: readonly Rect[];
  readonly boton: Rect;
  /** La pista de copiar el registro, bajo el botón. */
  readonly pista: Rect;
};

/**
 * Dispone el fin de ronda: un velo sobre la banda central y, dentro, el título, las tres líneas del resultado, el
 * botón «Otra ronda» y la pista de copiar, apilados y centrados. La columna se escala con el menor de los lados del velo, así que cabe en
 * cualquier ventana; una ventana degenerada da tamaños 0, nunca NaN.
 */
export function disponerFinDeRonda(ventana: Ventana, tema: Tema = TEMA): DisposicionFinDeRonda {
  const velo = repartirBandas(ventana.ancho, ventana.alto, tema).bandaCentral;
  const margen = Math.min(velo.ancho, velo.alto) * 0.08;
  const ancho = Math.max(0, velo.ancho - 2 * margen);
  const alto = Math.max(0, velo.alto - 2 * margen);
  // Alto de la columna: limitado por el alto disponible y por el ancho, para no estirarse en ventanas anchas.
  const columna = Math.min(alto, ancho * 0.7);
  const hueco = columna * 0.058;
  let y = velo.y + margen + (alto - columna) / 2;
  const fila = (fraccion: number, anchoFila: number): Rect => {
    const r = { x: velo.x + (velo.ancho - anchoFila) / 2, y, ancho: anchoFila, alto: columna * fraccion };
    y += r.alto + hueco;
    return r;
  };
  // 0,22 + 3 × 0,09 + 0,15 + 0,07 de alto, más cinco huecos de 0,058: la columna entera.
  const titulo = fila(0.22, ancho);
  const lineas = [fila(0.09, ancho), fila(0.09, ancho), fila(0.09, ancho)];
  const boton = fila(0.15, Math.min(ancho, columna * 1.1));
  const pista = fila(0.07, ancho);
  return { velo, titulo, lineas, boton, pista };
}

/** Si `punto` cae dentro del botón «Otra ronda». */
export function botonOtraRondaEn(punto: Punto, fin: DisposicionFinDeRonda): boolean {
  return contiene(fin.boton, punto);
}

const contiene = (r: Rect, p: Punto): boolean => p.x >= r.x && p.x < r.x + r.ancho && p.y >= r.y && p.y < r.y + r.alto;

/** Celda bajo `punto` como `{ x, y }` (columna y fila de `celdas[y][x]`), o `null` fuera del tablero o en un hueco. */
export function celdaEn(punto: Punto, disposicion: Disposicion): Punto | null {
  for (const [y, fila] of disposicion.celdas.entries()) {
    for (const [x, r] of fila.entries()) if (contiene(r, punto)) return { x, y };
  }
  return null;
}

/** Si `punto` cae dentro del botón Confirmar. */
export function botonConfirmarEn(punto: Punto, mano: DisposicionMano): boolean {
  return contiene(mano.confirmar, punto);
}

/** Si `punto` cae dentro del botón Deshacer. */
export function botonDeshacerEn(punto: Punto, mano: DisposicionMano): boolean {
  return contiene(mano.deshacer, punto);
}

/** Índice de la ficha bajo `punto` (dentro de su círculo), o `null` fuera de toda ficha y en los huecos. */
export function fichaEn(punto: Punto, mano: DisposicionMano): number | null {
  const indice = mano.fichas.findIndex((f) => f.radio > 0 && Math.hypot(punto.x - f.x, punto.y - f.y) <= f.radio);
  return indice === -1 ? null : indice;
}
