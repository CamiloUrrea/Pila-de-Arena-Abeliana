// Único módulo que usa PixiJS: dibuja lo que describen `disponer`, `disponerMano` y `describirCeldas`, y traduce
// clics, toques y teclas a llamadas al controlador puro. No decide nada del juego.
import { Application, Container, Graphics, Text } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import type { Estado, Resultado } from '@pila/core';
import { ciclar, colocar, deshacer, deshacerDesdeFicha, iniciarControlador, seleccionar } from './controlador.ts';
import type { ErrorControlador, EstadoInterfaz, PasoInterfaz } from './controlador.ts';
import { botonDeshacerEn, celdaEn, disponer, disponerMano, fichaEn } from './disposicion.ts';
import type { Disposicion, DisposicionMano, Punto, Rect } from './disposicion.ts';
import { accionDeTecla } from './entrada.ts';
import { calcularPrevistasConCandidata } from './previsualizacion.ts';
import { TEMA } from './tema.ts';
import { TEXTOS, describirError, describirGrano } from './textos.ts';
import { PATRONES_GRANOS, describirCeldas } from './vista.ts';
import type { CeldaDescrita } from './vista.ts';

export type Escena = {
  /** Muestra un estado nuevo y selecciona su primer grano sin colocar. */
  readonly mostrarEstado: (estado: Estado) => void;
};

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

  const dibujar = (): void => {
    for (const hijo of capa.removeChildren()) hijo.destroy({ children: true });
    if (ui === undefined) return;
    const { estado } = ui;
    const ventana = { ancho: app.screen.width, alto: app.screen.height };
    tablero = disponer(ventana.ancho, ventana.alto, estado.config.lado);
    mano = disponerMano(ventana, estado.mano.length);
    capa.addChild(dibujarInformacion(tablero.bandaSuperior, semilla, estado.config.lado));
    capa.addChild(dibujarTablero(tablero, ui, celdaRaton));
    capa.addChild(dibujarMano(mano, ui, mensaje));
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

  /** Si el punto cae sobre algo que responde a un clic, para el cursor de mano. */
  const accionable = (p: Punto): boolean => {
    if (ui === undefined) return false;
    const { estado, seleccionado } = ui;
    if (tablero !== undefined && seleccionado !== null && celdaEn(p, tablero) !== null) return true;
    if (mano === undefined) return false;
    const ficha = fichaEn(p, mano);
    if (ficha !== null) return estado.mano[ficha]?.celda === null || estado.ordenColocacion.at(-1) === ficha;
    return estado.ordenColocacion.length > 0 && botonDeshacerEn(p, mano);
  };

  app.stage.on('pointertap', (e: FederatedPointerEvent) => {
    if (ui === undefined) return;
    const p = { x: e.global.x, y: e.global.y };
    const celda = tablero === undefined ? null : celdaEn(p, tablero);
    const ficha = mano === undefined ? null : fichaEn(p, mano);
    if (celda !== null) {
      ejecutar(colocar(ui, celda.x, celda.y));
    } else if (ficha !== null) {
      // Una ficha sin colocar se elige; una colocada se deshace si es la última (si no, el error explica por qué).
      ejecutar(ui.estado.mano[ficha]?.celda === null ? seleccionar(ui, ficha) : deshacerDesdeFicha(ui, ficha));
    } else if (mano !== undefined && botonDeshacerEn(p, mano)) {
      ejecutar(deshacer(ui));
    }
  });

  const moverRaton = (celda: Punto | null): void => {
    if (celda?.x === celdaRaton?.x && celda?.y === celdaRaton?.y) return;
    celdaRaton = celda;
    dibujar();
  };
  app.stage.on('pointermove', (e: FederatedPointerEvent) => {
    const p = { x: e.global.x, y: e.global.y };
    app.canvas.style.cursor = accionable(p) ? 'pointer' : 'default';
    // Solo el ratón tiene vista previa al pasar: con un dedo no hay «pasar por encima».
    moverRaton(e.pointerType === 'mouse' && tablero !== undefined ? celdaEn(p, tablero) : null);
  });
  app.canvas.addEventListener('pointerleave', () => moverRaton(null));

  window.addEventListener('keydown', (e) => {
    if (ui === undefined) return;
    const accion = accionDeTecla({ tecla: e.key, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey });
    if (accion === null) return;
    e.preventDefault();
    if (accion.tipo === 'seleccionar') ejecutar(seleccionar(ui, accion.indice));
    else if (accion.tipo === 'ciclar') ejecutar(ciclar(ui, accion.direccion));
    else ejecutar(deshacer(ui));
  });

  app.renderer.on('resize', dibujar);
  return {
    mostrarEstado: (estado) => {
      ui = iniciarControlador(estado);
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

function dibujarCelda(r: Rect, c: CeldaDescrita): Container {
  const { proporciones, tipografia, colores, granos, contornoPrevisto } = TEMA;
  const contenedor = new Container();
  const radioEsquina = r.ancho * proporciones.radioCelda;
  const g = new Graphics().roundRect(r.x, r.y, r.ancho, r.alto, radioEsquina).fill(c.color);

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

function dibujarMano(d: DisposicionMano, ui: EstadoInterfaz, mensaje: string | null): Container {
  const { fichas: aspecto, colores, granos, tipografia, mano: proporciones, boton } = TEMA;
  const contenedor = new Container();

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
    contenedor.addChild(ficha);

    if (i === ui.seleccionado) {
      const w = f.radio * aspecto.anillo.grosor;
      contenedor.addChild(new Graphics().circle(f.x, f.y, f.radio - w / 2).stroke({ width: w, color: aspecto.anillo.color }));
    }
  }

  const activo = ui.estado.ordenColocacion.length > 0;
  const estilo = activo ? boton.activo : boton.desactivado;
  const r = d.deshacer;
  if (r.ancho > 0 && r.alto > 0) {
    contenedor.addChild(new Graphics().roundRect(r.x, r.y, r.ancho, r.alto, r.alto * proporciones.radioBoton).fill(estilo.fondo));
    const texto = new Text({
      text: TEXTOS.deshacer,
      style: {
        fontFamily: tipografia.familia,
        fontWeight: tipografia.pesoInformacion,
        fontSize: Math.max(1, Math.min(r.alto * proporciones.textoBoton, r.ancho / 6)),
        fill: estilo.texto,
      },
    });
    texto.anchor.set(0.5);
    texto.position.set(r.x + r.ancho / 2, r.y + r.alto / 2);
    contenedor.addChild(texto);
  }

  // La línea de información: el error de la última acción imposible o, si no, el efecto del grano seleccionado.
  const seleccionado = ui.seleccionado === null ? undefined : ui.estado.mano[ui.seleccionado];
  const linea = mensaje ?? (seleccionado === undefined ? TEXTOS.manoCompleta : describirGrano(seleccionado.tipo));
  const rd = d.descripcion;
  if (rd.ancho > 0 && rd.alto > 0) {
    // El tamaño se limita también por el ancho, para que la línea quepa en ventanas estrechas.
    const descripcion = new Text({
      text: linea,
      style: {
        fontFamily: tipografia.familia,
        fontSize: Math.max(1, Math.min(rd.alto * proporciones.textoDescripcion, (rd.ancho / Math.max(1, linea.length)) * 1.8)),
        fill: mensaje === null ? colores.texto : colores.error,
      },
    });
    descripcion.anchor.set(0.5);
    descripcion.position.set(rd.x + rd.ancho / 2, rd.y + rd.alto / 2);
    contenedor.addChild(descripcion);
  }
  return contenedor;
}
