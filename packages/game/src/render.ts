// Único módulo que usa PixiJS: dibuja lo que describen `disponer`, `disponerMano`, `describirCeldas` y los cuadros de
// la cascada, y traduce clics, toques y teclas a llamadas al controlador puro. No decide nada del juego.
import { Application, Container, Graphics, Text } from 'pixi.js';
import type { FederatedPointerEvent, Ticker } from 'pixi.js';
import type { Estado, Evento, Resultado } from '@pila/core';
import { construirCascada } from './cascada.ts';
import type { Cuadro, Etiqueta, Popup } from './cascada.ts';
import {
  ciclar,
  colocar,
  confirmar,
  deshacer,
  deshacerDesdeFicha,
  seleccionar,
} from './controlador.ts';
import type { ErrorControlador, EstadoInterfaz, PasoInterfaz } from './controlador.ts';
import {
  botonConfirmarEn,
  botonDeshacerEn,
  botonOtraRondaEn,
  celdaEn,
  disponer,
  disponerFichasTiradas,
  disponerFinDeRonda,
  disponerIndicadores,
  disponerMano,
  disponerMazo,
  fichaEn,
} from './disposicion.ts';
import type {
  Disposicion,
  DisposicionFinDeRonda,
  DisposicionIndicadores,
  DisposicionMano,
  Punto,
  Rect,
} from './disposicion.ts';
import { accionDeTecla } from './entrada.ts';
import type { AccionTecla } from './entrada.ts';
import { faseDeFlujo, interpretarAceptar, permitida } from './flujo.ts';
import type { AccionFlujo, FaseFlujo } from './flujo.ts';
import {
  colorMedidor,
  describirIndicadores,
  fichasTiradas,
  intensidadPulso,
  proporcionMedidor,
  puntosMostrados,
  suavizar,
} from './indicadores.ts';
import type { Indicadores } from './indicadores.ts';
import { LADO_MAXIMO } from './parametros.ts';
import { calcularPrevistasConCandidata } from './previsualizacion.ts';
import { avanzar, crearReproductor, cuadroActual, saltar, terminado } from './reproductor.ts';
import type { Reproductor } from './reproductor.ts';
import { RITMO_POR_DEFECTO, formatearRitmo, siguienteRitmo } from './ritmo.ts';
import { TEMA } from './tema.ts';
import type { AspectoBoton } from './tema.ts';
import type { TextosFinDeRonda } from './textos.ts';
import { TEXTOS, describirError, describirFinDeRonda, describirGrano, formatearPuntos, lineasMazo } from './textos.ts';
import { PATRONES_GRANOS, describirCeldas } from './vista.ts';
import type { CeldaDescrita } from './vista.ts';

/** Una ronda para mostrar: su estado de interfaz inicial, su semilla y su número en la sesión (desde 1). */
export type Ronda = { readonly ui: EstadoInterfaz; readonly semilla: number; readonly numero: number };

/** Lo que la escena muestra de la sesión: lo da quien lleva el registro. */
export type InfoSesion = {
  readonly jugador: string | null;
  /** Rondas ganadas en la sesión, para la banda superior. */
  readonly ganadas: number;
  /** Línea de estadísticas para el fin de ronda («Sesión: 2 de 3 ganadas · …»). */
  readonly linea: string;
};

export type Escena = {
  /** Empieza a mostrar una ronda: borra cualquier cascada o mensaje pendiente y pone el medidor sin animación. */
  readonly mostrarRonda: (ronda: Ronda) => void;
  /** Muestra un mensaje en la línea de información hasta la siguiente acción; `error` lo pinta como error. */
  readonly mostrarMensaje: (texto: string, error?: boolean) => void;
  /** Actualiza lo que se muestra de la sesión (jugador, ganadas y estadísticas del fin de ronda). */
  readonly fijarSesion: (info: InfoSesion) => void;
};

/**
 * Opciones de la escena. Los avisos (`al…`) permiten a quien la crea llevar el registro de la ronda sin que la escena
 * sepa nada de él.
 */
export type OpcionesEscena = {
  /** Ritmo inicial de la animación; las teclas `+` y `-` lo cambian. */
  readonly ritmo?: number;
  /** Se llama cuando el jugador pide otra ronda en la fase de fin; quien crea la escena crea la ronda. */
  readonly alPedirOtraRonda: () => void;
  /** Se llama con los eventos de cada `Confirmar` aceptado. */
  readonly alConfirmar?: (eventos: readonly Evento[]) => void;
  /** Se llama con cada Deshacer aceptado, también el de una ficha. */
  readonly alDeshacer?: () => void;
  /** Se llama una vez por ronda, con el estado final, cuando se llega al fin de ronda (tras su última cascada). */
  readonly alFinDeRonda?: (estado: Estado) => void;
  /** Se llama al pedir copiar el registro (tecla C). */
  readonly alCopiar?: () => void;
};

/** Cascada en curso: el reproductor y el estado de interfaz que se muestra al terminar. */
type Animacion = { readonly rep: Reproductor; readonly final: EstadoInterfaz };

const manoCompleta = (estado: Estado): boolean => estado.mano.length > 0 && estado.mano.every((g) => g.celda !== null);

/**
 * Máximo de puntos flotantes a la vez: los granos que salen en una oleada, como mucho uno por cada lado exterior
 * de las celdas del borde, `4 × lado`, con el lado máximo. La reserva de textos nunca pasa de aquí.
 */
const MAXIMO_POPUPS = 4 * LADO_MAXIMO;

