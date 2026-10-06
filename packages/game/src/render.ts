// Único módulo que usa PixiJS: dibuja lo que describen `disponer`, `disponerMano`, `describirCeldas` y los cuadros de
// la cascada, y traduce clics, toques y teclas a llamadas al controlador puro. No decide nada del juego.
import { Application, Container, Graphics, Text } from 'pixi.js';
import type { FederatedPointerEvent, Ticker } from 'pixi.js';
import type { Estado, Resultado } from '@pila/core';
import { construirCascada } from './cascada.ts';
import type { Cuadro } from './cascada.ts';
import {
  ciclar,
  colocar,
  confirmar,
  deshacer,
  deshacerDesdeFicha,
  iniciarControlador,
  seleccionar,
} from './controlador.ts';
import type { ErrorControlador, EstadoInterfaz, PasoInterfaz } from './controlador.ts';
import { botonConfirmarEn, botonDeshacerEn, celdaEn, disponer, disponerMano, fichaEn } from './disposicion.ts';
import type { Disposicion, DisposicionMano, Punto, Rect } from './disposicion.ts';
import { accionDeTecla } from './entrada.ts';
import { calcularPrevistasConCandidata } from './previsualizacion.ts';
import { avanzar, crearReproductor, cuadroActual, saltar, terminado } from './reproductor.ts';
import type { Reproductor } from './reproductor.ts';
import { TEMA } from './tema.ts';
import type { AspectoBoton } from './tema.ts';
import { TEXTOS, describirError, describirFinDeRonda, describirGrano } from './textos.ts';
import { PATRONES_GRANOS, describirCeldas } from './vista.ts';
import type { CeldaDescrita } from './vista.ts';

export type Escena = {
  /** Muestra un estado nuevo y selecciona su primer grano sin colocar. */
  readonly mostrarEstado: (estado: Estado) => void;
};

/** Cascada en curso: el reproductor y el estado de interfaz que se muestra al terminar. */
type Animacion = { readonly rep: Reproductor; readonly final: EstadoInterfaz };

const manoCompleta = (estado: Estado): boolean => estado.mano.length > 0 && estado.mano.every((g) => g.celda !== null);
const enJuego = (estado: Estado): boolean => estado.fase === 'colocando';

/**
 * Crea la aplicación de PixiJS dentro de `contenedor`, ajustada a la ventana y a la densidad de píxeles, y atiende
 * los gestos del jugador. `semilla` solo se muestra en la banda superior: el estado no la guarda.
 */
