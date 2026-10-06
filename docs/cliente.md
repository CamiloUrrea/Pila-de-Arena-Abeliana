# Cliente web (`@pila/game`)

El cliente dibuja con PixiJS una ronda real creada con `@pila/core`: arriba, los indicadores (semilla y lado, etiqueta de cadena, ritmo, medidor de desborde y tiradas); en el centro, la rejilla con los granos de cada celda dibujados como puntos; abajo, la mano y los recuentos del mazo. El jugador elige qué grano de la mano coloca, lo coloca sobre una celda, puede deshacer y ve una vista previa de lo que sumarán los granos, también al pasar el ratón por una celda. Al confirmar la tirada, la cascada se anima oleada a oleada a partir de los eventos del núcleo (T3.3a), con puntos flotantes, una etiqueta de cadena, ritmo ajustable y aceleración progresiva (T3.3b). Los indicadores de la ronda llegan en T3.4. Al terminar una ronda se puede jugar otra sin recargar la página (T3.5a). Todavía no hay estadísticas de sesión ni almacenamiento (T3.5b) ni sonido.

## Arrancarlo

```sh
pnpm --filter @pila/game dev       # servidor de desarrollo de Vite (por defecto en http://localhost:5173/)
pnpm --filter @pila/game build     # compilación a packages/game/dist/
pnpm --filter @pila/game preview   # sirve la compilación
```

`pnpm check`, en la raíz, incluye la compilación del cliente después de los tipos, el linter y las pruebas.

La compilación usa una base relativa (`base: './'` en `vite.config.ts`): `dist/index.html` enlaza sus archivos como `./assets/…`, así que funciona servida desde cualquier carpeta o subruta (por ejemplo en itch.io). Una prueba lee la configuración exportada y comprueba esa base.

## Parámetros de la URL

| Parámetro | Valores | Por defecto |
| --- | --- | --- |
| `semilla` | Entero de 0 a 4294967295, escrito solo con dígitos. | Una semilla aleatoria de 32 bits (`crypto.getRandomValues`). |
| `lado` | Entero de 1 a 9, escrito solo con dígitos. | 3, el de `CONFIG_INICIAL`. |
| `ritmo` | Uno de los ritmos permitidos: 0,25, 0,5, 0,75, 1, 1,5, 2, 3 o 4, con punto o con coma decimal (`0.5` o `0,5`). | 1. |

Por ejemplo, `http://localhost:5173/?semilla=2026&lado=4&ritmo=0.5`. Un parámetro presente pero inválido (vacío, negativo, decimal donde no se admite, fuera de rango, un ritmo que no está en la lista o no numérico) no arranca el juego: la página muestra un mensaje en español con cada error. Los parámetros desconocidos se ignoran. La ronda se crea con `crearRonda({ ...CONFIG_INICIAL, lado }, semilla)`; si el núcleo rechaza la configuración, también se muestra el error.

## Controles

| Gesto | Efecto |
| --- | --- |
| Clic o toque en una ficha sin colocar | La selecciona. |
| Teclas `1` a `9` | Seleccionan la ficha con ese número (la `1` es la primera de la mano). |
| Flecha izquierda o derecha | Pasa a la ficha sin colocar anterior o siguiente, de forma circular, saltando las colocadas. |
| Clic o toque en una celda | Coloca ahí el grano seleccionado. |
| Clic o toque en «Deshacer» | Deshace la colocación más reciente y vuelve a seleccionar ese grano. |
| Clic o toque en la última ficha colocada | Lo mismo que «Deshacer». En otra ficha colocada, un mensaje explica que solo se puede deshacer la última. |
| `Z` o `Retroceso` | Lo mismo que «Deshacer». |
| Clic o toque en «Confirmar», o `Intro` o `Espacio` | Confirma la tirada, si la mano está completa. Si no, un mensaje pide colocar todos los granos. |
| Durante la cascada: cualquier clic o toque, `Intro` o `Espacio` | Salta al final de la animación. Lo demás no hace nada, salvo el ritmo. |
| Con la ronda terminada: clic o toque en «Otra ronda», `Intro`, `Espacio`, `r` o `R` | Empieza una ronda nueva. |
| `+` (o `=`) o `-` | Sube o baja el ritmo de la animación al siguiente valor permitido. `=` es un alias de `+`, porque en muchos teclados es la misma tecla sin Mayúsculas. Funciona en cualquier momento, también durante la cascada. |
| Pasar el ratón por una celda | Vista previa de la colocación candidata (ver más abajo). |

Las teclas no hacen nada con Ctrl, Alt o Cmd pulsados, para no interferir con los atajos del sistema y del navegador; Mayúsculas sí se admite, para que `Z` funcione.

**Regla de selección.** Al empezar se selecciona el primer grano de la mano. Tras colocar el grano `i` se selecciona el siguiente sin colocar con índice mayor que `i`; si no hay ninguno, el de menor índice sin colocar; y ninguno si la mano está completa. Tras deshacer se selecciona el grano deshecho. Así, colocar en orden recorre la mano de izquierda a derecha, y elegir una ficha a mano no hace volver al principio.

