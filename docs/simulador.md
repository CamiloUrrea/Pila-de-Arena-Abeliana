# Simulador por lotes (`@pila/sim`)

El simulador juega muchas rondas con un bot y guarda un registro por ronda en un archivo JSONL. Los informes de métricas (T2.4) y la calibración (T2.5) leen esos archivos. Solo usa la interfaz pública de `@pila/core` ([`api-nucleo.md`](api-nucleo.md)).

## Uso

```sh
pnpm --filter @pila/sim simular -- --bot ciclico --rondas 20000
```

| Opción | Obligatoria | Por defecto | Significado |
| --- | --- | --- | --- |
| `--bot <nombre>` | sí | — | Bot del registro `BOTS`. Si no existe, se listan los disponibles. |
| `--rondas <n>` | sí | — | Número de rondas del lote (al menos 1). |
| `--semilla <s>` | no | `1` | Semilla inicial, entero de 0 a 4294967295. |
| `--desde <i>` | no | `0` | Índice global de la primera ronda del lote. |
| `--salida <ruta>` | no | `resultados/<bot>-<semilla>-<desde>-<rondas>.jsonl` | Archivo de salida, relativo al directorio de trabajo. Se sobrescribe. Con `pnpm --filter` el directorio es `packages/sim`. |
| `--config <archivo.json>` | no | — | Anulaciones parciales de la configuración. Se fusionan en profundidad en `siembra` y `mazo` (por ejemplo `{"siembra":{"max":3}}` cambia solo el máximo). |
| `--set campo=valor` | no | — | Repetible. Cambia un campo numérico de primer nivel: `lado`, `umbral`, `tiradas`, `tamanoMano`, `meta`, `multiplicadorPorOleada` o `topeOleadas`. Se aplica después de `--config`. |

La configuración parte de `CONFIG_INICIAL`, aplica `--config` y luego cada `--set`, y la configuración efectiva se valida siempre con `validarConfig`.

Códigos de salida:

- `0`: el lote terminó.
- `2`: error de uso o de configuración. Entran aquí las opciones desconocidas o mal formadas, un bot desconocido, un campo desconocido o mal tipado y una configuración que `validarConfig` rechaza.
- `1`: la simulación falló, por ejemplo porque un bot devolvió una acción ilegal.

Por pantalla se imprimen el bot, las rondas, las ganadas, las perdidas, el porcentaje de ganadas, la ruta del archivo, el tiempo y las rondas por segundo. El tiempo nunca se escribe en el archivo.

## Formato del archivo

Es JSONL: un objeto JSON por línea, con las claves siempre en el orden indicado.

**Primera línea, cabecera:**

| Campo | Contenido |
| --- | --- |
| `tipo` | `"cabecera"` |
| `formato` | `1` |
| `bot` | Nombre del bot. |
| `config` | Configuración efectiva completa, con las claves en el orden de `Config`. |
| `semillaInicial` | Semilla de la ronda de índice 0. |
| `desde` | Índice global de la primera ronda del archivo. |
| `rondas` | Número de rondas del archivo. |

**Después, una línea por ronda:**

| Campo | Contenido |
| --- | --- |
| `tipo` | `"ronda"` |
| `indice` | Índice global de la ronda. |
| `semilla` | Semilla de la ronda. |
| `fase` | `"ganada"` o `"perdida"`. |
| `puntos` | Puntos finales de la ronda, en centésimas. |
| `tiradas` | Tiradas confirmadas. |
| `porTirada` | Lista de `tiradas` elementos `{ oleadas, derrumbes, granosFuera, puntosGanados }`, en orden. |

## Magnitudes registradas

- **`oleadas`:** oleadas de la tirada (las del evento `TiradaResuelta`). La métrica de oleadas máximas en una tirada sale del máximo de este campo.
- **`derrumbes`:** derrumbes de la tirada, es decir, la suma de los de todas sus oleadas. Es el **tamaño de la avalancha** de la tirada.
- **`granosFuera`:** granos que salieron de la rejilla en la tirada.
- **`puntosGanados`:** centésimas ganadas en la tirada, con el multiplicador de cadena ya aplicado. Su suma sobre la ronda es `puntos`.
- **`puntos` y `fase`:** los finales de la ronda. `puntos >= meta` equivale a `fase` `ganada`.

