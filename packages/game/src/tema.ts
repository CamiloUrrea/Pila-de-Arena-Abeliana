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
    /** Puntos de grano y número de respaldo, sobre cualquier celda con color. */
    readonly grano: number;
    /** Texto de la banda superior. */
    readonly texto: number;
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
    /** Tamaño del número de respaldo (10 granos o más), como fracción del lado de una celda. */
    readonly textoCelda: number;
    /** Tamaño del texto de la banda superior, como fracción de su alto. */
    readonly textoInformacion: number;
  };
  /**
   * Puntos de grano, en fracciones del lado de la celda y medidos desde su centro. Con el desplazamiento y el radio
   * deben caber sin tocarse en la cuadrícula de 3×3: `desplazamiento >= 2 * radio` y `desplazamiento + radio <= 0.5`.
   */
  readonly granos: {
    /** Distancia del centro a cada fila o columna exterior de la disposición tipo dado. */
    readonly desplazamiento: number;
    readonly radio: number;
  };
  readonly tipografia: {
    /** Fuente del sistema. */
    readonly familia: string;
    /** Peso del número de respaldo de una celda. */
    readonly pesoCarga: 'normal' | 'bold';
    /** Peso del texto de la banda superior. */
    readonly pesoInformacion: 'normal' | 'bold';
  };
};

/** Bandas iniciales: 12 % de indicadores, 63 % de tablero y 25 % de mano. */
export const BANDAS_INICIALES: Bandas = { superior: 0.12, central: 0.63, inferior: 0.25 };

export const TEMA: Tema = {
  colores: {
    fondo: 0x0a0420,
    // Vacía, cian, amarillo eléctrico y rosa intenso. La vacía es #22144D y no #1A0F3D: así se distingue del fondo.
    carga: [0x22144d, 0x00e5ff, 0xffe600, 0xff2e93],
    inestable: 0xff3d00,
    grano: 0x0a0420,
    texto: 0xf5f0ff,
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
  granos: { desplazamiento: 0.25, radio: 0.085 },
  tipografia: {
    familia: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    pesoCarga: 'bold',
    pesoInformacion: 'bold',
  },
};