**Mensajes.** Una acción imposible (elegir una ficha colocada, deshacer sin nada colocado, tocar una celda con la mano completa, tocar una ficha colocada que no es la última…) no cambia nada, y la línea de información muestra en rojo claro por qué hasta la siguiente acción. Los mensajes los da `describirError`.

El cursor es una mano sobre las celdas cuando hay un grano seleccionado, sobre las fichas sin colocar y la última colocada, y sobre el botón cuando está activo.

**Vista previa al pasar el ratón.** Con un grano seleccionado, al pasar el ratón por una celda se dibuja lo que sumaría colocarlo ahí: sus puntos fantasma, más finos y tenues que los de los granos ya colocados, y el doble contorno si esa colocación volvería inestable alguna celda. Al salir del tablero o del lienzo, la vista previa desaparece. Con un dedo o un lápiz no hay «pasar por encima», así que en pantallas táctiles solo se ve la vista previa de los granos ya colocados.

**Confirmar y cascada.** El botón «Confirmar» solo está activo con la mano completa. Al confirmar, la rejilla se anima con lo que pasa en el núcleo: primero aparecen los granos colocados, y después, en cada oleada, las celdas inestables parpadean en el color de inestable y se derrumban, y sus cuatro granos vuelan a las vecinas o salen del tablero desvaneciéndose. Mientras tanto, las fichas y los botones se ven atenuados y la línea de información dice «Resolviendo…». Al terminar se dibuja el estado nuevo, con la mano nueva.

**Puntos flotantes.** Cada grano que sale del tablero deja un punto flotante con lo que vale (por ejemplo «+1» en la oleada 1 y «+1,5» en la 2, con el multiplicador 50 de la configuración inicial), junto al borde del tablero por el lado por el que sale. Dura el paso de derrumbe de su oleada: sube un poco y se desvanece en el último 40 % de su vida. Crece con la oleada: su escala es `1 + 0,15 × (k − 1)`, con tope 2.

**Etiqueta de cadena.** Durante la alerta y el derrumbe de la oleada `k`, el centro de la banda superior muestra «Oleada k · ×m · +P»: el multiplicador `m` de los granos de esa oleada (`(100 + multiplicadorPorOleada × (k − 1)) / 100`, por ejemplo «×1», «×1,5», «×2») resaltado en amarillo, y los puntos `P` de la tirada hasta ese momento. Los puntos suben al terminar cada oleada, como en el núcleo, y no grano a grano. Fuera de la cascada la etiqueta no aparece.

**Indicadores (T3.4).** `indicadores.ts` los calcula del estado del núcleo, sin PixiJS:

- **Medidor de desborde:** una barra con el progreso de los puntos hacia la meta (`proporcionMedidor(puntos, meta)`, acotado a `[0, 1]`) y, fuera de la barra, el texto «P / M» con `formatearPuntos`, para no depender del contraste con el relleno. El relleno cambia de color por tramos (`colorMedidor`): cian por debajo de la mitad, amarillo de la mitad a la meta y rosa con la meta alcanzada, con la barra llena. Durante una cascada muestra `puntosMostrados`: los puntos de antes más los de la tirada, que suben al terminar cada oleada. El relleno no salta: se acerca a su objetivo con `suavizar`, un suavizado exponencial determinista que el render llama con el `deltaMS` del ticker multiplicado por el ritmo.
- **Tiradas:** fichas pequeñas, llenas las que quedan y solo con contorno las gastadas (`fichasTiradas`). Al confirmar se descuenta enseguida, porque el estado nuevo ya trae el valor nuevo.
- **Mazo:** el texto de `describirMazo`, una línea por recuento («Mazo 17», «Normal 12», «Pesado 3», «Explosivo 2»), a la izquierda de la fila de fichas. Solo revela recuentos: `describirIndicadores` devuelve una estructura de números por tipo, nunca el orden de robo, y su resultado es el mismo para cualquier orden del mazo. Durante una cascada se muestra el mazo del estado de antes, coherente con la mano confirmada que sigue a la vista.
- **Celdas cargadas:** las celdas estables a un grano de caer (`cargada`, con carga `umbral − 1`; con el umbral 4, las de 3) llevan un contorno casi blanco y fino por fuera de la celda, en el hueco, cuya opacidad pulsa entre 0,5 y 1 (`intensidadPulso`, con el tiempo del ticker). Solo mientras se coloca y sin animación en curso.

`describirIndicadores(estado)` devuelve `{ medidor: { puntos, meta, proporcion, texto, metaAlcanzada }, tiradas: { total, restantes }, mazo: { total, porTipo } }`; `describirTiradas` da «Tiradas 3/5».