/**
 * Crea la aplicación de PixiJS dentro de `contenedor`, ajustada a la ventana y a la densidad de píxeles, y atiende
 * los gestos del jugador. Qué entrada se acepta lo decide solo la fase del flujo (`faseDeFlujo` y `permitida`).
 */
export async function crearEscena(contenedor: HTMLElement, opciones: OpcionesEscena): Promise<Escena> {
  const app = new Application();
  await app.init({
    background: TEMA.colores.fondo,
    resizeTo: window,
    resolution: window.devicePixelRatio,
    autoDensity: true,
    antialias: true,
  });
  contenedor.appendChild(app.canvas);

  // Capas: el tablero se redibuja en cada cuadro de una cascada; la mano, el mazo, el contorno de las celdas
  // cargadas y el final de ronda, solo al cambiar el estado; los puntos flotantes y la banda superior (con el
  // medidor y las tiradas) son objetos persistentes que se actualizan en cada cuadro.
  const capaTablero = new Container();
  const capaCargadas = new Container();
  const capaMano = new Container();
  const capaPopups = new Container();
  const capaFin = new Container();
  const bandaSuperior = crearBandaSuperior();
  app.stage.addChild(capaTablero, capaCargadas, capaMano, capaPopups, capaFin, bandaSuperior.contenedor);
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  const mostrarPopups = crearReservaPopups(capaPopups, MAXIMO_POPUPS);

  let ui: EstadoInterfaz | undefined;
  let tablero: Disposicion | undefined;
  let mano: DisposicionMano | undefined;
  /** Celda bajo el ratón, para la vista previa de la candidata; `null` fuera del tablero y con puntero táctil. */
  let celdaRaton: Punto | null = null;
  /** Mensaje de la última acción imposible; se borra con la siguiente acción. */
  let mensaje: string | null = null;
  /** Si el mensaje es un error (rojo claro) o un aviso (color normal). */
  let mensajeEsError = true;
  let sesion: InfoSesion = { jugador: null, ganadas: 0, linea: '' };
  /** Si ya se avisó del fin de la ronda en curso. */
  let finAvisado = false;
  /** Cascada que se está reproduciendo; mientras exista, la interacción está bloqueada. */
  let animacion: Animacion | null = null;
  let ritmo = opciones.ritmo ?? RITMO_POR_DEFECTO;
  /** Semilla y número de la ronda en curso, para la banda superior (el estado no guarda la semilla). */
  let semilla = 0;
  let numeroRonda = 1;
  let fin: DisposicionFinDeRonda | undefined;
  /** Puntos que muestra el relleno del medidor, suavizados hacia `puntosMostrados`. */
  let medidor = 0;
  /** Tiempo de reloj acumulado por el ticker, para el pulso de las celdas cargadas. */
  let reloj = 0;
  let indicadores: DisposicionIndicadores | undefined;

  const vaciar = (capa: Container): void => {
    for (const hijo of capa.removeChildren()) hijo.destroy({ children: true });
  };

  /** La fase del flujo: la única fuente de verdad de qué entrada se acepta. */
  const fase = (): FaseFlujo | undefined =>
    ui === undefined ? undefined : faseDeFlujo({ animando: animacion !== null, estado: ui.estado });

  /** Puntos que debe mostrar el medidor: durante una cascada suben al terminar cada oleada. */
  const objetivoMedidor = (): number => {
    if (ui === undefined) return 0;
    const cuadro = animacion === null ? null : cuadroActual(animacion.rep);
    return puntosMostrados(ui.estado.puntos, cuadro, ui.estado.puntos);
  };

  /**
   * Indicadores que se muestran. Durante una cascada, las tiradas ya vienen descontadas del estado nuevo; el mazo es el
   * del estado de antes, coherente con la mano confirmada que sigue a la vista.
   */
  const indicadoresActuales = (): Indicadores | undefined => {
    if (ui === undefined) return undefined;
    const base = describirIndicadores(ui.estado, objetivoMedidor());
    if (animacion === null) return base;
    return { ...base, tiradas: describirIndicadores(animacion.final.estado).tiradas };
  };

  /** Actualiza la banda superior y, durante una cascada, el tablero y los puntos flotantes con el cuadro actual. */
  const dibujarCuadroActual = (): void => {
    const info = indicadoresActuales();
    if (ui === undefined || tablero === undefined || indicadores === undefined || info === undefined) return;
    const cuadro = animacion === null ? null : cuadroActual(animacion.rep);
    bandaSuperior.actualizar(indicadores, TEXTOS.informacion(numeroRonda, sesion.ganadas, semilla, ui.estado.config.lado, sesion.jugador), ritmo, cuadro, info, medidor);
    if (cuadro === null) {
      mostrarPopups([], tablero);
      return;
    }
    vaciar(capaTablero);
    capaTablero.addChild(dibujarCuadro(tablero, cuadro));
    mostrarPopups(cuadro.popups, tablero);
  };

  const dibujar = (): void => {
    vaciar(capaTablero);
    vaciar(capaMano);
    vaciar(capaFin);
    if (ui === undefined) return;
    const { estado } = ui;
    const ventana = { ancho: app.screen.width, alto: app.screen.height };
    tablero = disponer(ventana.ancho, ventana.alto, estado.config.lado);
    mano = disponerMano(ventana, estado.mano.length);
    indicadores = disponerIndicadores(ventana);
    fin = disponerFinDeRonda(ventana);
    const jugando = fase() === 'jugando';
    vaciar(capaCargadas);
    capaMano.addChild(dibujarMazo(disponerMazo(ventana), describirIndicadores(estado).mazo));

    if (animacion !== null) {
      // Durante la cascada se ve la mano que se confirmó, atenuada y sin botones activos.
      capaMano.addChild(
        dibujarMano(mano, ui, { linea: TEXTOS.resolviendo, error: false, bloqueada: true, confirmar: false, deshacer: false }),
      );
      dibujarCuadroActual();
      return;
    }

    capaTablero.addChild(dibujarTablero(tablero, ui, jugando ? celdaRaton : null));
    // Las celdas a un grano de caer, solo mientras se coloca: su contorno pulsa con el ticker.
    if (jugando) capaCargadas.addChild(dibujarCargadas(tablero, describirCeldas(estado.celdas, estado.config.umbral)));
    const seleccionado = ui.seleccionado === null ? undefined : estado.mano[ui.seleccionado];
    const linea = mensaje ?? (seleccionado === undefined ? TEXTOS.manoCompleta : describirGrano(seleccionado.tipo));
    capaMano.addChild(
      dibujarMano(mano, ui, {
        linea,
        error: mensaje !== null && mensajeEsError,
        bloqueada: !jugando,
        confirmar: manoCompleta(estado),
        deshacer: estado.ordenColocacion.length > 0,
      }),
    );
    const resultado = describirFinDeRonda(estado);
    if (resultado !== null) capaFin.addChild(dibujarFinDeRonda(fin, resultado, sesion.linea, estado.fase === 'ganada'));
    dibujarCuadroActual();
  };

  /** Aplica un paso del controlador: un error se muestra como mensaje; si no, cambia el estado. Siempre redibuja. */
  const ejecutar = (paso: Resultado<PasoInterfaz, ErrorControlador>): void => {
    if (paso.ok) {
      ui = paso.valor.ui;
      mensaje = null;
    } else {
      mensaje = describirError(paso.error);
      mensajeEsError = true;
    }
    dibujar();
  };

  /** Como `ejecutar`, avisando de cada Deshacer aceptado. */
  const ejecutarDeshacer = (paso: Resultado<PasoInterfaz, ErrorControlador>): void => {
    if (paso.ok) opciones.alDeshacer?.();
    ejecutar(paso);
  };

  /** Avisa una sola vez por ronda de que se llegó al fin, antes de dibujarlo, para que las estadísticas ya cuenten. */
  const avisarSiTermino = (): void => {
    if (ui === undefined || finAvisado || fase() !== 'fin') return;
    finAvisado = true;
    opciones.alFinDeRonda?.(ui.estado);
  };

  /** Termina la cascada en curso y muestra el estado nuevo, con la mano nueva y sin vista previa. */
  const terminarAnimacion = (): void => {
    if (animacion === null) return;
    ui = animacion.final;
    animacion = null;
    celdaRaton = null;
    mensaje = null;
    avisarSiTermino();
    dibujar();
  };

  /** Confirma la tirada y empieza su cascada; un error del controlador o de la cascada se muestra como mensaje. */
  const intentarConfirmar = (actual: EstadoInterfaz): void => {
    const paso = confirmar(actual);
    if (!paso.ok) {
      ejecutar(paso);
      return;
    }
    const { estadoAntes, eventos } = paso.valor;
    opciones.alConfirmar?.(eventos);
    const { lado, umbral, multiplicadorPorOleada } = estadoAntes.config;
    const cascada = construirCascada(estadoAntes.celdas, eventos, lado, umbral, multiplicadorPorOleada);
    if (!cascada.ok) {
      // La tirada ya está resuelta en el núcleo: se muestra el estado nuevo sin animación y se avisa del fallo.
      ui = paso.valor.ui;
      mensaje = describirError(cascada.error);
      mensajeEsError = true;
      avisarSiTermino();
      dibujar();
      return;
    }
    animacion = { rep: crearReproductor(cascada.valor), final: paso.valor.ui };
    mensaje = null;
    celdaRaton = null;
    if (terminado(animacion.rep)) terminarAnimacion();
    else dibujar();
  };

  /** Salta al final de la cascada en curso. */
  const saltarAnimacion = (): void => {
    if (animacion === null) return;
    animacion = { ...animacion, rep: saltar(animacion.rep) };
    terminarAnimacion();
  };

  app.ticker.add((ticker: Ticker) => {
    reloj += ticker.deltaMS;
    const { cargada, medidor: estiloMedidor } = TEMA.indicadores;
    capaCargadas.alpha = cargada.alfaMinima + (cargada.alfaMaxima - cargada.alfaMinima) * intensidadPulso(reloj, cargada.periodoMs);
    if (animacion !== null) {
      animacion = { ...animacion, rep: avanzar(animacion.rep, ticker.deltaMS, ritmo) };
      if (terminado(animacion.rep)) terminarAnimacion();
    }
    // El relleno del medidor se acerca a su objetivo al ritmo de la animación.
    medidor = suavizar(medidor, objetivoMedidor(), ticker.deltaMS * ritmo, estiloMedidor.constanteMs);
    dibujarCuadroActual();
  });

  /** Ejecuta una acción de entrada si la fase la permite; si no, no hace nada. */
  const intentar = (accion: AccionFlujo, ejecutarAccion: (actual: EstadoInterfaz) => void): void => {
    const f = fase();
    if (ui === undefined || f === undefined || !permitida(f, accion)) return;
    ejecutarAccion(ui);
  };

  /** Acción de flujo de un clic o toque en `p`, con lo que hay que hacer; `null` si no cae sobre nada. */
  const accionEnPunto = (p: Punto): [AccionFlujo, (actual: EstadoInterfaz) => void] | null => {
    const f = fase();
    if (ui === undefined || f === undefined) return null;
    // Mientras se anima, cualquier clic o toque salta al final.
    if (f === 'animando') return ['saltar', saltarAnimacion];
    if (f === 'fin') return fin !== undefined && botonOtraRondaEn(p, fin) ? ['otraRonda', opciones.alPedirOtraRonda] : null;
    const celda = tablero === undefined ? null : celdaEn(p, tablero);
    if (celda !== null) return ['colocar', (u) => ejecutar(colocar(u, celda.x, celda.y))];
    const ficha = mano === undefined ? null : fichaEn(p, mano);
    if (ficha !== null) {
      // Una ficha sin colocar se elige; una colocada se deshace si es la última (si no, el error explica por qué).
      if (ui.estado.mano[ficha]?.celda === null) return ['seleccionar', (u) => ejecutar(seleccionar(u, ficha))];
      return ['deshacer', (u) => ejecutarDeshacer(deshacerDesdeFicha(u, ficha))];
    }
    if (mano !== undefined && botonConfirmarEn(p, mano)) return ['confirmar', intentarConfirmar];
    if (mano !== undefined && botonDeshacerEn(p, mano)) return ['deshacer', (u) => ejecutarDeshacer(deshacer(u))];
    return null;
  };

  /** Si el punto cae sobre algo que responde a un clic, para el cursor de mano. */
  const accionable = (p: Punto): boolean => {
    const f = fase();
    if (ui === undefined || f === undefined || f === 'animando') return false;
    const accion = accionEnPunto(p);
    if (accion === null || !permitida(f, accion[0])) return false;
    const { estado, seleccionado } = ui;
    switch (accion[0]) {
      case 'colocar':
        return seleccionado !== null;
      case 'deshacer': {
        // En una ficha colocada, solo si es la última; en el botón, si hay algo que deshacer.
        const ficha = mano === undefined ? null : fichaEn(p, mano);
        return ficha === null ? estado.ordenColocacion.length > 0 : estado.ordenColocacion.at(-1) === ficha;
      }
      case 'confirmar':
        return manoCompleta(estado);
      default:
        return true;
    }
  };

  app.stage.on('pointertap', (e: FederatedPointerEvent) => {
    const accion = accionEnPunto({ x: e.global.x, y: e.global.y });
    if (accion !== null) intentar(...accion);
  });

  const moverRaton = (celda: Punto | null): void => {
    if (celda?.x === celdaRaton?.x && celda?.y === celdaRaton?.y) return;
    celdaRaton = celda;
    if (animacion === null) dibujar();
  };
  app.stage.on('pointermove', (e: FederatedPointerEvent) => {
    const p = { x: e.global.x, y: e.global.y };
    app.canvas.style.cursor = accionable(p) ? 'pointer' : 'default';
    // Solo el ratón tiene vista previa al pasar, y solo mientras se juega: con un dedo no hay «pasar por encima».
    const conVista = e.pointerType === 'mouse' && fase() === 'jugando' && tablero !== undefined;
    moverRaton(conVista && tablero !== undefined ? celdaEn(p, tablero) : null);
  });
  app.canvas.addEventListener('pointerleave', () => moverRaton(null));

  /** Acción de flujo de una tecla, con lo que hay que hacer. Intro y Espacio dependen de la fase. */
  const accionDeTeclaEnFase = (accion: AccionTecla, f: FaseFlujo): [AccionFlujo, (actual: EstadoInterfaz) => void] => {
    switch (accion.tipo) {
      case 'seleccionar':
        return ['seleccionar', (u) => ejecutar(seleccionar(u, accion.indice))];
      case 'ciclar':
        return ['ciclar', (u) => ejecutar(ciclar(u, accion.direccion))];
      case 'deshacer':
        return ['deshacer', (u) => ejecutarDeshacer(deshacer(u))];
      case 'ritmo':
        return [
          'ritmo',
          () => {
            ritmo = siguienteRitmo(ritmo, accion.direccion);
            dibujarCuadroActual();
          },
        ];
      case 'otraRonda':
        return ['otraRonda', opciones.alPedirOtraRonda];
      case 'copiar':
        return ['copiar', () => opciones.alCopiar?.()];
      case 'aceptar': {
        const significado = interpretarAceptar(f);
        if (significado === 'saltar') return ['saltar', saltarAnimacion];
        if (significado === 'otraRonda') return ['otraRonda', opciones.alPedirOtraRonda];
        return ['confirmar', intentarConfirmar];
      }
    }
  };

  window.addEventListener('keydown', (e) => {
    const f = fase();
    if (f === undefined) return;
    const accion = accionDeTecla({ tecla: e.key, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey });
    if (accion === null) return;
    e.preventDefault();
    intentar(...accionDeTeclaEnFase(accion, f));
  });

  app.renderer.on('resize', dibujar);
  return {
    mostrarRonda: (ronda) => {
      ui = ronda.ui;
      semilla = ronda.semilla;
      numeroRonda = ronda.numero;
      animacion = null;
      mensaje = null;
      celdaRaton = null;
      finAvisado = false;
      // El medidor arranca en los puntos de la ronda (0 en una nueva), sin animación.
      medidor = ronda.ui.estado.puntos;
      dibujar();
    },
    mostrarMensaje: (texto, error = true) => {
      mensaje = texto;
      mensajeEsError = error;
      dibujar();
    },
    fijarSesion: (info) => {
      sesion = info;
      dibujar();
    },
  };
}