export async function crearEscena(contenedor: HTMLElement, semilla: number): Promise<Escena> {
  const app = new Application();
  await app.init({
    background: TEMA.colores.fondo,
    resizeTo: window,
    resolution: window.devicePixelRatio,
    autoDensity: true,
    antialias: true,
  });
  contenedor.appendChild(app.canvas);

  const capa = new Container();
  app.stage.addChild(capa);
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  let ui: EstadoInterfaz | undefined;
  let tablero: Disposicion | undefined;
  let mano: DisposicionMano | undefined;
  /** Celda bajo el ratón, para la vista previa de la candidata; `null` fuera del tablero y con puntero táctil. */
  let celdaRaton: Punto | null = null;
  /** Mensaje de la última acción imposible; se borra con la siguiente acción. */
  let mensaje: string | null = null;
  /** Cascada que se está reproduciendo; mientras exista, la interacción está bloqueada. */
  let animacion: Animacion | null = null;

  const dibujar = (): void => {
    for (const hijo of capa.removeChildren()) hijo.destroy({ children: true });
    if (ui === undefined) return;
    const { estado } = ui;
    const ventana = { ancho: app.screen.width, alto: app.screen.height };
    tablero = disponer(ventana.ancho, ventana.alto, estado.config.lado);
    mano = disponerMano(ventana, estado.mano.length);
    capa.addChild(dibujarInformacion(tablero.bandaSuperior, semilla, estado.config.lado));

    if (animacion !== null) {
      // Durante la cascada se ve la mano que se confirmó, atenuada y sin botones activos.
      capa.addChild(dibujarCuadro(tablero, cuadroActual(animacion.rep)));
      capa.addChild(
        dibujarMano(mano, ui, { linea: TEXTOS.resolviendo, error: false, bloqueada: true, confirmar: false, deshacer: false }),
      );
      return;
    }

    capa.addChild(dibujarTablero(tablero, ui, enJuego(estado) ? celdaRaton : null));
    const seleccionado = ui.seleccionado === null ? undefined : estado.mano[ui.seleccionado];
    const linea = mensaje ?? (seleccionado === undefined ? TEXTOS.manoCompleta : describirGrano(seleccionado.tipo));
    capa.addChild(
      dibujarMano(mano, ui, {
        linea,
        error: mensaje !== null,
        bloqueada: !enJuego(estado),
        confirmar: manoCompleta(estado),
        deshacer: estado.ordenColocacion.length > 0,
      }),
    );
    const fin = describirFinDeRonda(estado);
    if (fin !== null) capa.addChild(dibujarFinDeRonda(tablero.tablero, fin));
  };

  /** Aplica un paso del controlador: un error se muestra como mensaje; si no, cambia el estado. Siempre redibuja. */
  const ejecutar = (paso: Resultado<PasoInterfaz, ErrorControlador>): void => {
    if (paso.ok) {
      ui = paso.valor.ui;
      mensaje = null;
    } else {
      mensaje = describirError(paso.error);
    }
    dibujar();
  };

  /** Termina la cascada en curso y muestra el estado nuevo, con la mano nueva y sin vista previa. */
  const terminarAnimacion = (): void => {
    if (animacion === null) return;
    ui = animacion.final;
    animacion = null;
    celdaRaton = null;
    mensaje = null;
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
    const cascada = construirCascada(estadoAntes.celdas, eventos, estadoAntes.config.lado, estadoAntes.config.umbral);
    if (!cascada.ok) {
      // La tirada ya está resuelta en el núcleo: se muestra el estado nuevo sin animación y se avisa del fallo.
      ui = paso.valor.ui;
      mensaje = describirError(cascada.error);
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
    if (animacion === null) return;
    animacion = { ...animacion, rep: avanzar(animacion.rep, ticker.deltaMS) };
    if (terminado(animacion.rep)) terminarAnimacion();
    else dibujar();
  });

  /** Si el punto cae sobre algo que responde a un clic, para el cursor de mano. */
  const accionable = (p: Punto): boolean => {
    if (ui === undefined || animacion !== null || !enJuego(ui.estado)) return false;
    const { estado, seleccionado } = ui;
    if (tablero !== undefined && seleccionado !== null && celdaEn(p, tablero) !== null) return true;
    if (mano === undefined) return false;
    const ficha = fichaEn(p, mano);
    if (ficha !== null) return estado.mano[ficha]?.celda === null || estado.ordenColocacion.at(-1) === ficha;
    if (manoCompleta(estado) && botonConfirmarEn(p, mano)) return true;
    return estado.ordenColocacion.length > 0 && botonDeshacerEn(p, mano);
  };

  app.stage.on('pointertap', (e: FederatedPointerEvent) => {
    if (ui === undefined) return;
    // Mientras se anima, cualquier clic o toque salta al final; con la ronda terminada no hay interacción.
    if (animacion !== null) return saltarAnimacion();
    if (!enJuego(ui.estado)) return;
    const p = { x: e.global.x, y: e.global.y };
    const celda = tablero === undefined ? null : celdaEn(p, tablero);
    const ficha = mano === undefined ? null : fichaEn(p, mano);
    if (celda !== null) {
      ejecutar(colocar(ui, celda.x, celda.y));
    } else if (ficha !== null) {
      // Una ficha sin colocar se elige; una colocada se deshace si es la última (si no, el error explica por qué).
      ejecutar(ui.estado.mano[ficha]?.celda === null ? seleccionar(ui, ficha) : deshacerDesdeFicha(ui, ficha));
    } else if (mano !== undefined && botonConfirmarEn(p, mano)) {
      intentarConfirmar(ui);
    } else if (mano !== undefined && botonDeshacerEn(p, mano)) {
      ejecutar(deshacer(ui));
    }
  });

  const moverRaton = (celda: Punto | null): void => {
    if (celda?.x === celdaRaton?.x && celda?.y === celdaRaton?.y) return;
    celdaRaton = celda;
    if (animacion === null) dibujar();
  };
  app.stage.on('pointermove', (e: FederatedPointerEvent) => {
    const p = { x: e.global.x, y: e.global.y };
    app.canvas.style.cursor = accionable(p) ? 'pointer' : 'default';
    // Solo el ratón tiene vista previa al pasar: con un dedo no hay «pasar por encima».
    const conVista = e.pointerType === 'mouse' && animacion === null && tablero !== undefined;
    moverRaton(conVista && tablero !== undefined ? celdaEn(p, tablero) : null);
  });
  app.canvas.addEventListener('pointerleave', () => moverRaton(null));

  window.addEventListener('keydown', (e) => {
    if (ui === undefined) return;
    const accion = accionDeTecla({ tecla: e.key, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey });
    if (accion === null) return;
    e.preventDefault();
    if (animacion !== null) {
      // Durante la cascada solo Intro y Espacio hacen algo: saltar al final.
      if (accion.tipo === 'aceptar') saltarAnimacion();
      return;
    }
    if (!enJuego(ui.estado)) return;
    switch (accion.tipo) {
      case 'seleccionar':
        return ejecutar(seleccionar(ui, accion.indice));
      case 'ciclar':
        return ejecutar(ciclar(ui, accion.direccion));
      case 'deshacer':
        return ejecutar(deshacer(ui));
      case 'aceptar':
        return intentarConfirmar(ui);
    }
  });

  app.renderer.on('resize', dibujar);
  return {
    mostrarEstado: (estado) => {
      ui = iniciarControlador(estado);
      animacion = null;
      mensaje = null;
      dibujar();
    },
  };
}