**Ritmo.** El ritmo multiplica el tiempo de la animación: con ×2 dura la mitad y con ×0,5, el doble. Empieza en el de la URL (`?ritmo=`, 1 por defecto) y cambia con `+` y `-` entre los valores permitidos (0,25, 0,5, 0,75, 1, 1,5, 2, 3 y 4); en los extremos se queda. Se muestra siempre a la derecha de la banda superior («ritmo ×1»).

**Aceleración progresiva.** Las cascadas largas van acelerando: la alerta y el derrumbe de la oleada `k` duran la base por `max(0,4; 0,9^(k − 1))`. La oleada 1 va a la duración base, cada oleada dura un 10 % menos que la anterior y desde la décima ninguna baja del 40 %. La adición no se acelera. El ritmo se aplica además, sobre estas duraciones.

**Fin de ronda y otra ronda.** Cuando acaba la cascada de la tirada que gana o pierde la ronda, un velo sobre el tablero muestra el título («RONDA GANADA» en amarillo o «RONDA PERDIDA» en rosa), los puntos sobre la meta («P / M»), las tiradas usadas («Tiradas usadas: k de N») y el botón primario «Otra ronda (Enter)». El botón, `Intro`, `Espacio`, `r` y `R` empiezan una ronda nueva sin recargar la página:

- con una semilla nueva (`semillaAleatoria`, de `crypto.getRandomValues`), el mismo lado y el mismo ritmo;
- el contador de ronda sube (empieza en 1) y se ve en la banda superior: «Ronda N · semilla S · lado L». Dura mientras la página siga abierta; todavía no se guarda;
- el medidor vuelve a 0 sin animación, y se borra cualquier cascada o mensaje pendiente;
- la URL se actualiza con `history.replaceState` y `urlConSemilla`, sin recargar: la semilla nueva sustituye a la anterior y se conservan el lado, el ritmo y los parámetros desconocidos, en su orden. Recargar la página repite la ronda en curso;
- si la ronda no se pudiera crear, se muestra el error de configuración en la línea de información.

`main.ts` crea las rondas con `nuevaRonda({ lado, semilla })` (de `rondas.ts`), que devuelve el estado de interfaz inicial o el error de configuración sin lanzar, también con una semilla inválida.

**Fases del flujo.** `flujo.ts` es la única fuente de verdad de qué entrada se acepta. `faseDeFlujo({ animando, estado })` da `animando` si hay una cascada en curso; si no, `fin` cuando la ronda ya no está en `colocando`, y `jugando` en otro caso. El render traduce cada tecla y cada clic a una acción y la pasa por `permitida(fase, accion)`:

| Acción | `jugando` | `animando` | `fin` |
| --- | --- | --- | --- |
| Seleccionar, ciclar, colocar, deshacer, confirmar | Sí | No | No |
| Saltar la animación | No | Sí | No |
| Otra ronda | No | No | Sí |
| Ritmo | Sí | Sí | Sí |

`interpretarAceptar(fase)` decide qué significan `Intro` y `Espacio`: confirmar en `jugando`, saltar en `animando` y otra ronda en `fin`. Un clic durante la cascada es «saltar» esté donde esté; con la ronda terminada, solo responde el botón «Otra ronda».

**Banda inferior.** Las fichas de la mano van en una fila centrada, en el orden de la mano: el normal es un círculo casi blanco, el pesado un círculo mayor violeta con dos puntos y el explosivo una estrella roja. Una ficha ya colocada se atenúa y la seleccionada lleva un anillo. Debajo, la línea de información describe el grano seleccionado («Explosivo: +1 en la celda y +1 en cada vecina»), dice «Mano completa» o muestra el mensaje de la última acción imposible. A la derecha, el botón primario «Confirmar» y, debajo, «Deshacer»; cada uno se ve apagado cuando no se puede usar.

## Arquitectura

La lógica de presentación son funciones puras, sin PixiJS ni DOM, que se prueban en Node con Vitest y fast-check. PixiJS solo dibuja lo que esas funciones describen.