/** Asigna una propiedad solo si cambia, para no regenerar la textura de un texto sin necesidad. */
function fijar<T, K extends keyof T>(objeto: T, clave: K, valor: T[K]): void {
  if (objeto[clave] !== valor) objeto[clave] = valor;
}

/** Tamaño de letra que cabe en `ancho` para `texto` (aproximando el ancho medio de un carácter), sin pasar de `maximo`. */
function tamanoQueCabe(texto: string, ancho: number, maximo: number): number {
  return Math.max(1, Math.min(maximo, ancho / (Math.max(1, texto.length) * 0.58)));
}

/** Coloca un texto con el tamaño que cabe en `r` (sin pasar de `fraccion` de su alto) y lo devuelve. */
function encajar(t: Text, valor: string, r: Rect, fraccion: number): void {
  fijar(t, 'text', valor);
  fijar(t.style, 'fontSize', tamanoQueCabe(valor, r.ancho, r.alto * fraccion));
}

/**
 * Banda superior con objetos persistentes. Arriba: la semilla y el lado a la izquierda, la etiqueta de cadena
 * «Oleada k · ×m · +P» centrada (solo durante una cascada, con el multiplicador resaltado) y el ritmo a la derecha.
 * Abajo: la barra del medidor con su relleno, su texto «P / M» a la derecha y las fichas de tiradas.
 */
