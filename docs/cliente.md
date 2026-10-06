# Cliente web (`@pila/game`)

El cliente dibuja con PixiJS una ronda real creada con `@pila/core`: arriba, la semilla y el lado; en el centro, la rejilla con los granos de cada celda dibujados como puntos; abajo, la mano. El jugador elige qué grano de la mano coloca (T3.2b), lo coloca sobre una celda, puede deshacer y ve una vista previa de lo que sumarán los granos, también al pasar el ratón por una celda. Todavía no hay botón Confirmar, animaciones (T3.3), indicadores ni sonido.

## Arrancarlo

```sh
pnpm --filter @pila/game dev       # servidor de desarrollo de Vite (por defecto en http://localhost:5173/)
pnpm --filter @pila/game build     # compilación a packages/game/dist/
pnpm --filter @pila/game preview   # sirve la compilación
```

`pnpm check`, en la raíz, incluye la compilación del cliente después de los tipos, el linter y las pruebas.

## Parámetros de la URL

| Parámetro | Valores | Por defecto |
| --- | --- | --- |
| `semilla` | Entero de 0 a 4294967295, escrito solo con dígitos. | Una semilla aleatoria de 32 bits (`crypto.getRandomValues`). |
| `lado` | Entero de 1 a 9, escrito solo con dígitos. | 3, el de `CONFIG_INICIAL`. |

Por ejemplo, `http://localhost:5173/?semilla=2026&lado=4`. Un parámetro presente pero inválido (vacío, negativo, decimal, fuera de rango o no numérico) no arranca el juego: la página muestra un mensaje en español con cada error. Los parámetros desconocidos se ignoran. La ronda se crea con `crearRonda({ ...CONFIG_INICIAL, lado }, semilla)`; si el núcleo rechaza la configuración, también se muestra el error.

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
| Pasar el ratón por una celda | Vista previa de la colocación candidata (ver más abajo). |

Las teclas no hacen nada con Ctrl, Alt o Cmd pulsados, para no interferir con los atajos del sistema y del navegador; Mayúsculas sí se admite, para que `Z` funcione.

**Regla de selección.** Al empezar se selecciona el primer grano de la mano. Tras colocar el grano `i` se selecciona el siguiente sin colocar con índice mayor que `i`; si no hay ninguno, el de menor índice sin colocar; y ninguno si la mano está completa. Tras deshacer se selecciona el grano deshecho. Así, colocar en orden recorre la mano de izquierda a derecha, y elegir una ficha a mano no hace volver al principio.

**Mensajes.** Una acción imposible (elegir una ficha colocada, deshacer sin nada colocado, tocar una celda con la mano completa, tocar una ficha colocada que no es la última…) no cambia nada, y la línea de información muestra en rojo claro por qué hasta la siguiente acción. Los mensajes los da `describirError`.

El cursor es una mano sobre las celdas cuando hay un grano seleccionado, sobre las fichas sin colocar y la última colocada, y sobre el botón cuando está activo.

**Vista previa al pasar el ratón.** Con un grano seleccionado, al pasar el ratón por una celda se dibuja lo que sumaría colocarlo ahí: sus puntos fantasma, más finos y tenues que los de los granos ya colocados, y el doble contorno si esa colocación volvería inestable alguna celda. Al salir del tablero o del lienzo, la vista previa desaparece. Con un dedo o un lápiz no hay «pasar por encima», así que en pantallas táctiles solo se ve la vista previa de los granos ya colocados.

**Banda inferior.** Las fichas de la mano van en una fila centrada, en el orden de la mano: el normal es un círculo casi blanco, el pesado un círculo mayor violeta con dos puntos y el explosivo una estrella roja. Una ficha ya colocada se atenúa y la seleccionada lleva un anillo. Debajo, la línea de información describe el grano seleccionado («Explosivo: +1 en la celda y +1 en cada vecina»), dice «Mano completa» o muestra el mensaje de la última acción imposible. El botón «Deshacer» está a la derecha y se ve apagado cuando no hay nada que deshacer.

## Arquitectura

La lógica de presentación son funciones puras, sin PixiJS ni DOM, que se prueban en Node con Vitest y fast-check. PixiJS solo dibuja lo que esas funciones describen.

