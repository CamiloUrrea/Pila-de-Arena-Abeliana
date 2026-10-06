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

/** Colores de un estado de un botón de la banda inferior. */
export type AspectoBoton = { readonly fondo: number; readonly texto: number };

/** Curvas de aceleración disponibles para los granos en vuelo (ver `aplicarCurva` en `cascada.ts`). */
export type Curva = 'lineal' | 'entradaSalidaCuadratica' | 'entradaSalidaCubica';

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
    /** Alto de cada botón como fracción de su ancho (sin pasar de su mitad de la fila). */
    readonly altoBoton: number;
    /** Separación vertical entre Confirmar (arriba) y Deshacer (abajo), como fracción del alto de la fila. */
    readonly separacionBotones: number;
    readonly radioBoton: number;
    /** Tamaño del texto del botón y de la descripción, como fracción del alto de su rectángulo. */
    readonly textoBoton: number;
    readonly textoDescripcion: number;
    /** Opacidad de fichas y botones mientras la interacción está bloqueada (cascada en curso o ronda terminada). */
    readonly alfaBloqueada: number;
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
  /** Deshacer, el botón secundario. */
  readonly boton: { readonly activo: AspectoBoton; readonly desactivado: AspectoBoton };
  /** Confirmar, el botón primario. */
  readonly botonPrimario: { readonly activo: AspectoBoton; readonly desactivado: AspectoBoton };
  /** Animación de la cascada de una tirada (ver `cascada.ts`). */
  readonly animacion: {
    /** Duración base de cada paso al ritmo 1, en milisegundos. */
    readonly duraciones: { readonly adicion: number; readonly alerta: number; readonly derrumbe: number };
    /** Curva de aceleración de los granos en vuelo. */
    readonly curva: Curva;
    /** Pulsos de intensidad de la alerta en su paso, y opacidad máxima del parpadeo (en el color de inestable). */
    readonly pulsosAlerta: number;
    readonly opacidadAlerta: number;
    /** Distancia que recorre un grano que sale del tablero, en lados de celda desde el centro de su origen. */
    readonly distanciaFuera: number;
    /** Último tramo del vuelo, como fracción del paso, en el que se desvanece un grano que sale del tablero. */
    readonly tramoDesvanecer: number;
    /** Aumento máximo de tamaño de una celda que recibe granos en el paso de adición. */
    readonly escalaAparicion: number;
    /** Granos en vuelo: radio en fracción del lado de la celda, relleno claro y contorno oscuro (fracción del radio). */
    readonly granoVuelo: {
      readonly radio: number;
      readonly relleno: number;
      readonly contorno: number;
      readonly grosorContorno: number;
    };
    /**
     * Aceleración progresiva: la alerta y el derrumbe de la oleada `k` duran la base por
     * `max(minimo, razon^(k − 1))`. La adición no se acelera.
     */
    readonly aceleracion: { readonly razon: number; readonly minimo: number };
    /** Puntos flotantes, uno por grano que sale del tablero. */
    readonly popups: {
      readonly relleno: number;
      readonly contorno: number;
      /** Grosor del contorno, como fracción del tamaño del texto. */
      readonly grosorContorno: number;
      /** Tamaño del texto, como fracción del lado de la celda (antes de la escala por oleada). */
      readonly tamano: number;
      /** Distancia al borde del tablero por el lado por el que sale el grano, en lados de celda. */
      readonly separacion: number;
      /** Lo que sube a lo largo de su vida, en lados de celda. */
      readonly ascenso: number;
      /** Último tramo de su vida, como fracción, en el que se desvanece. */
      readonly desvanecer: number;
      /** Escala por oleada: `min(escalaMaxima, 1 + crecimientoPorOleada × (k − 1))`. */
      readonly crecimientoPorOleada: number;
      readonly escalaMaxima: number;
    };
  };
  /** Banda superior: la etiqueta de cadena y el ritmo. Su disposición la da `disponerIndicadores`. */
  readonly bandaSuperior: {
    readonly etiqueta: {
      /** Tamaño del texto, como fracción del alto de su rectángulo (ver `disponerIndicadores`). */
      readonly tamano: number;
      readonly color: number;
      /** Color del multiplicador, resaltado. */
      readonly resaltado: number;
    };
    /** Tamaño como fracción del alto de su rectángulo, y color. */
    readonly ritmo: { readonly tamano: number; readonly color: number };
  };
  /** Indicadores de la ronda: medidor de desborde, tiradas, mazo y celdas cargadas. */
  readonly indicadores: {
    /** Margen interior de la banda superior, como fracción del menor de sus lados. */
    readonly margen: number;
    readonly medidor: {
      /** Fondo de la barra. */
      readonly barra: number;
      /** Relleno por tramos: menos de la mitad, de la mitad a la meta, y meta alcanzada. */
      readonly relleno: { readonly bajo: number; readonly medio: number; readonly lleno: number };
      /** Texto «P / M», fuera de la barra. */
      readonly texto: number;
      /** Constante de tiempo del suavizado del relleno, en milisegundos al ritmo 1. */
      readonly constanteMs: number;
    };
    /** Fichas de tiradas: llenas las que quedan; vacías (solo contorno) las gastadas. */
    readonly tiradas: { readonly llena: number; readonly vacia: number; readonly grosorVacia: number };
    readonly mazo: { readonly texto: number };
    /**
     * Contorno de las celdas a un grano de caer, por fuera de la celda (en el hueco): color, grosor como fracción
     * del hueco entre celdas, y opacidad que pulsa entre `alfaMinima` y `alfaMaxima` con el período dado.
     */
    readonly cargada: {
      readonly color: number;
      readonly grosor: number;
      readonly periodoMs: number;
      readonly alfaMinima: number;
      readonly alfaMaxima: number;
    };
  };
  /** Texto central del final de ronda, como fracción del lado del tablero. */
  readonly finDeRonda: { readonly titulo: number; readonly nota: number; readonly velo: number };
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
    separacionBotones: 0.08,
    radioBoton: 0.25,
    textoBoton: 0.42,
    textoDescripcion: 0.45,
    alfaBloqueada: 0.4,
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
  botonPrimario: {
    activo: { fondo: 0x00e5ff, texto: 0x0a0420 },
    desactivado: { fondo: 0x22144d, texto: 0x6f6596 },
  },
  animacion: {
    duraciones: { adicion: 300, alerta: 160, derrumbe: 320 },
    curva: 'entradaSalidaCubica',
    pulsosAlerta: 1,
    opacidadAlerta: 0.85,
    distanciaFuera: 1.1,
    tramoDesvanecer: 0.4,
    escalaAparicion: 0.12,
    granoVuelo: { radio: 0.11, relleno: 0xf5f0ff, contorno: 0x0a0420, grosorContorno: 0.3 },
    aceleracion: { razon: 0.9, minimo: 0.4 },
    popups: {
      relleno: 0xffe600,
      contorno: 0x0a0420,
      grosorContorno: 0.18,
      tamano: 0.3,
      separacion: 0.3,
      ascenso: 0.5,
      desvanecer: 0.4,
      crecimientoPorOleada: 0.15,
      escalaMaxima: 2,
    },
  },
  bandaSuperior: {
    etiqueta: { tamano: 0.85, color: 0xf5f0ff, resaltado: 0xffe600 },
    ritmo: { tamano: 0.6, color: 0xb8aee0 },
  },
  indicadores: {
    margen: 0.08,
    medidor: {
      barra: 0x22144d,
      relleno: { bajo: 0x00e5ff, medio: 0xffe600, lleno: 0xff2e93 },
      texto: 0xf5f0ff,
      constanteMs: 180,
    },
    tiradas: { llena: 0xf5f0ff, vacia: 0x6f6596, grosorVacia: 0.25 },
    mazo: { texto: 0xb8aee0 },
    cargada: { color: 0xf5f0ff, grosor: 0.5, periodoMs: 1200, alfaMinima: 0.5, alfaMaxima: 1 },
  },
  finDeRonda: { titulo: 0.09, nota: 0.045, velo: 0.82 },
  tipografia: {
    familia: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    pesoCarga: 'bold',
    pesoInformacion: 'bold',
  },
};