function crearBandaSuperior() {
  const { colores, tipografia, bandaSuperior: estilo, indicadores: estiloIndicadores } = TEMA;
  const contenedor = new Container();
  const texto = (color: number, peso: 'normal' | 'bold'): Text =>
    new Text({ text: '', style: { fontFamily: tipografia.familia, fontWeight: peso, fontSize: 12, fill: color } });
  const informacion = texto(colores.texto, tipografia.pesoInformacion);
  const oleada = texto(estilo.etiqueta.color, 'bold');
  const multiplicador = texto(estilo.etiqueta.resaltado, 'bold');
  const puntos = texto(estilo.etiqueta.color, 'bold');
  const ritmo = texto(estilo.ritmo.color, 'normal');
  const textoMedidor = texto(estiloIndicadores.medidor.texto, 'bold');
  const barra = new Graphics();
  const relleno = new Graphics();
  const tiradas = new Graphics();
  informacion.anchor.set(0, 0.5);
  for (const t of [oleada, multiplicador, puntos, textoMedidor]) t.anchor.set(0, 0.5);
  ritmo.anchor.set(1, 0.5);
  contenedor.addChild(barra, relleno, tiradas, informacion, oleada, multiplicador, puntos, ritmo, textoMedidor);

  const actualizar = (
    d: DisposicionIndicadores,
    textoInformacion: string,
    valorRitmo: number,
    cuadro: Cuadro | null,
    info: Indicadores,
    puntosRelleno: number,
  ): void => {
    const centro = (r: Rect): number => r.y + r.alto / 2;

    encajar(informacion, textoInformacion, d.semilla, 0.62);
    informacion.position.set(d.semilla.x, centro(d.semilla));
    encajar(ritmo, TEXTOS.ritmo(formatearRitmo(valorRitmo)), d.ritmo, estilo.ritmo.tamano);
    ritmo.position.set(d.ritmo.x + d.ritmo.ancho, centro(d.ritmo));

    // Medidor: fondo de la barra, relleno según los puntos suavizados y texto «P / M» fuera de la barra.
    const b = d.barra;
    const radio = b.alto / 2;
    barra.clear();
    relleno.clear();
    if (b.ancho > 0 && b.alto > 0) {
      barra.roundRect(b.x, b.y, b.ancho, b.alto, radio).fill(estiloIndicadores.medidor.barra);
      const proporcion = proporcionMedidor(puntosRelleno, info.medidor.meta);
      const ancho = b.ancho * proporcion;
      if (ancho > 0) relleno.roundRect(b.x, b.y, ancho, b.alto, Math.min(radio, ancho / 2)).fill(colorMedidor(proporcion));
    }
    encajar(textoMedidor, info.medidor.texto, d.textoMedidor, 0.8);
    textoMedidor.position.set(d.textoMedidor.x, centro(d.textoMedidor));

    // Tiradas: llenas las que quedan; las gastadas, solo el contorno.
    tiradas.clear();
    const llenas = fichasTiradas(info.tiradas);
    const { llena, vacia, grosorVacia } = estiloIndicadores.tiradas;
    for (const [i, f] of disponerFichasTiradas(d.tiradas, llenas.length).entries()) {
      if (f.radio <= 0) continue;
      if (llenas[i] === true) tiradas.circle(f.x, f.y, f.radio).fill(llena);
      else {
        const w = f.radio * grosorVacia;
        tiradas.circle(f.x, f.y, f.radio - w / 2).stroke({ width: w, color: vacia });
      }
    }

    const etiqueta: Etiqueta | null = cuadro?.etiqueta ?? null;
    for (const t of [oleada, multiplicador, puntos]) t.visible = etiqueta !== null;
    if (etiqueta === null || cuadro === null) return;
    const partes: [Text, string][] = [
      [oleada, TEXTOS.oleada(etiqueta.oleada)],
      [multiplicador, etiqueta.multiplicador],
      [puntos, TEXTOS.puntosDeTirada(formatearPuntos(cuadro.puntosTirada))],
    ];
    const completo = partes.map(([, t]) => t).join('');
    const tamano = tamanoQueCabe(completo, d.etiqueta.ancho, d.etiqueta.alto * estilo.etiqueta.tamano);
    for (const [t, valor] of partes) {
      fijar(t, 'text', valor);
      fijar(t.style, 'fontSize', tamano);
    }
    // Las tres partes, una detrás de otra, centradas en conjunto en su rectángulo.
    let x = d.etiqueta.x + d.etiqueta.ancho / 2 - partes.reduce((suma, [t]) => suma + t.width, 0) / 2;
    for (const [t] of partes) {
      t.position.set(x, centro(d.etiqueta));
      x += t.width;
    }
  };
  return { contenedor, actualizar };
}

