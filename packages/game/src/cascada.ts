// Animación pura de la cascada de una tirada. `construirCascada` reconstruye, a partir de la rejilla anterior y de
// los eventos de `Confirmar`, los pasos de la animación (adición, y alerta y derrumbe por oleada) con sus rejillas
// intermedias; `muestrear` es una función pura del tiempo que da el cuadro de cada instante. No usa azar ni reloj.
import type { Direccion, Estado, Evento } from '@pila/core';
import { TEMA } from './tema.ts';
import type { Curva, Tema } from './tema.ts';

export type Coordenada = { readonly x: number; readonly y: number };
type Celdas = Estado['celdas'];

/**
 * Un grano que sale de una celda que se derrumba: hacia el centro de la vecina `hacia` o, si `fuera`, hacia la
 * posición virtual `hacia` al otro lado del borde, de donde desaparece.
 */
export type Movimiento = {
  readonly desde: Coordenada;
  readonly hacia: Coordenada;
  readonly fuera: boolean;
  readonly direccion: Direccion;
};

export type PasoAdicion = {
  readonly tipo: 'adicion';
  readonly duracion: number;
  readonly antes: Celdas;
  readonly despues: Celdas;
  /** Celdas que reciben granos, por filas. */
  readonly celdas: readonly Coordenada[];
};

export type PasoAlerta = {
  readonly tipo: 'alerta';
  readonly duracion: number;
  readonly k: number;
  /** La rejilla no cambia durante la alerta. */
  readonly rejilla: Celdas;
  /** Celdas inestables al empezar la oleada, que parpadean. */
  readonly celdas: readonly Coordenada[];
};

export type PasoDerrumbe = {
  readonly tipo: 'derrumbe';
  readonly duracion: number;
  readonly k: number;
  readonly antes: Celdas;
  readonly despues: Celdas;
  /** Celdas que se derrumban, en el orden de los eventos. */
  readonly celdas: readonly Coordenada[];
  /** Cuatro por celda que se derrumba, en el orden arriba, derecha, abajo, izquierda. */
  readonly movimientos: readonly Movimiento[];
};

export type Paso = PasoAdicion | PasoAlerta | PasoDerrumbe;

export type Cascada = {
  readonly pasos: readonly Paso[];
  /** Suma de las duraciones de los pasos, en milisegundos al ritmo 1. */
  readonly duracionTotal: number;
  readonly celdasAntes: Celdas;
  readonly celdasFinales: Celdas;
};

/** Los eventos no describen una cascada coherente con la rejilla anterior. */
export type ErrorCascada = { readonly tipo: 'CascadaInvalida'; readonly motivo: string };

/** Desplazamiento de cada dirección de reparto: arriba es `y − 1` y derecha `x + 1`. */
export const VECTORES: Readonly<Record<Direccion, Coordenada>> = {
  arriba: { x: 0, y: -1 },
  derecha: { x: 1, y: 0 },
  abajo: { x: 0, y: 1 },
  izquierda: { x: -1, y: 0 },
};
const DIRECCIONES: readonly Direccion[] = ['arriba', 'derecha', 'abajo', 'izquierda'];

/** Granos que pierde una celda al derrumbarse: uno por dirección. */
const PERDIDA = DIRECCIONES.length;

type R<T> = { readonly ok: true; readonly valor: T } | { readonly ok: false; readonly error: ErrorCascada };
const invalida = (motivo: string): { readonly ok: false; readonly error: ErrorCascada } => ({
  ok: false,
  error: { tipo: 'CascadaInvalida', motivo },
});

const clave = (c: Coordenada): string => `${c.x},${c.y}`;
const copiar = (celdas: Celdas): number[][] => celdas.map((fila) => [...fila]);

/**
 * Reconstruye la cascada de una tirada a partir de la rejilla anterior a `Confirmar` y de sus eventos, en el orden
 * de la especificación. Solo usa la geometría (vecinas dentro o fuera de la rejilla) y lo que dicen los eventos:
 * las adiciones de `AdicionAplicada` y, por oleada, que cada celda de `OleadaIniciada` pierde 4 y envía 1 en cada
 * dirección. Si los eventos son incoherentes devuelve `CascadaInvalida`. Nunca lanza ni muta la entrada.
 */
