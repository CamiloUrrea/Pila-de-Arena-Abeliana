# Especificación del núcleo (v0.2)

> Copia versionada para el repositorio. La fuente de verdad es el documento «MVP - Juego de la Pila de Arena Abeliana», pestaña «Especificación del núcleo». Si la especificación cambia, se vuelve a exportar y se sube de versión.

## Alcance

Esta especificación fija el comportamiento exacto del paquete `core` para una ronda del MVP: datos, resolución de las oleadas, puntos, eventos y pruebas. Cubre el hito H1; la progresión entre rondas (H6) y los bonus (H5) quedan como ganchos.

Principios innegociables:

- El núcleo es una función pura: sin reloj, sin azar global y sin efectos secundarios.
- El estado es JSON plano y serializable.
- Toda la aritmética es entera.
- La misma configuración, semilla y lista de acciones producen exactamente los mismos estados y eventos.

## Datos

Las celdas se indexan con x = columna e y = fila, con el origen arriba a la izquierda. Los puntos se guardan en centésimas: 100 equivalen a 1 punto.

### Configuración de ronda

| Campo | Significado | Valor inicial |
| --- | --- | --- |
| `lado` | Lado de la rejilla cuadrada | 3 |
| `umbral` | Granos que hacen inestable a una celda | 4 (fijo en H1) |
| `tiradas` | Tiradas disponibles en la ronda | 5 |
| `tamanoMano` | Granos robados por tirada | 5 |
| `siembra` | Mínimo y máximo de granos por celda al empezar | 0 y 2 |
| `mazo` | Cantidad de cada tipo de grano | 20 normales, 6 pesados, 4 explosivos |
| `meta` | Puntos de desborde necesarios, en centésimas | 1000 (a calibrar en H2) |
| `multiplicadorPorOleada` | Aumento por oleada, en centésimas | 10 |
| `topeOleadas` | Máximo de oleadas por tirada | 1000 |

### Estado

| Campo | Contenido |
| --- | --- |
| `config` | Copia de la configuración de la ronda |
| `celdas` | Matriz de `lado × lado` enteros mayores o iguales que 0, por filas |
| `fase` | `colocando`, `ganada` o `perdida` |
| `mano` | Granos de la mano; cada uno con su tipo y, si ya se colocó en esta tirada, su celda |
| `mazo` y `usados` | Tipos restantes en orden de robo y tipos ya jugados |
| `tiradasRestantes` | Entero |
| `puntos` | Puntos acumulados en la ronda, en centésimas |
| `rng` | Estado de cada flujo de azar con nombre |

### Acciones

| Acción | Efecto | Condición |
| --- | --- | --- |
| `Colocar(indiceMano, x, y)` | Asigna ese grano de la mano a la celda; es provisional y no cambia las celdas | Fase `colocando`, grano sin colocar y celda dentro de la rejilla |
| `Deshacer` | Quita la última colocación provisional de la tirada | Hay al menos una colocación |
| `Confirmar` | Resuelve la tirada | Fase `colocando` y todos los granos de la mano colocados |

Varios granos pueden ir a la misma celda.

## Resolución de una tirada

`Confirmar` ejecuta estos pasos en orden, sin intervención del jugador:

1. **Aplicar las adiciones.** Cada grano colocado suma a su celda: el normal 1, el pesado 2 y el explosivo 1 más 1 a cada vecino que esté dentro de la rejilla. Los vecinos fuera de la rejilla no reciben nada y no dan puntos. Las adiciones son conmutativas, así que el orden de colocación no importa.
2. **Repetir oleadas** mientras haya celdas con `umbral` granos o más, hasta `topeOleadas`. En cada oleada k, empezando en 1:
   - Se toma el conjunto de celdas inestables al inicio de la oleada.
   - Todas se derrumban a la vez: cada una pierde 4 granos y envía 1 a cada vecino (arriba, derecha, abajo, izquierda). Una celda se derrumba como máximo una vez por oleada, aunque tenga 8 granos o más.
   - Cada grano enviado fuera de la rejilla sale y suma `100 + multiplicadorPorOleada × (k − 1)` centésimas de punto.
   - Los granos enviados hacia dentro se suman a la celda vecina cuando todas las inestables ya perdieron los suyos.
3. Si tras `topeOleadas` oleadas siguen quedando celdas inestables, la resolución falla: `aplicar` devuelve el error tipado `ResolucionNoTermino`, descarta la tirada y deja el estado como estaba antes de `Confirmar`, sin eventos. En un montón de arena finito esto no puede ocurrir; el tope solo detecta errores de implementación.
4. Los granos de la mano pasan a `usados`.
5. Se evalúa el fin de la tirada (sección siguiente).

El calendario paralelo es parte de las reglas porque el número de oleadas, y con él los puntos, dependen de él. La configuración estable final no depende del calendario, y eso es lo que comprueba la propiedad abeliana.

Los eventos de una oleada se emiten siempre en el mismo orden: celdas por filas, y para cada celda las direcciones arriba, derecha, abajo, izquierda.