| Módulo | Qué hace | ¿Puro? |
| --- | --- | --- |
| `src/parametros.ts` | `leerParametros(busqueda, generarSemilla)`: parsea la URL (semilla, lado y ritmo) y devuelve los parámetros o una lista de errores tipados con su mensaje. `urlConSemilla(busqueda, semilla)`: la consulta con la semilla nueva. `semillaAleatoria()`: la semilla del navegador, que se inyecta. La semilla por defecto la da la función inyectada. | Sí |
| `src/tema.ts` | Datos del aspecto: colores, bandas, proporciones, tipografía, fichas, vista previa y botón. | Sí (solo datos) |
| `src/textos.ts` | `TEXTOS`, los textos de la interfaz; `describirGrano(tipo)`, la descripción de un grano generada de `DEFINICIONES_GRANOS`; y `describirError(error)`, el mensaje de cada error del controlador y del núcleo. | Sí |
| `src/entrada.ts` | `accionDeTecla({ tecla, ctrl, alt, meta })`: qué gesto dispara una tecla, o `null`. | Sí |
| `src/controlador.ts` | `iniciarControlador`, `seleccionar`, `ciclar`, `colocar`, `deshacer`, `deshacerDesdeFicha` y `confirmar` sobre un estado de interfaz `{ estado, seleccionado }`. | Sí |
| `src/cascada.ts` | `construirCascada(celdasAntes, eventos, lado, umbral, multiplicadorPorOleada)`: los pasos de la animación de una tirada. `muestrear(cascada, tMs)`: el cuadro de un instante. `factorAceleracion`, `valorGranoFuera` y `escalaPopup`: las fórmulas de la aceleración, del valor de un grano y de la escala de los puntos flotantes. | Sí |
| `src/ritmo.ts` | `RITMOS`, los ritmos permitidos; `siguienteRitmo(actual, direccion)` y `formatearRitmo(ritmo)`. | Sí |
| `src/flujo.ts` | `faseDeFlujo`, `permitida` e `interpretarAceptar`: las fases del flujo y qué entrada acepta cada una. | Sí |
| `src/rondas.ts` | `nuevaRonda({ lado, semilla })`: una ronda nueva con su estado de interfaz inicial, o el error. | Sí |
| `src/indicadores.ts` | `proporcionMedidor`, `colorMedidor`, `puntosMostrados`, `describirIndicadores`, `fichasTiradas`, `suavizar` e `intensidadPulso`. | Sí |
| `src/reproductor.ts` | `crearReproductor`, `avanzar`, `saltar`, `cuadroActual` y `terminado`: el tiempo de una cascada, inmutable. | Sí |
| `src/previsualizacion.ts` | `calcularPrevistas(estado)`: la rejilla proyectada y los granos previstos por celda. `calcularPrevistasConCandidata(estado, indice, celda)`: lo mismo con una colocación hipotética más, y aparte lo que añade solo ella. | Sí |
| `src/disposicion.ts` | `disponer(ancho, alto, lado)`: la geometría de las bandas y de cada celda. `disponerMano(ventana, n)`: las fichas, la descripción y los botones. `celdaEn`, `fichaEn`, `botonConfirmarEn` y `botonDeshacerEn`: qué hay bajo un punto. | Sí |
| `src/vista.ts` | `describirCeldas(celdas, umbral, previstas?, candidatas?)`: posición lógica, carga, puntos sólidos, fantasma y de la candidata, número de respaldo, colores e inestabilidad actual, prevista y prevista solo por la candidata de cada celda. Recibe matrices, no el estado, para reutilizarla en las animaciones. | Sí |
| `src/render.ts` | `crearEscena(contenedor, semilla)`: crea la aplicación de PixiJS ajustada a la ventana y a la densidad de píxeles, expone `mostrarEstado(estado)`, atiende el puntero y el teclado, reproduce las cascadas con el ticker y redibuja tras cada acción, en cada cuadro de una cascada y al redimensionar. Es el único módulo que importa PixiJS. | No |
| `src/main.ts` | Punto de entrada: lee los parámetros, crea la ronda y la muestra, o muestra el error. | No |

**Controlador puro y dibujo.** `controlador.ts` decide qué acción del núcleo dispara cada gesto y qué grano queda seleccionado; `entrada.ts` traduce las teclas a gestos; `render.ts` solo pasa el puntero y el teclado a esas funciones, muestra el mensaje de los errores y vuelve a dibujar. El controlador usa solo la interfaz pública de `core`, nunca lanza ni muta, y todas sus funciones salvo `iniciarControlador` devuelven un `Resultado` con el nuevo estado de interfaz y los eventos del núcleo:

- `iniciarControlador(estado)` devuelve directamente `{ estado, seleccionado }` con el primer grano sin colocar (o `null`), porque no puede fallar.
- `seleccionar(ui, indice)` selecciona un grano de la mano sin colocar; con un índice colocado, fuera de rango o no entero devuelve `GranoNoSeleccionable`. No cambia el estado del núcleo.
- `ciclar(ui, direccion)` pasa a la ficha sin colocar siguiente (`+1`) o anterior (`−1`), de forma circular. Sin granos sin colocar no hace nada; nunca falla.
- `colocar(ui, x, y)` aplica `Colocar` con el grano seleccionado y sigue la regla de selección. Sin grano seleccionado devuelve `SinGranoSeleccionado`; los errores del núcleo (`CeldaFueraDeRejilla`, `FaseIncorrecta`…) se devuelven tal cual.
- `deshacer(ui)` aplica `Deshacer` y selecciona el grano que acaba de quedar libre; sin colocaciones devuelve `NadaQueDeshacer` del núcleo.
- `deshacerDesdeFicha(ui, indice)` equivale a `deshacer` si ese grano es el último colocado (el último de `ordenColocacion`); si está colocado pero no es el último, devuelve `NoEsLaUltimaColocacion`; si no está colocado, `GranoNoColocado`.
- `confirmar(ui)` aplica `Confirmar` y devuelve además `estadoAntes`, cuya rejilla es el punto de partida de la cascada. En el estado de interfaz nuevo se selecciona el primer grano de la mano nueva, o ninguno si la ronda terminó. Con la mano incompleta devuelve `ManoIncompleta` del núcleo.
 Las pruebas comprueban que cualquier secuencia de gestos deja el mismo estado que aplicar a mano las acciones del núcleo equivalentes, que ese estado pasa `validarEstado` y que `seleccionado` es siempre `null` (solo con la mano completa) o un grano sin colocar.

