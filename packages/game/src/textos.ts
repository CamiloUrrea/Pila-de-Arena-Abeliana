// Textos de la interfaz, en español y en un solo sitio. La descripción de cada grano se genera de sus datos
// (`DEFINICIONES_GRANOS`), de modo que un tipo nuevo tiene texto sin tocar este módulo.
import { DEFINICIONES_GRANOS } from '@pila/core';
import type { DefinicionGrano, Estado, MotivoIlegal, TipoGrano } from '@pila/core';
import type { ErrorCascada } from './cascada.ts';
import type { ErrorControlador } from './controlador.ts';
import type { Indicadores } from './indicadores.ts';

export const TEXTOS = {
  deshacer: 'Deshacer',
  confirmar: 'Confirmar',
  manoCompleta: 'Mano completa: confirma la tirada',
  resolviendo: 'Resolviendo…',
  recargar: 'Recarga la página para jugar otra ronda',
  informacion: (semilla: number, lado: number): string => `semilla ${semilla} · lado ${lado}`,
  /** Partes de la etiqueta de cadena «Oleada k · ×m · +P»; el multiplicador va aparte para resaltarlo. */
  oleada: (k: number): string => `Oleada ${k} · `,
  puntosDeTirada: (puntos: string): string => ` · +${puntos}`,
  ritmo: (ritmo: string): string => `ritmo ${ritmo}`,
  errorInicio: 'No se puede empezar la ronda',
  configuracionInvalida: (campo: string, motivo: string): string => `Configuración inválida: ${campo}: ${motivo}.`,
} as const;

/** Definición de un grano para describirla: el tipo puede ser cualquier texto, no solo los del MVP. */
export type DefinicionDescribible = { readonly tipo: string; readonly adiciones: DefinicionGrano['adiciones'] };

const VECINAS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;
const DIAGONALES = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;
const DIRECCIONES: Readonly<Record<string, string>> = {
  '0,-1': 'arriba',
  '1,0': 'a la derecha',
  '0,1': 'abajo',
  '-1,0': 'a la izquierda',
};

const nombre = (tipo: string): string => tipo.charAt(0).toUpperCase() + tipo.slice(1);
const cantidad = (c: number): string => (c < 0 ? `−${-c}` : `+${c}`);