/** Texto del mazo en su rectángulo, una línea por recuento («Mazo 17», «Normal 12»…). */
function dibujarMazo(r: Rect, mazo: Indicadores['mazo']): Container {
  const { tipografia, indicadores } = TEMA;
  const contenedor = new Container();
  if (r.ancho <= 0 || r.alto <= 0) return contenedor;
  const lineas = lineasMazo(mazo);
  const larga = lineas.reduce((a, l) => (l.length > a.length ? l : a), '');
  const t = new Text({
    text: lineas.join('\n'),
    style: {
      fontFamily: tipografia.familia,
      fontSize: tamanoQueCabe(larga, r.ancho, r.alto / (lineas.length * 1.3)),
      fill: indicadores.mazo.texto,
      lineHeight: (r.alto / lineas.length) * 0.95,
    },
  });
  t.anchor.set(0, 0.5);
  t.position.set(r.x, r.y + r.alto / 2);
  contenedor.addChild(t);
  return contenedor;
}

/**
 * Contorno de las celdas cargadas (a un grano de caer), por fuera de la celda, en el hueco: así se distingue sobre
 * el fondo y no tapa los puntos. La opacidad de la capa pulsa con el ticker.
 */
function dibujarCargadas(d: Disposicion, celdas: readonly CeldaDescrita[]): Graphics {
  const { proporciones, indicadores } = TEMA;
  const g = new Graphics();
  if (d.celda <= 0) return g;
  const w = d.hueco * indicadores.cargada.grosor;
  for (const c of celdas) {
    const r = d.celdas[c.y]?.[c.x];
    if (!c.cargada || r === undefined || w <= 0) continue;
    g.roundRect(r.x - w / 2, r.y - w / 2, r.ancho + w, r.alto + w, r.ancho * proporciones.radioCelda + w / 2).stroke({
      width: w,
      color: indicadores.cargada.color,
    });
  }
  return g;
}