`describirError` es exhaustiva sobre los errores del controlador y del núcleo: un `switch` con comprobación `never` y una tabla `Record<MotivoIlegal, string>`, así que un error nuevo no compila hasta tener su mensaje.

**Vista previa.** En el núcleo, `Colocar` es provisional: asigna una celda al grano, pero la rejilla no cambia hasta `Confirmar`. `calcularPrevistas(estado)` toma las colocaciones de la mano y llama a `aplicarAdiciones`, la misma función del núcleo que usa `Confirmar`, así que no duplica ninguna regla de los granos (los vecinos del explosivo, lo que cae fuera…). Devuelve la rejilla proyectada y los granos previstos por celda (proyectada menos actual). Las pruebas la comparan celda a celda con los `AdicionAplicada` de un `Confirmar` real. La vista previa no incluye los derrumbes, que se verán con las animaciones.

`describirCeldas` dibuja en cada celda `carga + previstos` puntos con la disposición tipo dado de ese total: los primeros `carga` son sólidos y el resto son fantasma (solo el contorno). Desde 10 en total vuelve el número de respaldo, con el total. Una celda estable que la vista previa llevaría a `umbral` o más se marca `inestablePrevista` y lleva un doble contorno.

**Candidata.** `calcularPrevistasConCandidata(estado, indice, celda)` añade a las colocaciones ya hechas una colocación hipotética del grano seleccionado en la celda del ratón y llama otra vez a `aplicarAdiciones`, sin pasar por `aplicar` ni tocar el estado. Devuelve la proyección, las previstas totales y, aparte, las que añade solo la candidata. Sin grano seleccionado (o si ya está colocado) o con la celda fuera de la rejilla, devuelve lo mismo que `calcularPrevistas`. Las pruebas la comparan con colocar de verdad ese grano y calcular las previstas. En `describirCeldas`, los últimos fantasmas de cada celda son los de la candidata (`candidata: true`), y `inestablePorCandidata` marca las celdas que solo la candidata vuelve inestables.

**La animación como función pura del tiempo.** La cascada no se anima con estado mutable ni con temporizadores: se describe con datos y se muestrea.

1. **Pasos.** `construirCascada(celdasAntes, eventos, lado, umbral, multiplicadorPorOleada)` recorre los eventos de `Confirmar` en el orden de la especificación y devuelve los pasos con su duración del tema al ritmo 1 (la alerta y el derrumbe, con la aceleración de su oleada):
   - `adicion` (300 ms), si hay `AdicionAplicada`: la rejilla antes y después de sumar los granos colocados, y las celdas afectadas;
   - por cada oleada, `alerta` (160 ms), con las celdas inestables de su `OleadaIniciada`, y `derrumbe` (320 ms), con la rejilla antes y después y cuatro movimientos por celda que cae (`{ desde, hacia, fuera, direccion }`, en el orden arriba, derecha, abajo, izquierda).

   Para reconstruir las rejillas intermedias solo usa la geometría y lo que dicen los eventos: cada celda de la oleada pierde 4 y envía 1 en cada dirección; los granos que caen fuera son los de sus `GranoFuera`, y los que llegan a una vecina interior se suman cuando todas las inestables ya perdieron los suyos. Cada paso de derrumbe guarda además los `GranoFuera` de su oleada (celda de origen, dirección y puntos) y los puntos que se ganan en ella. Si los eventos no cuadran (un `GranoFuera` que no vale `100 + multiplicadorPorOleada × (k − 1)`, unos totales de `OleadaTerminada` o `TiradaResuelta` que no coinciden con sus `GranoFuera`, un `Derrumbe` fuera de su `OleadaIniciada`, una dirección desconocida, un `GranoFuera` que falta o sobra, unos totales de `OleadaTerminada` que no coinciden, una cascada que acaba con celdas inestables…) devuelve el error `CascadaInvalida`, sin lanzar. Las pruebas reconstruyen cada `Confirmar` de partidas aleatorias y comparan las celdas finales con las del núcleo y las intermedias con un oráculo de oleadas escrito aparte.
