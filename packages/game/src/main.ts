// Punto de entrada del cliente: lee la URL, crea la ronda con el núcleo y la muestra, lista para colocar granos.
import { CONFIG_INICIAL, crearRonda } from '@pila/core';
import { leerParametros } from './parametros.ts';
import { crearEscena } from './render.ts';
import { TEMA } from './tema.ts';
import { TEXTOS } from './textos.ts';

/** Semilla aleatoria para cuando la URL no trae una: 32 bits del generador criptográfico del navegador. */
function semillaAleatoria(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

/** Muestra un error legible en lugar del juego. */
function mostrarError(titulo: string, lineas: readonly string[]): void {
  const caja = document.createElement('div');
  caja.setAttribute('role', 'alert');
  Object.assign(caja.style, {
    color: `#${TEMA.colores.error.toString(16).padStart(6, '0')}`,
    fontFamily: TEMA.tipografia.familia,
    fontSize: '18px',
    lineHeight: '1.5',
    maxWidth: '40em',
    margin: '15vh auto',
    padding: '0 16px',
  });
  const cabecera = document.createElement('h1');
  cabecera.textContent = titulo;
  cabecera.style.fontSize = '22px';
  caja.appendChild(cabecera);
  for (const linea of lineas) {
    const p = document.createElement('p');
    p.textContent = linea;
    caja.appendChild(p);
  }
  document.body.appendChild(caja);
}

async function arrancar(): Promise<void> {
  const parametros = leerParametros(window.location.search, semillaAleatoria);
  if (!parametros.ok) {
    mostrarError(
      TEXTOS.errorInicio,
      parametros.errores.map((e) => e.mensaje),
    );
    return;
  }
  const { semilla, lado, ritmo } = parametros.valor;
  const ronda = crearRonda({ ...CONFIG_INICIAL, lado }, semilla);
  if (!ronda.ok) {
    mostrarError(TEXTOS.errorInicio, [TEXTOS.configuracionInvalida(ronda.error.campo, ronda.error.motivo)]);
    return;
  }
  const contenedor = document.getElementById('juego') ?? document.body;
  const escena = await crearEscena(contenedor, semilla, ritmo);
  escena.mostrarEstado(ronda.valor.estado);
}

void arrancar();
