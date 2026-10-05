import { derivarFlujo, enteroEnRango } from './azar.ts';
import type { Evento } from './eventos.ts';
import { crearMazo, robarMano } from './mazo.ts';
import type { Config, ErrorConfig, Estado, Resultado } from './tipos.ts';
import { validarConfig } from './validacion.ts';

/**
 * Estado inicial de una ronda: valida la configuración, siembra la rejilla por filas con el flujo `siembra`,
 * baraja el mazo y roba la primera mano con el flujo `mazo`, y emite `ManoRobada`.
 * Una configuración inválida devuelve su error; una semilla inválida lanza el `RangeError` de `derivarFlujo`.
 * No muta la entrada: el estado guarda una copia de la configuración.
 */
export function crearRonda(
  config: Config,
  semilla: number,
): Resultado<{ readonly estado: Estado; readonly eventos: readonly Evento[] }, ErrorConfig> {
  const valida = validarConfig(config);
  if (!valida.ok) return valida;

  let siembra = derivarFlujo(semilla, 'siembra');
  const celdas: number[][] = [];
  for (let y = 0; y < config.lado; y++) {
    const fila: number[] = [];
    for (let x = 0; x < config.lado; x++) {
      const [valor, siguiente] = enteroEnRango(siembra, config.siembra.min, config.siembra.max);
      fila.push(valor);
      siembra = siguiente;
    }
    celdas.push(fila);
  }

  const barajado = crearMazo(config.mazo, derivarFlujo(semilla, 'mazo'));
  const robo = robarMano(barajado.mazo, [], config.tamanoMano, barajado.flujo);

  const estado: Estado = {
    config: { ...config, siembra: { ...config.siembra }, mazo: { ...config.mazo } },
    celdas,
    fase: 'colocando',
    mano: robo.mano,
    ordenColocacion: [],
    mazo: robo.mazo,
    usados: robo.usados,
    tiradasRestantes: config.tiradas,
    puntos: 0,
    rng: { siembra, mazo: robo.flujo },
  };
  return { ok: true, valor: { estado, eventos: [robo.evento] } };
}