2. **Cuadros.** `muestrear(cascada, tMs)` es una función pura del instante (acotado a `[0, duración total]`; NaN cuenta como 0). Devuelve la carga que se muestra en cada celda, los puntos flotantes, la etiqueta de la oleada en curso (o `null`), los puntos de la tirada hasta ese instante (`puntosTirada`, que al final valen los `puntosGanados` de `TiradaResuelta`), los granos en vuelo (posición en unidades de celda, si salen del tablero y su opacidad), las alertas (celda e intensidad de 0 a 1) y las apariciones. En la adición la carga sube grano a grano; en la alerta no cambia y la intensidad pulsa; en el derrumbe, las celdas que caen pierden sus 4 granos al empezar, los granos vuelan con la curva de aceleración del tema hasta el centro de la vecina, o hasta algo más allá del borde, desvaneciéndose en el último tramo, y los interiores se suman a su destino al llegar, al final del paso. Un instante en la frontera entre dos pasos pertenece al que empieza. En 0 el cuadro es la rejilla anterior y en la duración total, exactamente la final. Los granos no se crean ni se pierden en vuelo: en un derrumbe, las cargas mostradas más los granos en vuelo suman lo de antes del paso.
3. **Reproductor.** `crearReproductor(cascada)` empieza en 0; `avanzar(rep, dtMs, ritmo = 1)` suma `dtMs × ritmo` (un valor negativo, NaN o infinito cuenta como 0); `saltar(rep)` lo lleva al final; `cuadroActual(rep)` y `terminado(rep)` lo leen. Cada operación devuelve un reproductor nuevo. El render le pasa el `deltaMS` del ticker de PixiJS y el ritmo actual, y dibuja el cuadro actual. Un ritmo inválido (0, negativo, NaN o infinito) no avanza.

**Objetos persistentes.** Durante una cascada solo se redibuja el tablero en cada cuadro; la mano se dibuja una vez al empezar. Los puntos flotantes usan una reserva de objetos de texto: se crean la primera vez que hacen falta, como mucho `4 × 9` (los granos que pueden salir en una oleada con el lado máximo), y se reutilizan cambiando su texto, posición, escala y opacidad. Los textos de la banda superior (semilla, etiqueta y ritmo) también son persistentes.

Mientras se anima, las celdas se dibujan con el color de su carga (aunque tengan 4 o más) y los puntos tipo dado de la carga mostrada; lo inestable se ve con el parpadeo de la alerta. Los granos en vuelo son círculos claros con contorno oscuro y las celdas que reciben granos crecen un poco y vuelven a su tamaño. Si la cascada no se pudiera construir, se muestra el estado nuevo sin animación y un mensaje de error interno.

**Disposición.** La ventana se reparte en tres bandas horizontales: indicadores arriba, tablero en el centro y mano abajo. El tablero es el mayor cuadrado que cabe en la banda central menos un margen. Las celdas son cuadradas e iguales, con un hueco proporcional a su tamaño, y el conjunto queda centrado. Así cabe en cualquier forma de ventana: ancha, estrecha o muy pequeña. Con una ventana de tamaño 0 las celdas miden 0, nunca NaN. Las celdas se indexan `celdas[y][x]`, igual que la rejilla del núcleo.

En la banda inferior, los botones van a la derecha, apilados en el alto de la fila de fichas: Confirmar arriba y Deshacer abajo, con el mismo ancho, limitado por el de la banda y por su alto. La fila de fichas se centra en la banda y deja a la izquierda el mismo espacio libre que ocupan los botones a la derecha, para quedar centrada sin tocarlos. El radio de las fichas es el mayor que cabe con cualquier número de fichas (de 1 a 12) y cualquier ventana; la descripción va debajo. `celdaEn`, `botonConfirmarEn` y `botonDeshacerEn` usan los mismos rectángulos que se dibujan: los huecos entre celdas y lo que queda fuera del tablero no son ninguna celda. `disponerMazo(ventana)` da el texto del mazo en el hueco libre de la izquierda de la fila de fichas, del mismo ancho que los botones, así que no pisa las fichas, los botones ni la línea de información.

La banda superior (`disponerIndicadores(ventana)`) tiene dos filas, con los anchos como fracciones de la banda para que todo quepa sin solaparse con cualquier ventana. Arriba: la ronda, la semilla y el lado (27 %), la etiqueta de cadena (57 %) y el ritmo (16 %). Abajo: la barra del medidor (56 %), su texto «P / M» (22 %) y las fichas de tiradas (22 %, colocadas con `disponerFichasTiradas`).

**Celdas.** Cada celda es un rectángulo redondeado con un color según su carga (0 a 3; una carga mayor pero estable usa el de 3). Una celda con `umbral` granos o más se marca como inestable y usa su propio color. Fuera de una animación no debería verse ninguna, porque el núcleo siempre deja la rejilla estable.

**Granos.** Cada grano es un punto dentro de la celda, con una disposición tipo dado. `describirCeldas` da los centros relativos al centro de la celda y en fracciones de su lado (entre −0,5 y 0,5), más un radio común; `render.ts` solo los escala al tamaño de la celda. Con `d` el desplazamiento del tema (0,25):