/** Une partes con comas y una «y» final: «a», «a y b», «a, b y c». */
function enumerar(partes: readonly string[]): string {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} y ${partes.at(-1) ?? ''}`;
}

/**
 * Si el conjunto `grupo` está entero en `restantes` con la misma cantidad, la devuelve y lo quita de
 * `restantes`; si no, devuelve `undefined` sin tocarlo.
 */
function tomarGrupo(restantes: Map<string, number>, grupo: readonly (readonly [number, number])[]): number | undefined {
  const cantidades = grupo.map(([dx, dy]) => restantes.get(`${dx},${dy}`));
  const primera = cantidades[0];
  if (primera === undefined || cantidades.some((c) => c !== primera)) return undefined;
  for (const [dx, dy] of grupo) restantes.delete(`${dx},${dy}`);
  return primera;
}

/**
 * Describe el efecto de una definición de grano, generado de sus adiciones: la celda, las cuatro vecinas, las
 * cuatro diagonales y cada vecina suelta por su dirección. Si queda algún desplazamiento que no sabe nombrar,
 * usa un respaldo genérico con el total de granos y de celdas. Nunca lanza.
 */
export function describirDefinicion(definicion: DefinicionDescribible): string {
  // Suma las adiciones repetidas sobre el mismo desplazamiento y descarta las nulas.
  const restantes = new Map<string, number>();
  for (const { dx, dy, cantidad: c } of definicion.adiciones) {
    const clave = `${dx},${dy}`;
    restantes.set(clave, (restantes.get(clave) ?? 0) + c);
  }
  for (const [clave, c] of restantes) if (c === 0) restantes.delete(clave);
  const titulo = nombre(definicion.tipo);
  if (restantes.size === 0) return `${titulo}: sin efecto`;
  const total = [...restantes.values()].reduce((a, b) => a + b, 0);
  const celdas = restantes.size;

  const partes: string[] = [];
  const centro = restantes.get('0,0');
  if (centro !== undefined) {
    partes.push(`${cantidad(centro)} en la celda`);
    restantes.delete('0,0');
  }
  const vecinas = tomarGrupo(restantes, VECINAS);
  if (vecinas !== undefined) partes.push(`${cantidad(vecinas)} en cada vecina`);
  const diagonales = tomarGrupo(restantes, DIAGONALES);
  if (diagonales !== undefined) partes.push(`${cantidad(diagonales)} en cada diagonal`);
  for (const [clave, c] of [...restantes]) {
    const direccion = DIRECCIONES[clave];
    if (direccion === undefined) continue;
    partes.push(`${cantidad(c)} ${direccion}`);
    restantes.delete(clave);
  }

  if (restantes.size > 0) {
    const granos = Math.abs(total) === 1 ? 'grano' : 'granos';
    const donde = celdas === 1 ? 'en otra celda' : `repartidos en ${celdas} celdas`;
    return `${titulo}: ${cantidad(total)} ${granos} ${donde}`;
  }
  return `${titulo}: ${enumerar(partes)}`;
}

/** Describe el efecto de un tipo de grano a partir de `DEFINICIONES_GRANOS`, p. ej. «Pesado: +2 en la celda». */
export function describirGrano(
  tipo: TipoGrano,
  definiciones: Readonly<Record<TipoGrano, DefinicionDescribible>> = DEFINICIONES_GRANOS,
): string {
  return describirDefinicion(definiciones[tipo]);
}

/** Mensaje de cada motivo de acción ilegal del núcleo; el tipo `Record` obliga a cubrirlos todos. */
const MOTIVOS: Readonly<Record<MotivoIlegal, string>> = {
  FaseIncorrecta: 'La ronda ha terminado: ya no se pueden colocar ni deshacer granos.',
  IndiceManoInvalido: 'Ese grano no está en la mano.',
  GranoYaColocado: 'Ese grano ya está colocado: deshazlo antes de moverlo.',
  CeldaFueraDeRejilla: 'Esa casilla está fuera del tablero.',
  NadaQueDeshacer: 'No hay nada que deshacer: todavía no has colocado ningún grano.',
  ManoIncompleta: 'Coloca todos los granos antes de confirmar.',
};

/**
 * Mensaje en español para cada error del controlador, del núcleo y de la cascada. Es exhaustiva: si aparece un tipo
 * de error nuevo, el `switch` deja de compilar hasta que tenga su mensaje.
 */
export function describirError(error: ErrorControlador | ErrorCascada): string {
  switch (error.tipo) {
    case 'SinGranoSeleccionado':
      return 'No hay ningún grano seleccionado: todos los granos de la mano están colocados.';
    case 'GranoNoSeleccionable':
      return 'Ese grano no se puede elegir: no está en la mano o ya está colocado.';
    case 'NoEsLaUltimaColocacion':
      return 'Solo se puede deshacer la última colocación: usa Deshacer.';
    case 'GranoNoColocado':
      return 'Ese grano no está colocado: no hay nada que deshacer en él.';
    case 'AccionIlegal':
      return MOTIVOS[error.motivo];
    case 'ResolucionNoTermino':
      return `Error interno: la tirada no terminó en ${error.topeOleadas} oleadas.`;
    case 'CascadaInvalida':
      return `Error interno: no se pudo animar la tirada (${error.motivo}).`;
    default: {
      const desconocido: never = error;
      return `Error desconocido: ${JSON.stringify(desconocido)}`;
    }
  }
}

/**
 * Puntos en centésimas como texto con coma decimal y sin ceros sobrantes: 523 → «5,23», 150 → «1,5», 200 → «2».
 * Aritmética entera.
 */
export function formatearPuntos(centesimas: number): string {
  const signo = centesimas < 0 ? '−' : '';
  const v = Math.abs(Math.trunc(centesimas));
  const decimales = String(v % 100).padStart(2, '0').replace(/0+$/, '');
  return `${signo}${Math.floor(v / 100)}${decimales === '' ? '' : `,${decimales}`}`;
}

/** «Ronda ganada» o «Ronda perdida» con los puntos finales; `null` si la ronda sigue en juego. */
export function describirFinDeRonda(estado: Estado): string | null {
  const puntos = `${formatearPuntos(estado.puntos)} puntos`;
  switch (estado.fase) {
    case 'ganada':
      return `Ronda ganada · ${puntos}`;
    case 'perdida':
      return `Ronda perdida · ${puntos}`;
    case 'colocando':
      return null;
  }
}

/**
 * Partes del texto del mazo: el total y el recuento de cada tipo, en el orden de los datos y con el nombre generado
 * del tipo («Normal 12»). Solo recuentos: nunca el orden de robo.
 */
export function lineasMazo(mazo: Indicadores['mazo']): string[] {
  const tipos = Object.entries(mazo.porTipo).map(([tipo, n]) => `${nombre(tipo)} ${n}`);
  return [`Mazo ${mazo.total}`, ...tipos];
}

/** «Mazo 17 · Normal 12 · Pesado 3 · Explosivo 2». */
export function describirMazo(mazo: Indicadores['mazo']): string {
  return lineasMazo(mazo).join(' · ');
}

/** «Tiradas 3/5»: las restantes sobre el total. */
export function describirTiradas({ total, restantes }: Indicadores['tiradas']): string {
  return `Tiradas ${restantes}/${total}`;
}
