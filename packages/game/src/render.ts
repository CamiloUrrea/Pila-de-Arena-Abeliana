// Único módulo que usa PixiJS: dibuja lo que describen `disponer` y `describirCeldas`, sin decidir nada.
import { Application, Container, Graphics, Text } from 'pixi.js';
import type { Estado } from '@pila/core';
import { disponer } from './disposicion.ts';
import { TEMA } from './tema.ts';
import { describirCeldas } from './vista.ts';

export type Escena = {
  /** Dibuja el estado; se vuelve a dibujar solo al redimensionar la ventana. */
  readonly mostrarEstado: (estado: Estado) => void;
};

/**
 * Crea la aplicación de PixiJS dentro de `contenedor`, ajustada a la ventana y a la densidad de píxeles.
 * `semilla` solo se muestra en la banda superior: el estado no la guarda.
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
  let actual: Estado | undefined;

  const dibujar = (): void => {
    for (const hijo of capa.removeChildren()) hijo.destroy();
    if (actual === undefined) return;
    const { lado, umbral } = actual.config;
    const d = disponer(app.screen.width, app.screen.height, lado);
    const { proporciones, tipografia, colores } = TEMA;

    const informacion = new Text({
      text: `semilla ${semilla} · lado ${lado}`,
      style: {
        fontFamily: tipografia.familia,
        fontSize: Math.max(1, d.bandaSuperior.alto * proporciones.textoInformacion),
        fill: colores.textoSecundario,
      },
    });
    informacion.anchor.set(0.5);
    informacion.position.set(d.bandaSuperior.x + d.bandaSuperior.ancho / 2, d.bandaSuperior.y + d.bandaSuperior.alto / 2);
    capa.addChild(informacion);

    if (d.celda <= 0) return;
    for (const c of describirCeldas(actual.celdas, umbral)) {
      const r = d.celdas[c.y]?.[c.x];
      if (r === undefined) continue;
      const fondo = new Graphics().roundRect(r.x, r.y, r.ancho, r.alto, r.ancho * proporciones.radioCelda).fill(c.color);
      const numero = new Text({
        text: c.texto,
        style: {
          fontFamily: tipografia.familia,
          fontWeight: tipografia.pesoCarga,
          fontSize: Math.max(1, r.ancho * proporciones.textoCelda),
          fill: colores.texto,
        },
      });
      numero.anchor.set(0.5);
      numero.position.set(r.x + r.ancho / 2, r.y + r.alto / 2);
      capa.addChild(fondo, numero);
    }
  };

  app.renderer.on('resize', dibujar);
  return {
    mostrarEstado: (estado) => {
      actual = estado;
      dibujar();
    },
  };
}