| Granos | Puntos |
| --- | --- |
| 0 | Ninguno. |
| 1 | Centro. |
| 2 | Diagonal: `(−d, −d)` y `(d, d)`. |
| 3 | La diagonal y el centro. |
| 4 | Las cuatro esquinas `(±d, ±d)`. |
| 5 | Las cuatro esquinas y el centro. |
| 6 | Dos columnas de tres, en `x = ±d`. |
| 7 | Las dos columnas y el centro. |
| 8 | La cuadrícula de 3×3 sin el centro. |
| 9 | La cuadrícula de 3×3 completa. |
| 10 o más | Sin puntos: la carga va como número de respaldo, centrado y del color de los puntos. |

Todas las disposiciones son simétricas respecto al centro (no cambian al girarlas 180 grados). Con `d = 0,25` y radio 0,085 la cuadrícula de 3×3 cabe sin que los puntos se toquen (separación 0,25 ≥ 2 × 0,085) ni se salgan (0,25 + 0,085 ≤ 0,5), así que de 7 a 9 no hace falta un desplazamiento menor. Las pruebas comprueban estas condiciones para 0 a 9 granos con los valores del tema.

## Cambiar el aspecto

Todo el aspecto vive en `src/tema.ts`, en el objeto `TEMA`:

- **`colores`:** fondo, celdas por carga, celda inestable, puntos de grano, texto, contorno de los fantasmas sobre la celda vacía y color del mensaje de error. La paleta vívida inicial:

  | Uso | Color |
  | --- | --- |
  | Fondo | `#0A0420` |
  | Celda vacía (carga 0) | `#22144D` (la propuesta era `#1A0F3D`, pero su contraste con el fondo, 1,12, no llegaba al mínimo de 1,2) |
  | Carga 1 | `#00E5FF` (cian) |
  | Carga 2 | `#FFE600` (amarillo eléctrico) |
  | Carga 3 | `#FF2E93` (rosa intenso) |
  | Inestable | `#FF3D00` (naranja rojizo) |
  | Puntos de grano y número de respaldo | `#0A0420` |
  | Texto de la banda superior y de la descripción | `#F5F0FF` (en negrita arriba) |
  | Puntos fantasma | Contorno `#0A0420`; sobre la celda vacía, `#F5F0FF` |
  | Contorno de inestable prevista | Trazo `#FF3D00` y filete interior `#0A0420` |
  | Ficha normal, pesada y explosiva | `#F5F0FF`, `#B388FF` y `#FF1744` |
  | Botón Deshacer activo | Fondo `#F5F0FF` y texto `#0A0420` |
  | Botón Confirmar activo (primario) | Fondo `#00E5FF` y texto `#0A0420` |
  | Botones desactivados | Fondo `#22144D` y texto `#6F6596` |
  | Granos en vuelo | Relleno `#F5F0FF` con contorno `#0A0420` |
  | Parpadeo de alerta | `#FF3D00` (el de inestable), con opacidad hasta 0,85 |
  | Mensajes de error | `#F1A08A`, en la línea de información y en la página de error de inicio |
- **`granos`:** el desplazamiento de la disposición tipo dado y el radio de los puntos, en fracciones del lado de la celda, el grosor del contorno de los fantasmas, en fracción de su radio, y el estilo de los fantasmas de la candidata: un contorno más fino (0,2 frente a 0,3) con opacidad 0,65. El contorno de inestable prevista no se atenúa con la candidata, porque es un aviso.
- **`contornoPrevisto`:** los dos colores del contorno de una celda inestable prevista y su grosor.
- **`mano`:** margen de la banda inferior, alto de la fila de fichas, hueco entre fichas, tamaño y forma del botón y tamaño de sus textos.
- **`fichas`:** forma (`circulo` o `estrella`), color, escala y puntos de cada tipo; opacidad de las colocadas, anillo de la seleccionada y forma de la estrella.
- **`boton`** y **`botonPrimario`:** colores de Deshacer y de Confirmar, activos y desactivados. `mano.alfaBloqueada` es la opacidad de fichas y botones durante la cascada y con la ronda terminada.
- **`animacion`:** duraciones base de los pasos (adición 300 ms, alerta 160 ms, derrumbe 320 ms), curva de aceleración del vuelo (`lineal`, `entradaSalidaCuadratica` o `entradaSalidaCubica`), pulsos y opacidad del parpadeo, distancia que recorren los granos que salen (1,1 celdas) y tramo final en que se desvanecen, aumento de las celdas que reciben granos, y radio, relleno y contorno de los granos en vuelo.
- **`animacion.aceleracion`:** `razon` (0,9) y `minimo` (0,4) de la aceleración progresiva.
- **`animacion.popups`:** relleno amarillo `#FFE600` y contorno oscuro `#0A0420` de los puntos flotantes, tamaño del texto relativo a la celda (0,3), distancia al borde (0,3 celdas), ascenso (0,5 celdas), tramo final en que se desvanecen (0,4) y crecimiento por oleada (0,15) con su tope (2).
- **`bandaSuperior`:** tamaño y colores de la etiqueta de cadena (`#F5F0FF`, con el multiplicador en `#FFE600`) y tamaño y color del texto de ritmo (`#B8AEE0`), relativos al alto de su rectángulo.
- **`indicadores`:** margen de la banda superior; el medidor (barra `#22144D`, relleno por tramos `#00E5FF`, `#FFE600` y `#FF2E93`, texto `#F5F0FF` y constante del suavizado, 180 ms); las fichas de tiradas (llenas `#F5F0FF`, vacías con contorno `#6F6596`); el texto del mazo (`#B8AEE0`); y el contorno de celda cargada (`#F5F0FF`, la mitad del hueco entre celdas, opacidad de 0,5 a 1 con un período de 1200 ms).
- **`finDeRonda`:** el velo (`#0A0420` con opacidad 0,92), el color del título (ganada `#FFE600`, perdida `#FF2E93`) y el del texto del resultado (`#F5F0FF`). El botón «Otra ronda» usa `botonPrimario`. Su disposición la da `disponerFinDeRonda(ventana)`: el velo cubre la banda central y, dentro, una columna centrada con el título, las dos líneas y el botón, escalada con el menor de los lados.