export function construirCascada(
  celdasAntes: Celdas,
  eventos: readonly Evento[],
  lado: number,
  umbral: number,
  tema: Tema = TEMA,
): R<Cascada> {
  if (!Number.isInteger(lado) || lado < 1) return invalida(`lado no válido: ${lado}`);
  if (celdasAntes.length !== lado || celdasAntes.some((f) => f.length !== lado)) {
    return invalida(`la rejilla anterior no es de ${lado} × ${lado}`);
  }
  const dentro = (c: Coordenada): boolean =>
    Number.isInteger(c.x) && Number.isInteger(c.y) && c.x >= 0 && c.x < lado && c.y >= 0 && c.y < lado;
  const { duraciones } = tema.animacion;
  const pasos: Paso[] = [];
  let rejilla = copiar(celdasAntes);

  // 1. Adiciones: todos los `AdicionAplicada` van antes de la primera oleada.
  let i = 0;
  const afectadas: Coordenada[] = [];
  const conAdicion = copiar(rejilla);
  for (; i < eventos.length; i++) {
    const e = eventos[i];
    if (e === undefined || e.tipo === 'OleadaIniciada') break;
    if (e.tipo === 'Derrumbe' || e.tipo === 'GranoFuera' || e.tipo === 'OleadaTerminada') {
      return invalida(`${e.tipo} antes de cualquier OleadaIniciada`);
    }
    if (e.tipo !== 'AdicionAplicada') continue;
    if (!dentro(e)) return invalida(`AdicionAplicada fuera de la rejilla: (${e.x}, ${e.y})`);
    if (!Number.isInteger(e.cantidad) || e.cantidad < 1) return invalida(`AdicionAplicada con cantidad ${e.cantidad}`);
    const fila = conAdicion[e.y];
    if (fila === undefined) return invalida('fila inexistente');
    fila[e.x] = (fila[e.x] ?? 0) + e.cantidad;
    afectadas.push({ x: e.x, y: e.y });
  }
  if (afectadas.length > 0) {
    pasos.push({ tipo: 'adicion', duracion: duraciones.adicion, antes: rejilla, despues: conAdicion, celdas: afectadas });
    rejilla = conAdicion;
  }

  // 2. Oleadas: OleadaIniciada, por celda Derrumbe y sus GranoFuera, y OleadaTerminada.
  let k = 0;
  while (i < eventos.length) {
    const e = eventos[i];
    i++;
    if (e === undefined) break;
    if (e.tipo === 'AdicionAplicada') return invalida('AdicionAplicada después de empezar las oleadas');
    if (e.tipo === 'Derrumbe' || e.tipo === 'GranoFuera' || e.tipo === 'OleadaTerminada') {
      return invalida(`${e.tipo} de la oleada ${e.k} fuera de su OleadaIniciada`);
    }
    if (e.tipo !== 'OleadaIniciada') continue;
    k++;
    if (e.k !== k) return invalida(`se esperaba la oleada ${k} y llegó la ${e.k}`);
    const oleada = reconstruirOleada(rejilla, e.celdas, eventos, i, k, umbral, dentro);
    if (!oleada.ok) return oleada;
    i = oleada.valor.siguiente;
    pasos.push({ tipo: 'alerta', duracion: duraciones.alerta, k, rejilla, celdas: e.celdas.map((c) => ({ x: c.x, y: c.y })) });
    pasos.push({
      tipo: 'derrumbe',
      duracion: duraciones.derrumbe,
      k,
      antes: rejilla,
      despues: oleada.valor.despues,
      celdas: oleada.valor.celdas,
      movimientos: oleada.valor.movimientos,
    });
    rejilla = oleada.valor.despues;
  }

  const inestable = rejilla.flatMap((fila, y) => fila.flatMap((v, x) => (v >= umbral ? [`(${x}, ${y})`] : [])));
  if (inestable.length > 0) return invalida(`la cascada termina con celdas inestables: ${inestable.join(', ')}`);
  const duracionTotal = pasos.reduce((suma, p) => suma + p.duracion, 0);
  return { ok: true, valor: { pasos, duracionTotal, celdasAntes, celdasFinales: rejilla } };
}

type Oleada = {
  readonly despues: number[][];
  readonly celdas: Coordenada[];
  readonly movimientos: Movimiento[];
  /** Índice del primer evento tras el `OleadaTerminada`. */
  readonly siguiente: number;
};

