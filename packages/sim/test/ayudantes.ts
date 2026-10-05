import { CONFIG_INICIAL, crearRonda } from '@pila/core';
import type { Config, Estado } from '@pila/core';

/**
 * Estado de prueba construido solo con la interfaz pública de `@pila/core` (sim no puede importar los
 * ayudantes internos de core): `crearRonda` con `CONFIG_INICIAL` y el lado dado, y luego `overrides`.
 * Sustituir `celdas` por valores enteros ≥ 0 de lado × lado sigue dando un estado válido.
 */
export function estadoDePrueba(lado: number, overrides: Partial<Estado> = {}, config: Partial<Config> = {}): Estado {
  const ronda = crearRonda({ ...CONFIG_INICIAL, lado, ...config }, 1);
  if (!ronda.ok) throw new Error(`configuración inválida: ${ronda.error.campo}: ${ronda.error.motivo}`);
  return { ...ronda.valor.estado, ...overrides };
}