/**
 * Reserva de textos para los puntos flotantes: crea como mucho `maximo` objetos de texto, la primera vez que hacen
 * falta, y los reutiliza en cada cuadro (cambiando texto, posición, escala y opacidad); los que sobran se ocultan.
 */
function crearReservaPopups(capa: Container, maximo: number) {
  const { tipografia, animacion } = TEMA;
  const estilo = animacion.popups;
  const textos: Text[] = [];
  return (popups: readonly Popup[], d: Disposicion): void => {
    const tamano = Math.max(1, d.celda * estilo.tamano);
    for (let i = 0; i < maximo; i++) {
      const p = popups[i];
      let t = textos[i];
      if (p === undefined || d.celda <= 0) {
        if (t !== undefined) t.visible = false;
        continue;
      }
      if (t === undefined) {
        t = new Text({
          text: '',
          style: {
            fontFamily: tipografia.familia,
            fontWeight: 'bold',
            fontSize: tamano,
            fill: estilo.relleno,
            stroke: { color: estilo.contorno, width: tamano * estilo.grosorContorno },
          },
        });
        t.anchor.set(0.5);
        textos.push(t);
        capa.addChild(t);
      }
      fijar(t, 'text', p.texto);
      if (t.style.fontSize !== tamano) {
        t.style.fontSize = tamano;
        t.style.stroke = { color: estilo.contorno, width: tamano * estilo.grosorContorno };
      }
      const paso = d.celda + d.hueco;
      t.position.set(d.tablero.x + d.celda / 2 + p.x * paso, d.tablero.y + d.celda / 2 + p.y * paso);
      t.scale.set(p.escala);
      t.alpha = p.opacidad;
      t.visible = true;
    }
  };
}

function dibujarTablero(d: Disposicion, ui: EstadoInterfaz, celdaRaton: Punto | null): Container {
  const contenedor = new Container();
  if (d.celda <= 0) return contenedor;
  const { estado } = ui;
  const { previstas, candidata } = calcularPrevistasConCandidata(estado, ui.seleccionado, celdaRaton);
  for (const c of describirCeldas(estado.celdas, estado.config.umbral, previstas, candidata)) {
    const r = d.celdas[c.y]?.[c.x];
    if (r !== undefined) contenedor.addChild(dibujarCelda(r, c));
  }
  return contenedor;
}

/** Centro en píxeles de una posición en unidades de celda (el centro de la celda `(x, y)` es `(x, y)`). */
function aPixeles(d: Disposicion, x: number, y: number): Punto {
  const paso = d.celda + d.hueco;
  return { x: d.tablero.x + d.celda / 2 + x * paso, y: d.tablero.y + d.celda / 2 + y * paso };
}