## Puntos, victoria y derrota

- Un grano que sale en la oleada k vale `100 + multiplicadorPorOleada × (k − 1)` centésimas. La oleada se cuenta desde 1 en cada tirada, así que el multiplicador se reinicia en cada `Confirmar`.
- Los puntos se suman a `puntos` al terminar cada oleada.
- Al confirmar, `tiradasRestantes` baja en 1.
- Al terminar la última oleada, y no a mitad de la cascada, se evalúa el fin de la tirada:
  1. Si `puntos` es mayor o igual que `meta`, la fase pasa a `ganada` y se emite `RondaGanada`. Los puntos sobrantes se conservan.
  2. Si no, y `tiradasRestantes` es 0, la fase pasa a `perdida` y se emite `RondaPerdida`.
  3. Si no, se roba una mano nueva de `tamanoMano` granos de la cabeza del mazo. La mano jugada ya está en `usados`.
- Si al robar quedan menos granos en el mazo que `tamanoMano`, se toman los que queden, los `usados` se barajan con el flujo de azar `mazo` y pasan a ser el mazo nuevo, y la mano se completa con los primeros de ese mazo. La configuración exige `tamanoMano` menor o igual que el total del mazo, así que siempre alcanza.

## Eventos

La interfaz y el sonido solo consumen estos eventos; ninguno de ellos decide nada del juego.

| Evento | Datos | Cuándo se emite |
| --- | --- | --- |
| `ManoRobada` | Tipos de los granos | Al empezar la ronda y tras cada tirada que no la termina |
| `GranoColocado` | `indiceMano`, `x`, `y` | Al colocar |
| `ColocacionDeshecha` | `indiceMano` | Al deshacer |
| `TiradaConfirmada` | Número de tirada | Al empezar `Confirmar` |
| `AdicionAplicada` | `x`, `y`, cantidad | Una vez por celda afectada en el paso 1, por filas |
| `OleadaIniciada` | `k`, celdas inestables | Al empezar cada oleada |
| `Derrumbe` | `k`, `x`, `y` | Una vez por celda inestable |
| `GranoFuera` | `k`, `x`, `y`, dirección, puntos | Una vez por cada grano que sale |
| `OleadaTerminada` | `k`, derrumbes, granos fuera, puntos ganados | Al terminar cada oleada |
| `TiradaResuelta` | Oleadas, granos fuera, puntos ganados y puntos totales | Tras la última oleada |
| `RondaGanada` y `RondaPerdida` | Puntos finales | Al terminar la ronda |

## Interfaz pública y serialización

La interfaz del paquete son estas funciones puras, que nunca modifican su entrada:

- `crearRonda(config, semilla)` devuelve el estado inicial: siembra la rejilla, baraja el mazo, roba la primera mano y emite `ManoRobada`.
- `aplicar(estado, accion)` devuelve `{ estado, eventos }`. Una acción ilegal o una resolución que no termina (`ResolucionNoTermino`) devuelve un error tipado, no lanza excepciones, deja el estado intacto y no emite eventos.
- `accionesLegales(estado)` lista las acciones permitidas, para los bots y las pruebas.
- `reproducir(config, semilla, acciones)` devuelve el estado final y todos los eventos de una partida.
- `serializar(estado)` y `deserializar(texto)` son inversas exactas e incluyen el estado del azar.

Una partida queda definida por su configuración, su semilla y su lista de acciones.

## Aleatoriedad

Todo el azar sale de flujos con nombre derivados de una sola semilla de 32 bits, de modo que consumir un flujo no altera a los demás.

- **Flujos:** `siembra` y `mazo` en H1, y `bonus` más adelante. El estado inicial de cada uno sale de combinar la semilla con su nombre mediante una función hash.
- **Algoritmo:** de 32 bits, con estado serializable y sin dependencias. La tarea T1.2 elige entre sfc32 y xoshiro128** y documenta la decisión.
- **Prohibido:** `Math.random`, `Date` y cualquier otra fuente externa, con una regla de linter que lo haga cumplir.
- **Barajado:** Fisher–Yates con el flujo `mazo`, con índices sin sesgo de módulo.
- **Siembra:** se recorren las celdas por filas y cada una toma un entero uniforme entre el mínimo y el máximo configurados.

## Invariantes y pruebas

Estas pruebas forman el criterio de cierre de H1. Las de propiedades se escriben con fast-check y corren con rejillas de 1 a 9 de lado y cargas aleatorias.

