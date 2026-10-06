// Punto de entrada del cliente: lee la URL, crea la ronda con el núcleo y la muestra, lista para colocar granos; al
// pedir otra ronda, crea una nueva con semilla nueva sin recargar la página.
import { leerParametros, semillaAleatoria, urlConSemilla } from './parametros.ts';
import { crearEscena } from './render.ts';
import { nuevaRonda } from './rondas.ts';
import { TEMA } from './tema.ts';
import { TEXTOS } from './textos.ts';

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
  const primera = nuevaRonda({ lado, semilla });
  if (!primera.ok) {
    mostrarError(TEXTOS.errorInicio, [TEXTOS.configuracionInvalida(primera.error.campo, primera.error.motivo)]);
    return;
  }

  // El contador de ronda vive mientras la página siga abierta (todavía sin almacenamiento).
  let numero = 1;
  const contenedor = document.getElementById('juego') ?? document.body;
  const escena = await crearEscena(contenedor, {
    ritmo,
    // Otra ronda: semilla nueva, mismo lado; el ritmo lo conserva la escena. La URL se actualiza sin recargar.
    alPedirOtraRonda: () => {
      const nueva = semillaAleatoria();
      const ronda = nuevaRonda({ lado, semilla: nueva });
      if (!ronda.ok) {
        escena.mostrarMensaje(TEXTOS.configuracionInvalida(ronda.error.campo, ronda.error.motivo));
        return;
      }
      numero++;
      const { pathname, search, hash } = window.location;
      window.history.replaceState(null, '', `${pathname}${urlConSemilla(search, nueva)}${hash}`);
      escena.mostrarRonda({ ui: ronda.valor, semilla: nueva, numero });
    },
  });
  escena.mostrarRonda({ ui: primera.valor, semilla, numero });
}

void arrancar();
