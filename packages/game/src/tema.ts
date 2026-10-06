// Aspecto provisional del cliente: todos los colores, proporciones y tipografía están aquí. El arte definitivo
// sustituirá estos valores sin tocar la lógica de presentación.

/** Reparto vertical de la ventana en tres bandas horizontales; las fracciones suman 1. */
export type Bandas = {
  /** Indicadores (puntos, meta, tiradas): arriba. */
  readonly superior: number;
  /** Tablero: en el centro. */
  readonly central: number;
  /** Mano: abajo. */
  readonly inferior: number;
};

export type Tema = {
  readonly colores: {
    readonly fondo: number;
    /** Color de una celda estable según su carga: índice 0 a 3. Una carga mayor usa el último. */
    readonly carga: readonly number[];
    /** Color de una celda con `umbral` granos o más. */
    readonly inestable: number;
    readonly texto: number;
    readonly textoSecundario: number;
    /** Color CSS del mensaje de error, que se pinta con el DOM antes de que exista PixiJS. */
    readonly error: string;
  };
  readonly bandas: Bandas;
  readonly proporciones: {
    /** Margen interior de la banda central, como fracción del menor de sus lados. */
    readonly margenTablero: number;
    /** Hueco entre celdas, como fracción del lado de una celda. */
    readonly huecoCelda: number;
    /** Radio de las esquinas, como fracción del lado de una celda. */
    readonly radioCelda: number;
    /** Tamaño del número de la carga, como fracción del lado de una celda. */
    readonly textoCelda: number;
    /** Tamaño del texto de la banda superior, como fracción de su alto. */
    readonly textoInformacion: number;
  };
  readonly tipografia: {
    /** Fuente del sistema. */
    readonly familia: string;
    readonly pesoCarga: 'normal' | 'bold';
  };
};

/** Bandas iniciales: 12 % de indicadores, 63 % de tablero y 25 % de mano. */
export const BANDAS_INICIALES: Bandas = { superior: 0.12, central: 0.63, inferior: 0.25 };

export const TEMA: Tema = {
  colores: {
    fondo: 0x15171c,
    carga: [0x262b35, 0x2f4f73, 0x3f7cad, 0x6fb1d9],
    inestable: 0xe4673f,
    texto: 0xf1f2f4,
    textoSecundario: 0x9097a3,
    error: '#f1a08a',
  },
  bandas: BANDAS_INICIALES,
  proporciones: {
    margenTablero: 0.05,
    huecoCelda: 0.08,
    radioCelda: 0.14,
    textoCelda: 0.42,
    textoInformacion: 0.28,
  },
  tipografia: {
    familia: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    pesoCarga: 'bold',
  },
};
