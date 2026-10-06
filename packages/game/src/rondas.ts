// Creación pura de una ronda para la interfaz: el estado del núcleo y su estado de interfaz inicial.
import { CONFIG_INICIAL, crearRonda } from '@pila/core';
import type { ErrorConfig, Resultado } from '@pila/core';
import { iniciarControlador } from './controlador.ts';
import type { EstadoInterfaz } from './controlador.ts';
import { SEMILLA_MAXIMA } from './parametros.ts';

/**
 * Crea una ronda con `crearRonda({ ...CONFIG_INICIAL, lado }, semilla)` y su estado de interfaz inicial
 * (`iniciarControlador`). Una configuración inválida devuelve su error; una semilla que no sea un entero de 0 a
 * 4294967295 también devuelve un error (con `campo: 'semilla'`) en lugar del `RangeError` del núcleo. Nunca lanza.
 */
export function nuevaRonda({ lado, semilla }: { readonly lado: number; readonly semilla: number }): Resultado<EstadoInterfaz, ErrorConfig> {
  if (!Number.isInteger(semilla) || semilla < 0 || semilla > SEMILLA_MAXIMA) {
    return { ok: false, error: { campo: 'semilla', motivo: `debe ser un entero de 0 a ${SEMILLA_MAXIMA}` } };
  }
  const ronda = crearRonda({ ...CONFIG_INICIAL, lado }, semilla);
  if (!ronda.ok) return ronda;
  return { ok: true, valor: iniciarControlador(ronda.valor.estado) };
}