function dibujarInformacion(banda: Rect, semilla: number, lado: number): Text {
  const { proporciones, tipografia, colores } = TEMA;
  const informacion = new Text({
    text: TEXTOS.informacion(semilla, lado),
    style: {
      fontFamily: tipografia.familia,
      fontSize: Math.max(1, banda.alto * proporciones.textoInformacion),
      fontWeight: tipografia.pesoInformacion,
      fill: colores.texto,
    },
  });
  informacion.anchor.set(0.5);
  informacion.position.set(banda.x + banda.ancho / 2, banda.y + banda.alto / 2);
  return informacion;
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

/** Final de ronda provisional (hasta T3.5): un velo sobre el tablero con el resultado y cómo jugar otra. */
function dibujarFinDeRonda(t: Rect, resultado: string): Container {
  const { colores, tipografia, finDeRonda, proporciones } = TEMA;
  const contenedor = new Container();
  if (t.ancho <= 0) return contenedor;
  contenedor.addChild(
    new Graphics()
      .roundRect(t.x, t.y, t.ancho, t.alto, t.ancho * proporciones.radioCelda * 0.3)
      .fill({ color: colores.fondo, alpha: finDeRonda.velo }),
  );
  const lineas: [string, number, 'normal' | 'bold'][] = [
    [resultado, finDeRonda.titulo, tipografia.pesoInformacion],
    [TEXTOS.recargar, finDeRonda.nota, 'normal'],
  ];
  for (const [i, [texto, tamano, peso]] of lineas.entries()) {
    const etiqueta = new Text({
      text: texto,
      style: {
        fontFamily: tipografia.familia,
        fontWeight: peso,
        fontSize: Math.max(1, Math.min(t.ancho * tamano, (t.ancho * 1.6) / Math.max(1, texto.length))),
        fill: colores.texto,
        align: 'center',
      },
    });
    etiqueta.anchor.set(0.5);
    etiqueta.position.set(t.x + t.ancho / 2, t.y + t.alto / 2 + (i === 0 ? -1 : 1) * t.alto * 0.07);
    contenedor.addChild(etiqueta);
  }
  return contenedor;
}
