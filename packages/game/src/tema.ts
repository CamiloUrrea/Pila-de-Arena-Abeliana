// Aspecto provisional del cliente: todos los colores, proporciones y tipografía están aquí. El arte definitivo
// sustituirá estos valores sin tocar la lógica de presentación.
import type { TipoGrano } from '@pila/core';

/** Reparto vertical de la ventana en tres bandas horizontales; las fracciones suman 1. */
export type Bandas = {
  /** Indicadores (puntos, meta, tiradas): arriba. */
  readonly superior: number;
  /** Tablero: en el centro. */
  readonly central: number;
  /** Mano: abajo. */
  readonly inferior: number;
};

/** Aspecto de una ficha de la mano según su tipo de grano. */
export type AspectoFicha = {
  readonly forma: 'circulo' | 'estrella';
  readonly color: number;
  /** Tamaño como fracción del radio del hueco de la ficha (como mucho 1, para dejar sitio al anillo). */
  readonly escala: number;
  /** Puntos de grano dibujados dentro de la ficha, con `colores.grano`. */
  readonly puntos: number;
};

/** Colores de un estado del botón Deshacer. */
export type AspectoBoton = { readonly fondo: number; readonly texto: number };

export type Tema = {
  readonly colores: {
    readonly fondo: number;
    /** Color de una celda estable según su carga: índice 0 a 3. Una carga mayor usa el último. */
    readonly carga: readonly number[];
    /** Color de una celda con `umbral` granos o más. */
    readonly inestable: number;
    /** Puntos de grano y número de respaldo, sobre cualquier celda con color. */
    readonly grano: number;
    /** Texto de la banda superior y de la descripción del grano. */
    readonly texto: number;
    /**
     * Contorno de los puntos fantasma sobre la celda vacía, donde `grano` casi no se distinguiría. Sobre las
     * demás celdas los fantasmas usan `grano`.
     */
    readonly fantasmaSobreVacia: number;
    /**
     * Mensajes de error: el de la línea de información tras una acción imposible y el que se pinta con el DOM
     * cuando la ronda no puede empezar.
     */
    readonly error: number;
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
    /** Grosor del contorno de un punto fantasma (previsto), como fracción de su radio. */
    readonly grosorFantasma: number;
    /**
     * Fantasmas de la colocación candidata (la del puntero), más tenues que los de las colocaciones hechas: un
     * contorno más fino y con esta opacidad. El contorno de inestable prevista no se atenúa: es un aviso.
     */
    readonly candidata: { readonly grosor: number; readonly alfa: number };
  };
  /**
   * Contorno de una celda que la vista previa vuelve inestable: un trazo exterior y un filete interior. Con dos
   * colores, uno claro y otro oscuro, el contorno se distingue sobre el fondo y sobre cualquier celda.
   */
  readonly contornoPrevisto: {
    readonly exterior: number;
    readonly interior: number;
    /** Grosor de cada trazo, como fracción del lado de la celda. */
    readonly grosor: number;
  };
  /** Banda inferior: la mano, la descripción del grano seleccionado y el botón Deshacer. */
  readonly mano: {
    /** Margen interior de la banda, como fracción del menor de sus lados. */
    readonly margen: number;
    /** Alto de la fila de fichas, como fracción del alto útil de la banda; el resto es para la descripción. */
    readonly fila: number;
    /** Hueco entre fichas, como fracción del diámetro de una ficha. */
    readonly hueco: number;
    /** Ancho máximo del botón, como fracción del ancho de la banda y como múltiplo de su alto útil. */
    readonly anchoBoton: number;
    readonly anchoBotonPorAlto: number;
    /** Alto del botón como fracción de su ancho (sin pasar del alto de la fila). */
    readonly altoBoton: number;
    readonly radioBoton: number;
    /** Tamaño del texto del botón y de la descripción, como fracción del alto de su rectángulo. */
    readonly textoBoton: number;
    readonly textoDescripcion: number;
  };
  readonly fichas: {
    readonly tipos: Readonly<Record<TipoGrano, AspectoFicha>>;
    /** Opacidad de una ficha ya colocada en el tablero. */
    readonly alfaColocada: number;
    /** Anillo de la ficha seleccionada; el grosor es fracción del radio del hueco. */
    readonly anillo: { readonly color: number; readonly grosor: number };
    /** Estrella: número de puntas y radio interior como fracción del exterior. */
    readonly estrella: { readonly puntas: number; readonly radioInterior: number };
  };
  readonly boton: { readonly activo: AspectoBoton; readonly desactivado: AspectoBoton };
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
    fantasmaSobreVacia: 0xf5f0ff,
    error: 0xf1a08a,
  },
  bandas: BANDAS_INICIALES,
  proporciones: {
    margenTablero: 0.05,
    huecoCelda: 0.08,
    radioCelda: 0.14,
    textoCelda: 0.42,
    textoInformacion: 0.28,
  },
  granos: { desplazamiento: 0.25, radio: 0.085, grosorFantasma: 0.3, candidata: { grosor: 0.2, alfa: 0.65 } },
  contornoPrevisto: { exterior: 0xff3d00, interior: 0x0a0420, grosor: 0.045 },
  mano: {
    margen: 0.06,
    fila: 0.62,
    hueco: 0.3,
    anchoBoton: 0.2,
    anchoBotonPorAlto: 1.4,
    altoBoton: 0.4,
    radioBoton: 0.25,
    textoBoton: 0.42,
    textoDescripcion: 0.45,
  },
  fichas: {
    tipos: {
      normal: { forma: 'circulo', color: 0xf5f0ff, escala: 0.62, puntos: 0 },
      pesado: { forma: 'circulo', color: 0xb388ff, escala: 0.84, puntos: 2 },
      explosivo: { forma: 'estrella', color: 0xff1744, escala: 0.88, puntos: 0 },
    },
    alfaColocada: 0.28,
    anillo: { color: 0xf5f0ff, grosor: 0.09 },
    estrella: { puntas: 5, radioInterior: 0.5 },
  },
  boton: {
    activo: { fondo: 0xf5f0ff, texto: 0x0a0420 },
    desactivado: { fondo: 0x22144d, texto: 0x6f6596 },
  },
  tipografia: {
    familia: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    pesoCarga: 'bold',
    pesoInformacion: 'bold',
  },
};