Con esto se calculan las métricas de T2.4: rondas ganadas por bot, media y desviación de los puntos por ronda, distribución del tamaño de las avalanchas y oleadas máximas en una tirada.

## Semillas

La ronda de índice global `i` usa la semilla `(semillaInicial + i) mod 2^32`. Las semillas son secuenciales y no se derivan de la semilla inicial con XOR ni con un hash. Así cada ronda se identifica por su semilla y se puede repetir sola (con `reproducir` o con `--semilla <s> --rondas 1`), y un lote no depende de cómo se reparta en trozos. Con una derivación por XOR (`semillaInicial ^ i`), dos lotes cuyas semillas iniciales solo difieren en los bits bajos recorrerían las mismas semillas en otro orden: por ejemplo, con 2 rondas, las semillas iniciales 0 y 1 darían {0, 1} y {1, 0}. Lotes que parecen distintos medirían entonces las mismas rondas.

El bot tiene su propio flujo de azar por ronda: `derivarFlujo(semillaDelBot(semilla), 'mazo')`, donde `semillaDelBot` multiplica, suma una constante y aplica el finalizador de MurmurHash3 (todo con `Math.imul`). Así el azar del bot es independiente en la práctica de los flujos `siembra` y `mazo` del juego. Como `derivarFlujo` combina la semilla con el nombre del flujo mediante un XOR, una semilla del bot de la forma `semilla ^ c` daría exactamente el flujo `siembra` de la ronda con semilla `semilla ^ c ^ hash('mazo') ^ hash('siembra')`: el bot quedaría correlacionado con otra ronda del mismo lote.

## Lotes en paralelo

Para repartir un lote grande entre varios procesos, cada uno simula un trozo con la misma `--semilla` y un `--desde` distinto:

```sh
pnpm --filter @pila/sim simular -- --bot ciclico --semilla 1 --desde 0     --rondas 50000 --salida resultados/t0.jsonl &
pnpm --filter @pila/sim simular -- --bot ciclico --semilla 1 --desde 50000 --rondas 50000 --salida resultados/t1.jsonl &
wait
```

Las líneas de ronda de los trozos, una detrás de otra, son idénticas a las de un único lote de 100000 rondas. Cada trozo lleva su propia cabecera, con su `desde` y sus `rondas`.

## Determinismo

Los mismos argumentos producen el mismo archivo byte a byte: el núcleo es determinista, el bot es una función pura de su flujo de azar, las semillas son secuenciales y el archivo no contiene marcas de tiempo ni ningún otro dato que cambie entre ejecuciones.

## Contrato de un bot

```ts
type Bot = {
  readonly nombre: string;
  elegir(estado: Estado, acciones: readonly Accion[], azar: EstadoFlujo): readonly [Accion, EstadoFlujo];
};
```

- `elegir` es una función pura. Recibe el estado, las acciones legales (`accionesLegales(estado)`, nunca vacías) y el estado de su flujo de azar, y devuelve la acción elegida y el flujo siguiente. Para su azar debe usar las funciones de azar del núcleo (`siguienteU32`, `enteroEnRango`, `barajar`) sobre ese flujo.
- No guarda estado entre llamadas: lo que necesite recordar lo deduce del estado de la ronda o de su flujo.
- Si devuelve una acción que `aplicar` rechaza, o si la ronda supera `maxAcciones` (10 000 por defecto), la simulación se detiene con un error que incluye la semilla y el nombre del bot.
- Los bots se registran por nombre en `BOTS` (`packages/sim/src/bots/index.ts`).

## Bots

Ningún bot de esta lista usa `Deshacer`. Todos colocan primero el grano sin colocar de menor índice y eligen `Confirmar` cuando ya no queda ningún `Colocar` legal. Todos salvo `ciclico` eligen siempre de la lista de acciones que reciben, así que son legales por construcción. Solo `aleatorio` consume azar.