Los ritmos permitidos están en `RITMOS`, en `src/ritmo.ts`.
- **`bandas`:** el reparto vertical. `BANDAS_INICIALES` reserva el 12 % para los indicadores, el 63 % para el tablero y el 25 % para la mano.
- **`proporciones`:** margen del tablero, hueco y radio de las celdas, y tamaño de los textos, todo relativo al tamaño de la celda o de la banda.
- **`tipografia`:** la fuente del sistema y el peso del número de respaldo y del texto de la banda superior.

La disposición de los puntos (qué posiciones ocupa cada cantidad de granos) está en `PATRONES_GRANOS`, en `src/vista.ts`, en unidades del desplazamiento.

Los textos de la interfaz están en `src/textos.ts`. La descripción de cada grano no se escribe a mano: `describirGrano` la genera de sus adiciones (la celda, las cuatro vecinas, las cuatro diagonales y cada vecina suelta por su dirección), con un respaldo genérico («+3 granos repartidos en 2 celdas») si no sabe nombrar algún desplazamiento. Así, un tipo nuevo tiene texto sin tocar código.

Los colores son provisionales: el arte definitivo sustituirá el tema sin tocar la lógica. Para que no pueda dejar una paleta ilegible sin que salte un fallo, `test/contraste.test.ts` comprueba con la razón de contraste de WCAG:

- los puntos contra cada celda con color (cargas 1 a 3 e inestable): al menos 4,5;
- esas celdas contra el fondo: al menos 3; la celda vacía contra el fondo: al menos 1,2;
- el texto de la banda superior contra el fondo: al menos 7;
- el doble contorno de una inestable prevista contra el fondo y contra cada celda estable: al menos 3 con uno de sus dos trazos (ningún color único puede contrastar a la vez con el fondo oscuro, el amarillo y el rosa);
- los puntos fantasma contra la celda en la que se dibujan, de carga 0 a 5: al menos 3 (nunca se dibujan sobre el fondo);
- cada ficha contra el fondo: al menos 3; el botón Deshacer activo contra el fondo, al menos 3, y su texto, al menos 4,5;
- los fantasmas de la candidata, mezclados con su opacidad sobre la celda en la que se dibujan, de carga 0 a 5: al menos 3;
- el mensaje de error contra el fondo: al menos 4,5;
- los granos en vuelo contra el fondo y contra cada color de celda: en el peor caso, el relleno o el contorno llega a 3;
- el botón Confirmar activo contra el fondo y su texto: al menos 4,5;
- el relleno de los puntos flotantes contra el fondo: al menos 4,5; con su contorno, contra cada color de celda: en el peor caso, 3;
- la etiqueta de cadena (y su multiplicador resaltado) contra el fondo: al menos 7; el texto de ritmo: al menos 4,5;
- cada relleno del medidor contra la barra: al menos 3; la barra contra el fondo: al menos 1,2; los textos del medidor y del mazo contra el fondo: al menos 4,5; las fichas de tiradas contra el fondo: al menos 3;
- el contorno de celda cargada contra la celda de carga 3 y contra el fondo: al menos 3; y, en el punto más tenue del pulso, mezclado sobre el fondo donde se dibuja, también 3;
- en el fin de ronda, contra el velo mezclado sobre el fondo y sobre cada color de celda (peor caso): los títulos de ganada y perdida y el texto del resultado, al menos 4,5; el botón «Otra ronda», al menos 3, y su texto sobre el botón, al menos 4,5.

## Reglas de importación

- `game` solo importa `@pila/core` por su interfaz pública, igual que `sim`. Una regla de ESLint prohíbe `@pila/core/...` y las rutas relativas a `core`.
- `game` no puede importar `@pila/sim`, ni por nombre ni por ruta relativa: los bots y las herramientas de balance no forman parte del juego. También lo prohíbe ESLint.
- Solo `src/render.ts` importa `pixi.js`. Los módulos puros no importan PixiJS ni usan el DOM, para que sus pruebas corran en Node.