/** Reconstruye una oleada desde el evento `inicio` (el siguiente al `OleadaIniciada`) hasta su `OleadaTerminada`. */
function reconstruirOleada(
  rejilla: Celdas,
  inestables: readonly Coordenada[],
  eventos: readonly Evento[],
  inicio: number,
  k: number,
  umbral: number,
  dentro: (c: Coordenada) => boolean,
): R<Oleada> {
  // Las celdas anunciadas deben ser exactamente las inestables de la rejilla, y poder perder 4 granos.
  const anunciadas = new Set<string>();
  for (const c of inestables) {
    if (!dentro(c)) return invalida(`OleadaIniciada ${k} con una celda fuera de la rejilla: (${c.x}, ${c.y})`);
    const v = rejilla[c.y]?.[c.x] ?? 0;
    if (v < umbral || v < PERDIDA) return invalida(`OleadaIniciada ${k} con la celda estable (${c.x}, ${c.y})`);
    if (anunciadas.has(clave(c))) return invalida(`OleadaIniciada ${k} repite la celda (${c.x}, ${c.y})`);
    anunciadas.add(clave(c));
  }
  const faltan = rejilla.flatMap((fila, y) => fila.flatMap((v, x) => (v >= umbral && !anunciadas.has(`${x},${y}`) ? [1] : [])));
  if (inestables.length === 0 || faltan.length > 0) {
    return invalida(`OleadaIniciada ${k} no anuncia exactamente las celdas inestables`);
  }

  const despues = copiar(rejilla);
  const llegadas: Coordenada[] = [];
  const celdas: Coordenada[] = [];
  const movimientos: Movimiento[] = [];
  const derrumbadas = new Set<string>();
  let fueraTotal = 0;
  let i = inicio;
  for (;;) {
    const e = eventos[i];
    if (e === undefined) return invalida(`la oleada ${k} no termina`);
    i++;
    if (e.tipo === 'OleadaTerminada') {
      if (e.k !== k) return invalida(`OleadaTerminada ${e.k} dentro de la oleada ${k}`);
      if (derrumbadas.size !== anunciadas.size) return invalida(`en la oleada ${k} no se derrumban todas las inestables`);
      if (e.derrumbes !== derrumbadas.size || e.granosFuera !== fueraTotal) {
        return invalida(`los totales de OleadaTerminada ${k} no cuadran con sus eventos`);
      }
      break;
    }
    if (e.tipo !== 'Derrumbe') return invalida(`${e.tipo} inesperado dentro de la oleada ${k}`);
    if (e.k !== k) return invalida(`Derrumbe de la oleada ${e.k} dentro de la oleada ${k}`);
    const origen = { x: e.x, y: e.y };
    if (!anunciadas.has(clave(origen))) return invalida(`Derrumbe de (${e.x}, ${e.y}), que no está en OleadaIniciada ${k}`);
    if (derrumbadas.has(clave(origen))) return invalida(`la celda (${e.x}, ${e.y}) se derrumba dos veces en la oleada ${k}`);
    derrumbadas.add(clave(origen));
    celdas.push(origen);

    // Sus GranoFuera, justo detrás: deben ser exactamente las direcciones cuya vecina cae fuera de la rejilla.
    const salidas = new Set<string>();
    while (eventos[i]?.tipo === 'GranoFuera') {
      const g = eventos[i];
      i++;
      if (g?.tipo !== 'GranoFuera') break;
      if (g.k !== k || g.x !== e.x || g.y !== e.y) return invalida(`GranoFuera de (${g.x}, ${g.y}) tras el Derrumbe de (${e.x}, ${e.y})`);
      if (!(DIRECCIONES as readonly string[]).includes(g.direccion)) return invalida(`dirección desconocida: ${String(g.direccion)}`);
      if (salidas.has(g.direccion)) return invalida(`GranoFuera repetido hacia ${g.direccion} desde (${e.x}, ${e.y})`);
      salidas.add(g.direccion);
    }
    const fila = despues[e.y];
    if (fila === undefined) return invalida('fila inexistente');
    fila[e.x] = (fila[e.x] ?? 0) - PERDIDA;
    for (const direccion of DIRECCIONES) {
      const v = VECTORES[direccion];
      const hacia = { x: e.x + v.x, y: e.y + v.y };
      const fuera = !dentro(hacia);
      if (fuera !== salidas.has(direccion)) {
        return invalida(`el grano hacia ${direccion} desde (${e.x}, ${e.y}) no coincide con sus GranoFuera`);
      }
      movimientos.push({ desde: origen, hacia, fuera, direccion });
      if (fuera) fueraTotal++;
      else llegadas.push(hacia);
    }
  }
  // Los granos que llegan a una vecina interior se suman cuando todas las inestables ya perdieron los suyos.
  for (const c of llegadas) {
    const fila = despues[c.y];
    if (fila !== undefined) fila[c.x] = (fila[c.x] ?? 0) + 1;
  }
  return { ok: true, valor: { despues, celdas, movimientos, siguiente: i } };
}

/** Grano en vuelo en un cuadro: posición en unidades de celda (el centro de la celda `(x, y)` es `(x, y)`). */
export type GranoEnVuelo = { readonly x: number; readonly y: number; readonly fuera: boolean; readonly opacidad: number };