| Módulo | Qué hace | ¿Puro? |
| --- | --- | --- |
| `src/parametros.ts` | `leerParametros(busqueda, generarSemilla)`: parsea la URL y devuelve los parámetros o una lista de errores tipados con su mensaje. La semilla por defecto la da la función inyectada. | Sí |
| `src/tema.ts` | Datos del aspecto: colores, bandas, proporciones, tipografía, fichas, vista previa y botón. | Sí (solo datos) |
| `src/textos.ts` | `TEXTOS`, los textos de la interfaz; `describirGrano(tipo)`, la descripción de un grano generada de `DEFINICIONES_GRANOS`; y `describirError(error)`, el mensaje de cada error del controlador y del núcleo. | Sí |
| `src/entrada.ts` | `accionDeTecla({ tecla, ctrl, alt, meta })`: qué gesto dispara una tecla, o `null`. | Sí |
| `src/controlador.ts` | `iniciarControlador`, `seleccionar`, `ciclar`, `colocar`, `deshacer` y `deshacerDesdeFicha` sobre un estado de interfaz `{ estado, seleccionado }`. | Sí |
| `src/previsualizacion.ts` | `calcularPrevistas(estado)`: la rejilla proyectada y los granos previstos por celda. `calcularPrevistasConCandidata(estado, indice, celda)`: lo mismo con una colocación hipotética más, y aparte lo que añade solo ella. | Sí |
| `src/disposicion.ts` | `disponer(ancho, alto, lado)`: la geometría de las bandas y de cada celda. `disponerMano(ventana, n)`: las fichas, la descripción y el botón. `celdaEn`, `fichaEn` y `botonDeshacerEn`: qué hay bajo un punto. | Sí |
| `src/vista.ts` | `describirCeldas(celdas, umbral, previstas?, candidatas?)`: posición lógica, carga, puntos sólidos, fantasma y de la candidata, número de respaldo, colores e inestabilidad actual, prevista y prevista solo por la candidata de cada celda. Recibe matrices, no el estado, para reutilizarla en las animaciones. | Sí |
| `src/render.ts` | `crearEscena(contenedor, semilla)`: crea la aplicación de PixiJS ajustada a la ventana y a la densidad de píxeles, expone `mostrarEstado(estado)`, atiende el puntero y el teclado, y redibuja tras cada acción y al redimensionar. Es el único módulo que importa PixiJS. | No |
| `src/main.ts` | Punto de entrada: lee los parámetros, crea la ronda y la muestra, o muestra el error. | No |

**Controlador puro y dibujo.** `controlador.ts` decide qué acción del núcleo dispara cada gesto y qué grano queda seleccionado; `entrada.ts` traduce las teclas a gestos; `render.ts` solo pasa el puntero y el teclado a esas funciones, muestra el mensaje de los errores y vuelve a dibujar. El controlador usa solo la interfaz pública de `core`, nunca lanza ni muta, y todas sus funciones salvo `iniciarControlador` devuelven un `Resultado` con el nuevo estado de interfaz y los eventos del núcleo:

- `iniciarControlador(estado)` devuelve directamente `{ estado, seleccionado }` con el primer grano sin colocar (o `null`), porque no puede fallar.
- `seleccionar(ui, indice)` selecciona un grano de la mano sin colocar; con un índice colocado, fuera de rango o no entero devuelve `GranoNoSeleccionable`. No cambia el estado del núcleo.
- `ciclar(ui, direccion)` pasa a la ficha sin colocar siguiente (`+1`) o anterior (`−1`), de forma circular. Sin granos sin colocar no hace nada; nunca falla.
- `colocar(ui, x, y)` aplica `Colocar` con el grano seleccionado y sigue la regla de selección. Sin grano seleccionado devuelve `SinGranoSeleccionado`; los errores del núcleo (`CeldaFueraDeRejilla`, `FaseIncorrecta`…) se devuelven tal cual.
- `deshacer(ui)` aplica `Deshacer` y selecciona el grano que acaba de quedar libre; sin colocaciones devuelve `NadaQueDeshacer` del núcleo.
- `deshacerDesdeFicha(ui, indice)` equivale a `deshacer` si ese grano es el último colocado (el último de `ordenColocacion`); si está colocado pero no es el último, devuelve `NoEsLaUltimaColocacion`; si no está colocado, `GranoNoColocado`.

El controlador todavía no conoce `Confirmar`. Las pruebas comprueban que cualquier secuencia de gestos deja el mismo estado que aplicar a mano las acciones del núcleo equivalentes, que ese estado pasa `validarEstado` y que `seleccionado` es siempre `null` (solo con la mano completa) o un grano sin colocar.

`describirError` es exhaustiva sobre los errores del controlador y del núcleo: un `switch` con comprobación `never` y una tabla `Record<MotivoIlegal, string>`, así que un error nuevo no compila hasta tener su mensaje.