| Bot | Qué hace | Qué mide | Límites |
| --- | --- | --- | --- |
| `ciclico` | Coloca cada grano en la siguiente celda de un recorrido cíclico por filas, que continúa entre tiradas. Sin azar. | Una referencia determinista y reproducible, la del ejemplo de `ejemplo-ronda.ts`. | No mira la rejilla. Deduce su cursor del estado suponiendo manos de `tamanoMano` granos, cierto en H1. |
| `aleatorio` | Coloca el grano en una celda uniforme entre sus `Colocar` legales, con `enteroEnRango` sobre su flujo de azar. | El suelo de dificultad: lo que consigue alguien que juega sin criterio. Si gana casi siempre, la ronda es demasiado fácil. | Ninguna estrategia; su varianza es la del juego más la de sus elecciones. |
| `borde` | Coloca el grano en la celda del perímetro (`x` o `y` en el límite) con más granos actuales. En empate prefiere esquina a borde y, dentro de la misma categoría, la primera por filas. Sin azar: devuelve el flujo sin consumirlo. | Fuerza bruta voraz: empuja la rejilla a derrumbarse cerca del borde, donde los granos salen y puntúan. | Solo mira la carga actual, no anticipa cascadas ni el orden de la mano. En 3×3 el perímetro cubre 8 de las 9 celdas, así que se parece mucho a «la celda más cargada»; en rejillas mayores el interior pesa más. En lados 1 y 2 todas las celdas son perímetro. |
| `avaro` | Coloca el grano en la celda con más granos actuales, interior incluido; en empate, la primera por filas. Sin azar. | La voracidad pura: cargar la celda más llena para provocar derrumbes cuanto antes. | Solo mira la carga actual, no el tipo de grano ni el efecto en los vecinos, y no espera a acumular. Al incluir el interior, sus cascadas suelen empezar lejos del borde. |
| `cargador` | «Llena celdas hasta 3 y detona al final». En la última tirada coloca cada grano en la celda más cercana al centro (mínimo de `\|2x − (lado−1)\| + \|2y − (lado−1)\|`, empate por filas). En las demás proyecta el efecto del grano con `DEFINICIONES_GRANOS`, contando las colocaciones provisionales de la tirada, y entre las celdas donde nadie llega al umbral elige la de mayor carga proyectada en la propia celda (empate por filas). Si no hay ninguna, detona en la más cercana al centro. Sin azar. | Una estrategia de acumulación: cargar sin derrumbar para provocar una gran avalancha final. Mide si el multiplicador de cadena premia esperar. | Solo mira una tirada de profundidad: proyecta las adiciones, no resuelve oleadas ni anticipa la mano siguiente. La detonación es una heurística sencilla: el centro y la última tirada, sin buscar la celda que más cascada provoca. Si una detonación forzada deja una celda provisional en el umbral, el resto de la tirada ya no encuentra celdas válidas y también detona. |

Con `CONFIG_INICIAL` (meta 1000) y 20000 rondas, los cinco bots ganan el 100 % de las rondas: la meta inicial está por calibrar en H2 (T2.5), y por ahora no distingue entre bots.

## Informe de métricas de balance

```sh
pnpm --filter @pila/sim informe -- resultados/a.jsonl resultados/b.jsonl [--salida informe.md] [--estricto]
```

Lee uno o varios archivos JSONL del simulador, línea a línea (sin cargarlos enteros en memoria), y escribe por pantalla un informe en Markdown. Con `--salida` también lo guarda en ese archivo y crea la carpeta si falta.

- **Códigos de salida:** `0` si todo fue bien; `1` con `--estricto` si salta alguna alarma; `2` si un archivo no se puede leer, está vacío, no empieza por la cabecera, tiene un `formato` distinto de 1 o contiene una línea mal formada (el mensaje indica el archivo y la línea), y también ante un error de uso.
- **Determinismo:** el informe no lleva marcas de tiempo y usa los nombres de archivo, no sus rutas, así que los mismos archivos dan el mismo texto.

**Agrupación.** Las rondas se agrupan por bot y configuración, la de la cabecera. Una semilla repetida dentro de un mismo grupo (por ejemplo, dos lotes que se solapan) es un error, porque contaría dos veces la misma ronda. Cada configuración se etiqueta con los campos que distinguen a los grupos (por ejemplo `meta`) más `lado`, `tiradas`, `tamanoMano` y `multiplicadorPorOleada`. Los grupos se ordenan por configuración y, dentro de ella, por nombre de bot.