/** Cuadro de la animación en un instante. */
export type Cuadro = {
  /** Instante del cuadro, ya acotado a `[0, duracionTotal]`. */
  readonly tMs: number;
  /** Carga que se muestra en cada celda, indexada `[y][x]`. */
  readonly celdas: Celdas;
  readonly granosEnVuelo: readonly GranoEnVuelo[];
  /** Celdas que parpadean, con su intensidad entre 0 y 1. */
  readonly alertas: readonly (Coordenada & { readonly intensidad: number })[];
  /** Celdas que reciben granos, con el avance de su efecto de aparición entre 0 y 1. */
  readonly adiciones: readonly (Coordenada & { readonly progreso: number })[];
  readonly terminado: boolean;
};

/** Aplica una curva de aceleración a `u` entre 0 y 1; las curvas van de 0 a 1 sin salirse. */
export function aplicarCurva(curva: Curva, u: number): number {
  const v = Math.min(1, Math.max(0, u));
  switch (curva) {
    case 'lineal':
      return v;
    case 'entradaSalidaCuadratica':
      return v < 0.5 ? 2 * v * v : 1 - (-2 * v + 2) ** 2 / 2;
    case 'entradaSalidaCubica':
      return v < 0.5 ? 4 * v ** 3 : 1 - (-2 * v + 2) ** 3 / 2;
  }
}

/** Acota un instante a `[0, total]`; NaN cuenta como 0. */
function acotar(tMs: number, total: number): number {
  if (Number.isNaN(tMs)) return 0;
  return Math.min(Math.max(0, tMs), total);
}

/**
 * Cuadro de la cascada en el instante `tMs`, acotado a `[0, duracionTotal]`. En 0 es la rejilla anterior y en la
 * duración total exactamente la final. Un instante en la frontera entre dos pasos pertenece al que empieza.
 * Función pura y determinista.
 */
export function muestrear(cascada: Cascada, tMs: number, tema: Tema = TEMA): Cuadro {
  const t = acotar(tMs, cascada.duracionTotal);
  let inicio = 0;
  for (const paso of cascada.pasos) {
    const fin = inicio + paso.duracion;
    if (t < fin) return muestrearPaso(paso, (t - inicio) / paso.duracion, t, tema);
    inicio = fin;
  }
  return { tMs: t, celdas: cascada.celdasFinales, granosEnVuelo: [], alertas: [], adiciones: [], terminado: true };
}

/** Cuadro dentro de un paso, con `u` el avance del paso en `[0, 1)`. */
function muestrearPaso(paso: Paso, u: number, tMs: number, tema: Tema): Cuadro {
  const vacio = { tMs, granosEnVuelo: [], alertas: [], adiciones: [], terminado: false };
  const animacion = tema.animacion;
  switch (paso.tipo) {
    case 'adicion': {
      // Cada celda afectada sube grano a grano de «antes» a «después» al avanzar el paso.
      const celdas = paso.antes.map((fila, y) =>
        fila.map((antes, x) => antes + Math.floor(((paso.despues[y]?.[x] ?? antes) - antes) * u)),
      );
      return { ...vacio, celdas, adiciones: paso.celdas.map((c) => ({ ...c, progreso: u })) };
    }
    case 'alerta': {
      const intensidad = Math.abs(Math.sin(Math.PI * animacion.pulsosAlerta * u));
      return { ...vacio, celdas: paso.rejilla, alertas: paso.celdas.map((c) => ({ ...c, intensidad })) };
    }
    case 'derrumbe': {
      // Al empezar, las celdas que caen pierden sus granos, que vuelan durante todo el paso y se suman al llegar.
      const celdas = copiar(paso.antes);
      for (const c of paso.celdas) {
        const fila = celdas[c.y];
        if (fila !== undefined) fila[c.x] = (fila[c.x] ?? 0) - PERDIDA;
      }
      const e = aplicarCurva(animacion.curva, u);
      const desvanecer = animacion.tramoDesvanecer;
      const granosEnVuelo = paso.movimientos.map((m) => {
        const v = VECTORES[m.direccion];
        const destino = m.fuera
          ? { x: m.desde.x + v.x * animacion.distanciaFuera, y: m.desde.y + v.y * animacion.distanciaFuera }
          : m.hacia;
        const opacidad = m.fuera && desvanecer > 0 && u > 1 - desvanecer ? (1 - u) / desvanecer : 1;
        return {
          x: m.desde.x + (destino.x - m.desde.x) * e,
          y: m.desde.y + (destino.y - m.desde.y) * e,
          fuera: m.fuera,
          opacidad,
        };
      });
      return { ...vacio, celdas, granosEnVuelo };
    }
  }
}