| Prueba | Qué comprueba |
| --- | --- |
| Orden abeliano | Un resolvedor de prueba que derrumba una celda inestable cada vez, en orden aleatorio, llega a la misma configuración final, al mismo número de derrumbes por celda y al mismo total de granos fuera que el calendario paralelo |
| Conservación | Granos antes más granos añadidos es igual a granos después más granos fuera, en cada tirada. Los granos añadidos incluyen los extras del explosivo |
| Estabilidad final | Tras resolver, ninguna celda tiene `umbral` granos o más |
| Terminación | La resolución termina antes de `topeOleadas` partiendo de cargas alcanzables (rejilla estable más una mano legal). No se generan cargas arbitrarias enormes, porque legítimamente superan el tope |
| Determinismo | Reproducir dos veces la misma partida da estados y eventos idénticos |
| Idempotencia | Resolver una configuración ya estable no cambia nada ni emite oleadas |
| Serialización | `deserializar(serializar(e))` es igual a `e`, y seguir jugando tras la ida y vuelta da el mismo resultado que seguir sin ella |
| Validez del estado | Celdas enteras mayores o iguales que 0, y mazo más mano más usados siempre igual a la composición configurada |
| Reciclaje del mazo | Con tamanoMano 6 y 6 tiradas se roban 36 granos de un mazo de 30: la mano se completa con los granos restantes más los usados barajados, y mazo más mano más usados sigue igual a la composición configurada |
| Tope de oleadas | Con un topeOleadas pequeño forzado, la tirada devuelve ResolucionNoTermino y el estado queda idéntico al anterior |
| Independencia de flujos | Cambiar la composición del mazo no cambia la siembra de la rejilla con la misma semilla |
| Ejemplos de oro | Los tres casos de la sección siguiente, con sus resultados exactos |

## Ejemplos de oro

Resultados calculados a mano para una rejilla de 3×3 con `tamanoMano` 1, que las pruebas deben reproducir exactamente. Cada rejilla se lee por filas.

### A. Derrumbe en una esquina

Rejilla vacía salvo `(0,0)` con 3 granos; se coloca un grano normal en `(0,0)`.

```text
antes     después
3 0 0     0 1 0
0 0 0     1 0 0
0 0 0     0 0 0
```

Una oleada, 1 derrumbe, 2 granos fuera (arriba e izquierda), 200 centésimas de punto.

### B. Cascada completa

Rejilla con 3 granos en cada celda; se coloca un grano normal en el centro `(1,1)`.

```text
antes     después
3 3 3     1 3 1
3 3 3     3 0 3
3 3 3     1 3 1
```

| Oleada | Celdas que se derrumban | Granos fuera | Puntos (centésimas) |
| --- | --- | --- | --- |
| 1 | El centro | 0 | 0 |
| 2 | Los 4 bordes del medio | 4 | 440 |
| 3 | Las 4 esquinas y el centro | 8 | 960 |

Total: 3 oleadas, 10 derrumbes (el centro dos veces y las demás una), 12 granos fuera y 1400 centésimas de punto. Había 27 granos más el añadido, 28; quedan 16 dentro y 12 salieron.

### C. Explosivo en una esquina

Rejilla vacía; se coloca un grano explosivo en `(0,0)`.

```text
antes     después
0 0 0     1 1 0
0 0 0     1 0 0
0 0 0     0 0 0
```

Sin oleadas. Los dos vecinos que quedarían fuera de la rejilla no reciben nada y no dan puntos.

## Decisiones confirmadas

Decisiones revisadas y aprobadas al cerrar T0.1, con la alternativa descartada en cada una. Las dos últimas se añadieron al revisar la v0.1.

- **Una oleada, un derrumbe por celda: aprobado.** Una celda con 8 o más granos necesita varias oleadas, y las cargas grandes alargan la cascada. Alternativa descartada: derrumbes múltiples por oleada, que acortan las cascadas y bajan los puntos.
- **Explosivo en el borde: aprobado.** Los vecinos fuera de la rejilla no reciben nada ni dan puntos. Alternativa descartada: contarlos como granos que salen, que daría puntos sin cascada.
- **Victoria al final de la tirada: aprobado.** Se evalúa tras la última oleada. Los puntos sobrantes se conservan; su uso se decide en H6.
- **Colocación provisional en el núcleo: aprobado.** `Colocar` no cambia la rejilla hasta `Confirmar`, y `Deshacer` quita la última colocación. Alternativa descartada: guardar el borrador en la interfaz, que duplicaría el estado.
- **Puntos en centésimas: aprobado.** Todo bonus nuevo debe expresarse en enteros de centésimas, sin redondeos.
- **Esquinas frágiles: diferido a T5.2.** No bloquea H1. En T5.2 hay que fijar qué dirección fuera recibe el grano y actualizar la línea del bonus en la hoja de ruta, que hoy dice solo «3 granos en vez de 4».
- **Meta inicial: aprobada como valor de partida.** En el ejemplo B un solo grano en una rejilla llena de 3×3 da 14 puntos, más que la meta de 10; se recalibra en H2.
- **Orden de robo y reciclaje del mazo: corregido en v0.2.** La mano jugada pasa a `usados` antes de robar. Si quedan menos granos que `tamanoMano`, se toman los que queden, se reciclan los `usados` y se completa la mano. El caso es alcanzable: con Mano grande y Tirada extra se roban 36 granos de un mazo de 30.
- **Tope de oleadas: corregido en v0.2.** Es un detector de errores, no un camino de juego: devuelve `ResolucionNoTermino` y deja el estado intacto. La prueba de terminación solo genera cargas alcanzables.
