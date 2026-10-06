// Bot de prueba: juega partidas aleatorias con la interfaz pública del núcleo y guarda cada `Confirmar`. Las
// elecciones salen de un flujo de azar del propio núcleo sembrado por la prueba, así que son reproducibles.
import { CONFIG_INICIAL, aplicar, crearRonda, derivarFlujo, enteroEnRango } from '@pila/core';
import type { Config, Estado, EstadoFlujo, Evento } from '@pila/core';

/** Un `Confirmar` jugado: el estado de antes, sus eventos y el estado de después. */
export type Tirada = { readonly antes: Estado; readonly eventos: readonly Evento[]; readonly despues: Estado };

/**
 * Juega una ronda con `lado` y `semilla`, colocando cada grano en una celda elegida al azar con `semillaBot`, hasta
 * que termina o se han jugado `maxTiradas` tiradas. `cambios` modifica `CONFIG_INICIAL` (por ejemplo, el
 * multiplicador). Devuelve cada `Confirmar`.
 */
export function jugar(
  lado: number,
  semilla: number,
  semillaBot: number,
  maxTiradas = 20,
  cambios: Partial<Config> = {},
): Tirada[] {
  const ronda = crearRonda({ ...CONFIG_INICIAL, ...cambios, lado }, semilla);
  if (!ronda.ok) throw new Error(`configuración inválida: ${ronda.error.campo}`);
  let estado = ronda.valor.estado;
  let flujo: EstadoFlujo = derivarFlujo(semillaBot, 'mazo');
  const tiradas: Tirada[] = [];
  while (estado.fase === 'colocando' && tiradas.length < maxTiradas) {
    for (let indiceMano = 0; indiceMano < estado.mano.length; indiceMano++) {
      const [x, f1] = enteroEnRango(flujo, 0, lado - 1);
      const [y, f2] = enteroEnRango(f1, 0, lado - 1);
      flujo = f2;
      const paso = aplicar(estado, { tipo: 'Colocar', indiceMano, x, y });
      if (!paso.ok) throw new Error(`colocación rechazada: ${JSON.stringify(paso.error)}`);
      estado = paso.valor.estado;
    }
    const paso = aplicar(estado, { tipo: 'Confirmar' });
    if (!paso.ok) throw new Error(`confirmación rechazada: ${JSON.stringify(paso.error)}`);
    tiradas.push({ antes: estado, eventos: paso.valor.eventos, despues: paso.valor.estado });
    estado = paso.valor.estado;
  }
  return tiradas;
}
