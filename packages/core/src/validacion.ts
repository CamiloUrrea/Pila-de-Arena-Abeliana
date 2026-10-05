import { dentro } from './rejilla.ts';
import { FASES, TIPOS_GRANO } from './tipos.ts';
import type { Config, ErrorConfig, ErrorEstado, Estado, Resultado } from './tipos.ts';

function falla<T>(campo: string, motivo: string): Resultado<T, { campo: string; motivo: string }> {
  return { ok: false, error: { campo, motivo } };
}

/** Comprueba que una configuración cumple las reglas de la especificación. */
export function validarConfig(config: Config): Resultado<Config, ErrorConfig> {
  const enteros: readonly (readonly [string, number])[] = [
    ['lado', config.lado],
    ['umbral', config.umbral],
    ['tiradas', config.tiradas],
    ['tamanoMano', config.tamanoMano],
    ['siembra.min', config.siembra.min],
    ['siembra.max', config.siembra.max],
    ...TIPOS_GRANO.map((tipo): readonly [string, number] => [`mazo.${tipo}`, config.mazo[tipo]]),
    ['meta', config.meta],
    ['multiplicadorPorOleada', config.multiplicadorPorOleada],
    ['topeOleadas', config.topeOleadas],
  ];
  for (const [campo, valor] of enteros) {
    if (!Number.isSafeInteger(valor)) return falla(campo, 'debe ser un entero seguro');
  }

  if (config.lado < 1) return falla('lado', 'debe ser al menos 1');
  // Fijo en H1: un derrumbe pierde 4 granos y envía uno a cada uno de sus 4 vecinos.
  // Con otro umbral se crearían o destruirían granos y dejaría de cumplirse la conservación.
  if (config.umbral !== 4) return falla('umbral', 'debe ser 4 en H1');
  if (config.tiradas < 1) return falla('tiradas', 'debe ser al menos 1');
  for (const tipo of TIPOS_GRANO) {
    if (config.mazo[tipo] < 0) return falla(`mazo.${tipo}`, 'no puede ser negativo');
  }
  const totalMazo = TIPOS_GRANO.reduce((suma, tipo) => suma + config.mazo[tipo], 0);
  if (config.tamanoMano < 1) return falla('tamanoMano', 'debe ser al menos 1');
  if (config.tamanoMano > totalMazo) return falla('tamanoMano', `no puede superar el total del mazo (${totalMazo})`);
  if (config.siembra.min < 0) return falla('siembra.min', 'no puede ser negativo');
  if (config.siembra.min > config.siembra.max) return falla('siembra.max', 'no puede ser menor que siembra.min');
  if (config.meta < 1) return falla('meta', 'debe ser al menos 1');
  if (config.multiplicadorPorOleada < 0) return falla('multiplicadorPorOleada', 'no puede ser negativo');
  if (config.topeOleadas < 1) return falla('topeOleadas', 'debe ser al menos 1');

  return { ok: true, valor: config };
}

/** Comprueba los invariantes de un estado (sección «Invariantes y pruebas»). */
export function validarEstado(estado: Estado): Resultado<Estado, ErrorEstado> {
  const config = validarConfig(estado.config);
  if (!config.ok) return falla(`config.${config.error.campo}`, config.error.motivo);
  const { lado } = estado.config;

  if (!FASES.includes(estado.fase)) return falla('fase', `fase desconocida: ${String(estado.fase)}`);

  if (estado.celdas.length !== lado) return falla('celdas', `debe tener ${lado} filas`);
  for (const [y, fila] of estado.celdas.entries()) {
    if (fila.length !== lado) return falla(`celdas[${y}]`, `debe tener ${lado} columnas`);
    for (const [x, valor] of fila.entries()) {
      if (!Number.isSafeInteger(valor) || valor < 0) {
        return falla(`celdas[${y}][${x}]`, 'debe ser un entero seguro mayor o igual que 0');
      }
    }
  }

  const contadores: readonly ('tiradasRestantes' | 'puntos')[] = ['tiradasRestantes', 'puntos'];
  for (const campo of contadores) {
    const valor = estado[campo];
    if (!Number.isSafeInteger(valor) || valor < 0) return falla(campo, 'debe ser un entero seguro mayor o igual que 0');
  }

  for (const [i, grano] of estado.mano.entries()) {
    if (grano.celda !== null && !dentro(lado, grano.celda.x, grano.celda.y)) {
      return falla(`mano[${i}].celda`, 'está fuera de la rejilla');
    }
  }

  const todos = [...estado.mazo, ...estado.mano.map((grano) => grano.tipo), ...estado.usados];
  for (const tipo of TIPOS_GRANO) {
    const n = todos.filter((t) => t === tipo).length;
    if (n !== estado.config.mazo[tipo]) {
      return falla('mazo', `mazo + mano + usados tiene ${n} de ${tipo} y la configuración ${estado.config.mazo[tipo]}`);
    }
  }
  const desconocido = todos.find((t) => !TIPOS_GRANO.includes(t));
  if (desconocido !== undefined) return falla('mazo', `tipo de grano desconocido: ${String(desconocido)}`);

  return { ok: true, valor: estado };
}
