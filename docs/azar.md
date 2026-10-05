# Azar del núcleo

Implementación en `packages/core/src/azar.ts`. Todo es puro: cada operación recibe el estado de un flujo y devuelve el valor y el estado siguiente, sin mutar nada. No se usan `Math.random`, `Date`, flotantes en las mezclas ni BigInt.

## Algoritmo: xoshiro128\*\* 1.1

Se eligió xoshiro128\*\* (Blackman y Vigna) frente a sfc32, la otra opción de la especificación:

- **Periodo garantizado** de 2^128 − 1 para cualquier estado no nulo. sfc32 solo garantiza un periodo mínimo de 2^32 gracias a su contador; el resto depende del estado.
- **Vectores verificables:** el código C de referencia es público y de dominio público, así que las pruebas comparan con una fuente independiente.
- Estado de 128 bits como **cuatro enteros sin signo de 32 bits** (`EstadoFlujo`), que es JSON plano. El único estado prohibido es el de todo ceros.

Se usa la versión 1.1: la 1.0 pasaba por error `s[0]` en lugar de `s[1]` al mezclador.

## Flujos con nombre

`NombreFlujo` es `'siembra' | 'mazo'`; `bonus` se añade en H5. `Estado.rng` guarda exactamente esos dos flujos, y consumir uno no altera al otro.

`derivarFlujo(semilla, nombre)`, con la semilla entre 0 y 2^32 − 1:

1. **Hash del nombre:** FNV-1a de 32 bits sobre los códigos UTF-16 de sus caracteres (base `0x811c9dc5`, primo `0x01000193`).
2. **Combinación:** `base = semilla XOR hash(nombre)`.
3. **Expansión** con splitmix32: la palabra k (de 1 a 4) es `mezclar(base + k · 0x9e3779b9 mod 2^32)`, donde `mezclar` es la función final de splitmix32 (`z ^= z >>> 16; z *= 0x21f0aaad; z ^= z >>> 15; z *= 0x735a2d97; z ^= z >>> 15`).

**No nulo por construcción:** las cuatro entradas de `mezclar` son distintas entre sí, porque 0x9e3779b9 es impar, y `mezclar` es biyectiva (XOR con desplazamientos y productos por impares). Por tanto las cuatro palabras son distintas y como mucho una vale 0.

**Distintos por construcción:** para un mismo nombre, dos semillas distintas dan `base` distintas y, por la biyección, primeras palabras distintas. Dos nombres distintos dan flujos distintos salvo colisión del hash; `siembra` y `mazo` no colisionan.

## Entero en un rango

`enteroEnRango(flujo, min, max)` tiene límites inclusivos y admite hasta 2^32 valores (`n = max − min + 1`).

- Con `n = 1` devuelve `min` y no consume el flujo.
- **Rechazo:** se aceptan las salidas `u < 2^32 − (2^32 mod n)` y se devuelve `min + (u mod n)`; las demás se descartan y se vuelve a tirar. La zona aceptada es un múltiplo exacto de n, así que no hay sesgo de módulo. Con n = 2^32 nunca se rechaza y se devuelve `min + u`.
- `min > max`, límites que no son enteros seguros o un rango de más de 2^32 valores lanzan `RangeError`. Son errores de programación, no caminos de juego.

## Barajado

`barajar(items, flujo)` aplica Fisher–Yates: para `i` de `n − 1` a `1`, toma `j = enteroEnRango(0, i)` e intercambia las posiciones `i` y `j`. Devuelve un arreglo nuevo y el estado siguiente. Con 0 o 1 elementos no consume el flujo.

## Vectores de referencia

Fuente: `xoshiro128starstar.c` de <https://prng.di.unimi.it/> (con su `f2x.c`), descargado el 2026-10-05.

| Archivo | SHA-256 |
| --- | --- |
| `xoshiro128starstar.c` | `2e3e540e15e1b1edf6144509ba3a71bc4611e3676d52e03d567a0f230a141a67` |
| `f2x.c` | `62e9b22bd882c6dade29a57cabcd079abf83522218415e3e9a95a4e6086dac99` |

Se compiló sin modificar con `zig cc` 0.16.0 (paquete `ziglang` de pip, en un entorno temporal), desde un arnés que incluye el `.c`, asigna `s[]` y llama 10 veces a `next()`:

```c
#include <stdio.h>
#include "xoshiro128starstar.c"

static const uint32_t ESTADOS[][4] = {
	{ 1u, 2u, 3u, 4u },
	{ 0x9e3779b9u, 0x243f6a88u, 0xb7e15162u, 0xdeadbeefu },
	{ 0xffffffffu, 0xffffffffu, 0xffffffffu, 0xffffffffu },
	{ 1u, 0u, 0u, 0u },
};

int main(void) {
	for (int e = 0; e < 4; e++) {
		for (int i = 0; i < 4; i++) s[i] = ESTADOS[e][i];
		printf("[%u, %u, %u, %u] ->", ESTADOS[e][0], ESTADOS[e][1], ESTADOS[e][2], ESTADOS[e][3]);
		for (int k = 0; k < 10; k++) printf(" %u", next());
		printf(" | estado final [%u, %u, %u, %u]\n", s[0], s[1], s[2], s[3]);
	}
	return 0;
}
```

Las salidas y los estados finales están en `packages/core/test/azar.test.ts`. Los valores de `derivarFlujo` y del barajado con la semilla 12345 son de **regresión**: se fijaron con esta implementación y no son independientes.