/** Dibuja un cuadro de la cascada: la carga mostrada, las alertas, las apariciones y los granos en vuelo. */
function dibujarCuadro(d: Disposicion, cuadro: Cuadro): Container {
  const { animacion } = TEMA;
  const contenedor = new Container();
  if (d.celda <= 0) return contenedor;
  const clave = (x: number, y: number): string => `${x},${y}`;
  const alertas = new Map(cuadro.alertas.map((a) => [clave(a.x, a.y), a.intensidad]));
  const apariciones = new Map(cuadro.adiciones.map((a) => [clave(a.x, a.y), a.progreso]));
  // Con umbral infinito, el color de cada celda es el de su carga: lo inestable se ve con el parpadeo de la alerta.
  for (const c of describirCeldas(cuadro.celdas, Number.POSITIVE_INFINITY)) {
    const r = d.celdas[c.y]?.[c.x];
    if (r === undefined) continue;
    const celda = dibujarCelda(r, c, alertas.get(clave(c.x, c.y)) ?? 0);
    const progreso = apariciones.get(clave(c.x, c.y));
    if (progreso !== undefined) {
      // Aparición: la celda crece un poco y vuelve a su tamaño a lo largo del paso.
      const cx = r.x + r.ancho / 2;
      const cy = r.y + r.alto / 2;
      celda.pivot.set(cx, cy);
      celda.position.set(cx, cy);
      celda.scale.set(1 + animacion.escalaAparicion * Math.sin(Math.PI * progreso));
    }
    contenedor.addChild(celda);
  }

  const { radio, relleno, contorno, grosorContorno } = animacion.granoVuelo;
  const r = d.celda * radio;
  const granos = new Graphics();
  for (const g of cuadro.granosEnVuelo) {
    const p = aPixeles(d, g.x, g.y);
    const w = r * grosorContorno;
    granos
      .circle(p.x, p.y, r - w / 2)
      .fill({ color: relleno, alpha: g.opacidad })
      .stroke({ width: w, color: contorno, alpha: g.opacidad });
  }
  contenedor.addChild(granos);
  return contenedor;
}

/** Dibuja una celda; `alerta` (0 a 1) superpone el parpadeo en el color de inestable. */
function dibujarCelda(r: Rect, c: CeldaDescrita, alerta = 0): Container {
  const { proporciones, tipografia, colores, granos, contornoPrevisto, animacion } = TEMA;
  const contenedor = new Container();
  const radioEsquina = r.ancho * proporciones.radioCelda;
  const g = new Graphics().roundRect(r.x, r.y, r.ancho, r.alto, radioEsquina).fill(c.color);
  if (alerta > 0) {
    g.roundRect(r.x, r.y, r.ancho, r.alto, radioEsquina).fill({
      color: colores.inestable,
      alpha: alerta * animacion.opacidadAlerta,
    });
  }

  if (c.inestablePrevista) {
    // Trazo exterior en el borde y filete interior justo dentro, ambos dentro de la celda.
    const w = r.ancho * contornoPrevisto.grosor;
    const trazo = (inset: number, color: number) =>
      g
        .roundRect(r.x + inset, r.y + inset, r.ancho - 2 * inset, r.alto - 2 * inset, Math.max(0, radioEsquina - inset))
        .stroke({ width: w, color });
    trazo(w / 2, contornoPrevisto.exterior);
    trazo((3 * w) / 2, contornoPrevisto.interior);
  }

  const cx = r.x + r.ancho / 2;
  const cy = r.y + r.alto / 2;
  const radio = c.radioGrano * r.ancho;
  for (const p of c.granos) {
    const x = cx + p.x * r.ancho;
    const y = cy + p.y * r.alto;
    if (p.fantasma) {
      // Solo el contorno, trazado hacia dentro para que el punto no crezca; el de la candidata, más fino y tenue.
      const w = radio * (p.candidata ? granos.candidata.grosor : granos.grosorFantasma);
      const alpha = p.candidata ? granos.candidata.alfa : 1;
      g.circle(x, y, radio - w / 2).stroke({ width: w, color: c.colorTinta, alpha });
    } else {
      g.circle(x, y, radio).fill(colores.grano);
    }
  }
  contenedor.addChild(g);

  if (c.texto !== undefined) {
    const numero = new Text({
      text: c.texto,
      style: {
        fontFamily: tipografia.familia,
        fontWeight: tipografia.pesoCarga,
        fontSize: Math.max(1, r.ancho * proporciones.textoCelda),
        fill: c.colorTinta,
      },
    });
    numero.anchor.set(0.5);
    numero.position.set(cx, cy);
    contenedor.addChild(numero);
  }
  return contenedor;
}

/** Qué muestra la banda inferior: la línea de información y qué está activo. */
type OpcionesMano = {
  readonly linea: string;
  /** La línea es un mensaje de error. */
  readonly error: boolean;
  /** Fichas y botones atenuados: hay una cascada en curso o la ronda terminó. */
  readonly bloqueada: boolean;
  readonly confirmar: boolean;
  readonly deshacer: boolean;
};

function dibujarBoton(r: Rect, texto: string, estilo: AspectoBoton): Container {
  const { tipografia, mano: proporciones } = TEMA;
  const contenedor = new Container();
  if (r.ancho <= 0 || r.alto <= 0) return contenedor;
  contenedor.addChild(new Graphics().roundRect(r.x, r.y, r.ancho, r.alto, r.alto * proporciones.radioBoton).fill(estilo.fondo));
  const etiqueta = new Text({
    text: texto,
    style: {
      fontFamily: tipografia.familia,
      fontWeight: tipografia.pesoInformacion,
      // Limitado también por el ancho, para que la palabra quepa en el botón.
      fontSize: Math.max(1, Math.min(r.alto * proporciones.textoBoton, (r.ancho * 1.3) / Math.max(1, texto.length))),
      fill: estilo.texto,
    },
  });
  etiqueta.anchor.set(0.5);
  etiqueta.position.set(r.x + r.ancho / 2, r.y + r.alto / 2);
  contenedor.addChild(etiqueta);
  return contenedor;
}

