// Punto de entrada del cliente: lee la URL, crea la ronda con el núcleo y la muestra, lista para colocar granos; al
// pedir otra ronda, crea una nueva con semilla nueva sin recargar la página. Lleva el registro local de las rondas.
import { guardarRegistros, leerRegistros } from './almacenamiento.ts';
import type { Almacen } from './almacenamiento.ts';
import { aCsv, copiarAlPortapapeles } from './exportacion.ts';
import { leerParametros, semillaAleatoria, urlConSemilla } from './parametros.ts';
import { cerrarRegistro, idSesion, marcarPidioOtra, seguimientoNuevo, seguirConfirmacion, seguirDeshacer } from './registro.ts';
import type { RegistroRonda } from './registro.ts';
import { crearEscena } from './render.ts';
import type { InfoSesion } from './render.ts';
import { nuevaRonda } from './rondas.ts';
import { resumenSesion } from './sesion.ts';
import { TEMA } from './tema.ts';
import { TEXTOS, describirError, describirSesion } from './textos.ts';

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

/**
 * `localStorage` como `Almacen`. El acceso va dentro de cada llamada, así que un navegador que lo bloquee lanza dentro
 * de `getItem` o `setItem`, donde `leerRegistros` y `guardarRegistros` lo convierten en un error.
 */
const almacenNavegador: Almacen = {
  getItem: (clave) => window.localStorage.getItem(clave),
  setItem: (clave, valor) => window.localStorage.setItem(clave, valor),
};

async function arrancar(): Promise<void> {
  const parametros = leerParametros(window.location.search, semillaAleatoria);
  if (!parametros.ok) {
    mostrarError(
      TEXTOS.errorInicio,
      parametros.errores.map((e) => e.mensaje),
    );
    return;
  }
  const { semilla, lado, ritmo, jugador } = parametros.valor;
  const primera = nuevaRonda({ lado, semilla });
  if (!primera.ok) {
    mostrarError(TEXTOS.errorInicio, [TEXTOS.configuracionInvalida(primera.error.campo, primera.error.motivo)]);
    return;
  }

  // Registro local: solo en este navegador, nunca sale del dispositivo. Si lo guardado no se puede leer, la sesión
  // sigue sin guardar (para no sobrescribirlo) y se avisa una sola vez; las estadísticas en pantalla siguen.
  const sesion = idSesion(semillaAleatoria());
  const leidos = leerRegistros(almacenNavegador);
  let registros: RegistroRonda[] = leidos.ok ? leidos.valor : [];
  const guardar = leidos.ok;
  let avisado = false;
  const avisar = (texto: string): void => {
    if (avisado) return;
    avisado = true;
    escena.mostrarMensaje(texto, false);
  };
  const persistir = (): void => {
    if (!guardar) return;
    const r = guardarRegistros(almacenNavegador, registros);
    if (r.ok) registros = r.valor;
    else avisar(describirError(r.error));
  };
  const infoSesion = (): InfoSesion => {
    const resumen = resumenSesion(registros.filter((r) => r.sesion === sesion));
    return { jugador, ganadas: resumen.ganadas, linea: describirSesion(resumen) };
  };

  // El contador de ronda vive mientras la página siga abierta.
  let numero = 1;
  let seguimiento = seguimientoNuevo({ semilla, lado, inicioMs: Date.now() });
  const contenedor = document.getElementById('juego') ?? document.body;
  const escena = await crearEscena(contenedor, {
    ritmo,
    alConfirmar: (eventos) => {
      seguimiento = seguirConfirmacion(seguimiento, eventos);
    },
    alDeshacer: () => {
      seguimiento = seguirDeshacer(seguimiento);
    },
    alFinDeRonda: (estado) => {
      const registro = cerrarRegistro(seguimiento, estado, {
        sesion,
        jugador,
        indice: numero,
        finMs: Date.now(),
        fecha: new Date().toISOString(),
      });
      if (registro === null) return;
      registros = [...registros, registro];
      persistir();
      escena.fijarSesion(infoSesion());
    },
    alCopiar: () => {
      const total = registros.length;
      void copiarAlPortapapeles(aCsv(registros), navigator).then((r) => {
        escena.mostrarMensaje(r.ok ? TEXTOS.registroCopiado(total) : TEXTOS.copiaFallida(describirError(r.error)), !r.ok);
      });
    },
    // Otra ronda: semilla nueva, mismo lado; el ritmo lo conserva la escena. La URL se actualiza sin recargar.
    alPedirOtraRonda: () => {
      const nueva = semillaAleatoria();
      const ronda = nuevaRonda({ lado, semilla: nueva });
      if (!ronda.ok) {
        escena.mostrarMensaje(TEXTOS.configuracionInvalida(ronda.error.campo, ronda.error.motivo));
        return;
      }
      // La ronda que acaba de terminar es la última registrada: el jugador pidió otra.
      const ultima = registros.at(-1);
      if (ultima !== undefined && ultima.sesion === sesion && ultima.indice === numero) {
        registros = [...registros.slice(0, -1), marcarPidioOtra(ultima)];
        persistir();
      }
      numero++;
      seguimiento = seguimientoNuevo({ semilla: nueva, lado, inicioMs: Date.now() });
      const { pathname, search, hash } = window.location;
      window.history.replaceState(null, '', `${pathname}${urlConSemilla(search, nueva)}${hash}`);
      escena.fijarSesion(infoSesion());
      escena.mostrarRonda({ ui: ronda.valor, semilla: nueva, numero });
    },
  });
  escena.fijarSesion(infoSesion());
  escena.mostrarRonda({ ui: primera.valor, semilla, numero });
  if (!leidos.ok) avisar(describirError(leidos.error));
}

void arrancar();
