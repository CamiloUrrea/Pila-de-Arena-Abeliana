import type { EstadoFlujo, NombreFlujo } from './tipos.ts';

// Azar puro y determinista: xoshiro128** 1.1 (Blackman y Vigna) sobre estados inmutables.
// Cada operación recibe el estado de un flujo y devuelve el valor y el estado siguiente.
// Detalles y justificación en docs/azar.md.

const DOS_A_LA_32 = 0x1_0000_0000;

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** FNV-1a de 32 bits sobre los códigos UTF-16 del nombre. */
function hashNombre(nombre: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < nombre.length; i++) {
    h = Math.imul(h ^ nombre.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

/** Mezcla de splitmix32: biyección de 32 bits, así que entradas distintas dan salidas distintas. */
function mezclar(z: number): number {
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return (z ^ (z >>> 15)) >>> 0;
}

/**
 * Estado inicial del flujo `nombre` para `semilla` (entero de 0 a 2^32−1).
 * Las cuatro palabras mezclan entradas consecutivas de splitmix32, que son distintas entre sí;
 * como la mezcla es biyectiva, como mucho una palabra puede ser 0 y el estado nunca es nulo.
 */
export function derivarFlujo(semilla: number, nombre: NombreFlujo): EstadoFlujo {
  if (!Number.isInteger(semilla) || semilla < 0 || semilla >= DOS_A_LA_32) {
    throw new RangeError(`la semilla debe ser un entero de 0 a 2^32−1: ${semilla}`);
  }
  const base = (semilla ^ hashNombre(nombre)) >>> 0;
  const palabra = (k: number): number => mezclar((base + Math.imul(k, 0x9e3779b9)) >>> 0);
  return [palabra(1), palabra(2), palabra(3), palabra(4)];
}

/** Siguiente salida de 32 bits de xoshiro128** y el estado siguiente. */
export function siguienteU32(flujo: EstadoFlujo): readonly [valor: number, siguiente: EstadoFlujo] {
  const [s0, s1, s2, s3] = flujo;
  const valor = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
  const t = (s1 << 9) >>> 0;
  const n2 = (s2 ^ s0) >>> 0;
  const n3 = (s3 ^ s1) >>> 0;
  const n1 = (s1 ^ n2) >>> 0;
  const n0 = (s0 ^ n3) >>> 0;
  return [valor, [n0, n1, (n2 ^ t) >>> 0, rotl(n3, 11)]];
}

/**
 * Entero uniforme en `[min, max]` (inclusivo), sin sesgo de módulo.
 * Rechazo: con n valores se aceptan las salidas u < 2^32 − (2^32 mod n) y se devuelve min + (u mod n).
 * Un rango de un solo valor no consume el flujo.
 */
export function enteroEnRango(flujo: EstadoFlujo, min: number, max: number): readonly [valor: number, siguiente: EstadoFlujo] {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
    throw new RangeError(`los límites deben ser enteros seguros: [${min}, ${max}]`);
  }
  if (min > max) throw new RangeError(`min no puede superar a max: [${min}, ${max}]`);
  const n = max - min + 1;
  if (n > DOS_A_LA_32) throw new RangeError(`el rango no puede tener más de 2^32 valores: [${min}, ${max}]`);
  if (n === 1) return [min, flujo];

  const limite = DOS_A_LA_32 - (DOS_A_LA_32 % n);
  let actual = flujo;
  for (;;) {
    const [u, siguiente] = siguienteU32(actual);
    actual = siguiente;
    if (u < limite) return [min + (u % n), actual];
  }
}

/**
 * Fisher–Yates: para i de n−1 a 1, j = enteroEnRango(0, i) e intercambio de i y j.
 * Devuelve un arreglo nuevo; con 0 o 1 elementos no consume el flujo.
 */
export function barajar<T>(items: readonly T[], flujo: EstadoFlujo): readonly [barajado: T[], siguiente: EstadoFlujo] {
  const salida = [...items];
  let actual = flujo;
  for (let i = salida.length - 1; i >= 1; i--) {
    const [j, siguiente] = enteroEnRango(actual, 0, i);
    actual = siguiente;
    // slice/splice evitan leer índices que el tipo trataría como posiblemente indefinidos.
    const enI = salida.slice(i, i + 1);
    const enJ = salida.slice(j, j + 1);
    salida.splice(i, 1, ...enJ);
    salida.splice(j, 1, ...enI);
  }
  return [salida, actual];
}