**Vista previa.** En el núcleo, `Colocar` es provisional: asigna una celda al grano, pero la rejilla no cambia hasta `Confirmar`. `calcularPrevistas(estado)` toma las colocaciones de la mano y llama a `aplicarAdiciones`, la misma función del núcleo que usa `Confirmar`, así que no duplica ninguna regla de los granos (los vecinos del explosivo, lo que cae fuera…). Devuelve la rejilla proyectada y los granos previstos por celda (proyectada menos actual). Las pruebas la comparan celda a celda con los `AdicionAplicada` de un `Confirmar` real. La vista previa no incluye los derrumbes, que se verán con las animaciones.

`describirCeldas` dibuja en cada celda `carga + previstos` puntos con la disposición tipo dado de ese total: los primeros `carga` son sólidos y el resto son fantasma (solo el contorno). Desde 10 en total vuelve el número de respaldo, con el total. Una celda estable que la vista previa llevaría a `umbral` o más se marca `inestablePrevista` y lleva un doble contorno.

**Candidata.** `calcularPrevistasConCandidata(estado, indice, celda)` añade a las colocaciones ya hechas una colocación hipotética del grano seleccionado en la celda del ratón y llama otra vez a `aplicarAdiciones`, sin pasar por `aplicar` ni tocar el estado. Devuelve la proyección, las previstas totales y, aparte, las que añade solo la candidata. Sin grano seleccionado (o si ya está colocado) o con la celda fuera de la rejilla, devuelve lo mismo que `calcularPrevistas`. Las pruebas la comparan con colocar de verdad ese grano y calcular las previstas. En `describirCeldas`, los últimos fantasmas de cada celda son los de la candidata (`candidata: true`), y `inestablePorCandidata` marca las celdas que solo la candidata vuelve inestables.

**Disposición.** La ventana se reparte en tres bandas horizontales: indicadores arriba, tablero en el centro y mano abajo. El tablero es el mayor cuadrado que cabe en la banda central menos un margen. Las celdas son cuadradas e iguales, con un hueco proporcional a su tamaño, y el conjunto queda centrado. Así cabe en cualquier forma de ventana: ancha, estrecha o muy pequeña. Con una ventana de tamaño 0 las celdas miden 0, nunca NaN. Las celdas se indexan `celdas[y][x]`, igual que la rejilla del núcleo.

En la banda inferior, el botón Deshacer va a la derecha, con un ancho limitado por el de la banda y por su alto. La fila de fichas se centra en la banda y deja a la izquierda el mismo espacio libre que ocupa el botón a la derecha, para quedar centrada sin tocarlo. El radio de las fichas es el mayor que cabe con cualquier número de fichas (de 1 a 12) y cualquier ventana; la descripción va debajo. `celdaEn` y `botonDeshacerEn` usan los mismos rectángulos que se dibujan: los huecos entre celdas y lo que queda fuera del tablero no son ninguna celda.

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
  | Botón activo | Fondo `#F5F0FF` y texto `#0A0420` |
  | Botón desactivado | Fondo `#22144D` y texto `#6F6596` |
  | Mensajes de error | `#F1A08A`, en la línea de información y en la página de error de inicio |
- **`granos`:** el desplazamiento de la disposición tipo dado y el radio de los puntos, en fracciones del lado de la celda, el grosor del contorno de los fantasmas, en fracción de su radio, y el estilo de los fantasmas de la candidata: un contorno más fino (0,2 frente a 0,3) con opacidad 0,65. El contorno de inestable prevista no se atenúa con la candidata, porque es un aviso.
- **`contornoPrevisto`:** los dos colores del contorno de una celda inestable prevista y su grosor.
- **`mano`:** margen de la banda inferior, alto de la fila de fichas, hueco entre fichas, tamaño y forma del botón y tamaño de sus textos.
- **`fichas`:** forma (`circulo` o `estrella`), color, escala y puntos de cada tipo; opacidad de las colocadas, anillo de la seleccionada y forma de la estrella.
- **`boton`:** colores de Deshacer activo y desactivado.
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
- cada ficha contra el fondo: al menos 3; el botón activo contra el fondo, al menos 3, y su texto, al menos 4,5;
- los fantasmas de la candidata, mezclados con su opacidad sobre la celda en la que se dibujan, de carga 0 a 5: al menos 3;
- el mensaje de error contra el fondo: al menos 4,5.

## Reglas de importación

- `game` solo importa `@pila/core` por su interfaz pública, igual que `sim`. Una regla de ESLint prohíbe `@pila/core/...` y las rutas relativas a `core`.
- `game` no puede importar `@pila/sim`, ni por nombre ni por ruta relativa: los bots y las herramientas de balance no forman parte del juego. También lo prohíbe ESLint.
- Solo `src/render.ts` importa `pixi.js`. Los módulos puros no importan PixiJS ni usan el DOM, para que sus pruebas corran en Node.