function dibujarMano(d: DisposicionMano, ui: EstadoInterfaz, opciones: OpcionesMano): Container {
  const { fichas: aspecto, colores, granos, tipografia, mano: proporciones, boton, botonPrimario } = TEMA;
  const contenedor = new Container();
  const controles = new Container();
  if (opciones.bloqueada) controles.alpha = proporciones.alfaBloqueada;
  contenedor.addChild(controles);

  for (const [i, f] of d.fichas.entries()) {
    const grano = ui.estado.mano[i];
    if (grano === undefined || f.radio <= 0) continue;
    const a = aspecto.tipos[grano.tipo];
    const ficha = new Graphics();
    const radio = f.radio * a.escala;
    if (a.forma === 'estrella') {
      ficha.star(f.x, f.y, aspecto.estrella.puntas, radio, radio * aspecto.estrella.radioInterior).fill(a.color);
    } else {
      ficha.circle(f.x, f.y, radio).fill(a.color);
    }
    // Los puntos de la ficha usan la disposición de los granos, tomando su diámetro como el lado de una celda.
    const lado = 2 * radio;
    for (const [px, py] of PATRONES_GRANOS[a.puntos] ?? []) {
      ficha.circle(f.x + px * granos.desplazamiento * lado, f.y + py * granos.desplazamiento * lado, granos.radio * lado);
    }
    if (a.puntos > 0) ficha.fill(colores.grano);
    if (grano.celda !== null) ficha.alpha = aspecto.alfaColocada;
    controles.addChild(ficha);

    if (i === ui.seleccionado && !opciones.bloqueada) {
      const w = f.radio * aspecto.anillo.grosor;
      controles.addChild(new Graphics().circle(f.x, f.y, f.radio - w / 2).stroke({ width: w, color: aspecto.anillo.color }));
    }
  }

  controles.addChild(dibujarBoton(d.confirmar, TEXTOS.confirmar, opciones.confirmar ? botonPrimario.activo : botonPrimario.desactivado));
  controles.addChild(dibujarBoton(d.deshacer, TEXTOS.deshacer, opciones.deshacer ? boton.activo : boton.desactivado));

  const rd = d.descripcion;
  if (rd.ancho > 0 && rd.alto > 0) {
    // El tamaño se limita también por el ancho, para que la línea quepa en ventanas estrechas.
    const descripcion = new Text({
      text: opciones.linea,
      style: {
        fontFamily: tipografia.familia,
        fontSize: Math.max(
          1,
          Math.min(rd.alto * proporciones.textoDescripcion, (rd.ancho / Math.max(1, opciones.linea.length)) * 1.8),
        ),
        fill: opciones.error ? colores.error : colores.texto,
      },
    });
    descripcion.anchor.set(0.5);
    descripcion.position.set(rd.x + rd.ancho / 2, rd.y + rd.alto / 2);
    contenedor.addChild(descripcion);
  }
  return contenedor;
}

/**
 * Fin de ronda: un velo sobre el tablero con el título (en el color de ganada o de perdida), las líneas del resultado
 * y el botón primario «Otra ronda».
 */
function dibujarFinDeRonda(d: DisposicionFinDeRonda, textos: TextosFinDeRonda, lineaSesion: string, ganada: boolean): Container {
  const { tipografia, finDeRonda, botonPrimario } = TEMA;
  const contenedor = new Container();
  const v = d.velo;
  if (v.ancho <= 0 || v.alto <= 0) return contenedor;
  contenedor.addChild(new Graphics().rect(v.x, v.y, v.ancho, v.alto).fill({ color: finDeRonda.velo.color, alpha: finDeRonda.velo.opacidad }));
  const linea = (texto: string, r: Rect, color: number, peso: 'normal' | 'bold', fraccion: number): void => {
    if (r.ancho <= 0 || r.alto <= 0) return;
    const t = new Text({
      text: texto,
      style: { fontFamily: tipografia.familia, fontWeight: peso, fontSize: tamanoQueCabe(texto, r.ancho, r.alto * fraccion), fill: color },
    });
    t.anchor.set(0.5);
    t.position.set(r.x + r.ancho / 2, r.y + r.alto / 2);
    contenedor.addChild(t);
  };
  linea(textos.titulo, d.titulo, ganada ? finDeRonda.titulo.ganada : finDeRonda.titulo.perdida, 'bold', 0.85);
  const [puntos, tiradas, estadisticas] = d.lineas;
  if (puntos !== undefined) linea(textos.puntos, puntos, finDeRonda.texto, 'bold', 0.8);
  if (tiradas !== undefined) linea(textos.tiradas, tiradas, finDeRonda.texto, 'normal', 0.8);
  if (estadisticas !== undefined && lineaSesion !== '') linea(lineaSesion, estadisticas, finDeRonda.secundario, 'normal', 0.8);
  contenedor.addChild(dibujarBoton(d.boton, textos.boton, botonPrimario.activo));
  linea(TEXTOS.pistaCopiar, d.pista, finDeRonda.secundario, 'normal', 0.85);
  return contenedor;
}