### Métricas

| Sección | Métrica | Definición |
| --- | --- | --- |
| Resumen | Archivos y rondas | Archivos leídos con su bot y sus rondas, y rondas por grupo. |
| Victorias | Victorias e intervalo | Ganadas entre rondas, con su intervalo de Wilson al 95 %. Si hay más de una configuración y más de un bot, también una tabla cruzada de victorias: bots en filas y configuraciones en columnas. |
| Ventaja del cargador sobre el borde | Diferencia por pares | En cada configuración con los dos bots, se emparejan las rondas por `semilla` (solo la intersección, cuyo tamaño se indica si los conjuntos difieren). Para cada semilla, `d = ganaCargador − ganaBorde` (1, 0 o −1). Se informa la media de `d` con su intervalo al 95 %. |
| Puntos de desborde | Media, desviación, mínimo y máximo | De los puntos finales de cada ronda, en puntos (centésimas entre 100). Los grupos con rondas ganadas llevan la nota: **los puntos de las rondas ganadas están truncados por la victoria; para medir la varianza real usa una meta inalcanzable** (por ejemplo `--set meta=1000000`). |
| Avalanchas | Tamaño | Derrumbes de una tirada. Sobre las tiradas con al menos un derrumbe: número, media, desviación, mediana, percentil 90, máximo, histograma en los tramos 1–2, 3–5, 6–10, 11–20 y 21 o más, y la parte del total de derrumbes que causa el 10 % de avalanchas más grandes (las ⌈0,1·n⌉ mayores). También el porcentaje de tiradas sin ningún derrumbe. Todo se calcula con un recuento por tamaño, sin guardar cada tirada. |
| Oleadas máximas | Máximo y tope | El máximo de oleadas en una sola tirada y su fracción de `topeOleadas`. |
| Bonus | — | No disponible hasta H5. |

### Fórmulas

- **Intervalo de Wilson al 95 %**, con `p = ganadas / n` y `z = 1,96`: centro `(p + z²/2n) / (1 + z²/n)` y semiancho `z / (1 + z²/n) · √(p(1−p)/n + z²/4n²)`. A diferencia del intervalo simple de Wald (`p ± z·√(p(1−p)/n)`), no se sale de [0, 1] y no degenera cuando `p` es 0 o 1.
- **Diferencia por pares:** media `d̄` de las diferencias e intervalo `d̄ ± z · s/√n`, con `s` la desviación muestral de las diferencias y `n` el número de pares (aproximación normal; con menos de 2 pares no hay intervalo).
- **Desviación muestral:** `s = √(Σ(xᵢ − x̄)² / (n − 1))`, acumulada en streaming con el algoritmo de Welford.
- **Percentil por rango más cercano:** el percentil `q` es el elemento de posición `⌈q·n⌉` (desde 1) de los valores ordenados. La mediana es el percentil 0,5 con la misma regla.

### Alarmas

Los umbrales son constantes con nombre en `UMBRALES_ALARMA` (`packages/sim/src/informe.ts`).

| Alarma | Se activa cuando | Umbral |
| --- | --- | --- |
| (a) | El bot `aleatorio` gana más del 90 % o menos del 10 % de las rondas de una configuración: es demasiado fácil o demasiado difícil para el suelo de dificultad. | `aleatorioMaximo` 0,9 y `aleatorioMinimo` 0,1 |
| (b) | La ventaja del cargador sobre el borde no es significativa: el extremo inferior del intervalo de la diferencia por pares es ≤ 0, o no hay pares suficientes para calcularlo. | 0 |
| (c) | La desviación de los puntos es mayor que la media en un grupo. | — |
| (d) | Las avalanchas son casi todas del mismo tamaño: coeficiente de variación (desviación entre media) menor que el umbral. | `coeficienteVariacionMinimo` 0,3 |
| (e) | Las oleadas máximas llegan a una fracción de `topeOleadas` o más. | `fraccionTopeOleadas` 0,5 |
