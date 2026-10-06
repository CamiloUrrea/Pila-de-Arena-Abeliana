# Cliente web (`@pila/game`)

El cliente dibuja con PixiJS una ronda real creada con `@pila/core`. Por ahora (T3.1 y T3.1b) solo muestra el tablero: la rejilla con los granos de cada celda dibujados como puntos y, arriba, la semilla y el lado. Todavía no hay interacción, mano, animaciones, indicadores ni sonido.

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

## Arquitectura

La lógica de presentación son funciones puras, sin PixiJS ni DOM, que se prueban en Node con Vitest y fast-check. PixiJS solo dibuja lo que esas funciones describen.

| Módulo | Qué hace | ¿Puro? |
| --- | --- | --- |
| `src/parametros.ts` | `leerParametros(busqueda, generarSemilla)`: parsea la URL y devuelve los parámetros o una lista de errores tipados con su mensaje. La semilla por defecto la da la función inyectada. | Sí |
| `src/tema.ts` | Datos del aspecto: colores, bandas, proporciones y tipografía. | Sí (solo datos) |
| `src/disposicion.ts` | `disponer(ancho, alto, lado)`: la geometría de las bandas y de cada celda. | Sí |
| `src/vista.ts` | `describirCeldas(celdas, umbral)`: posición lógica, carga, puntos de grano, número de respaldo, color e inestabilidad de cada celda. Recibe la matriz de celdas, no el estado, para reutilizarla en las animaciones. | Sí |
| `src/render.ts` | `crearEscena(contenedor, semilla)`: crea la aplicación de PixiJS ajustada a la ventana y a la densidad de píxeles, y expone `mostrarEstado(estado)`. Redibuja al redimensionar. Es el único módulo que importa PixiJS. | No |
| `src/main.ts` | Punto de entrada: lee los parámetros, crea la ronda y la muestra, o muestra el error. | No |

**Disposición.** La ventana se reparte en tres bandas horizontales: indicadores arriba, tablero en el centro y mano abajo. El tablero es el mayor cuadrado que cabe en la banda central menos un margen. Las celdas son cuadradas e iguales, con un hueco proporcional a su tamaño, y el conjunto queda centrado. Así cabe en cualquier forma de ventana: ancha, estrecha o muy pequeña. Con una ventana de tamaño 0 las celdas miden 0, nunca NaN. Las celdas se indexan `celdas[y][x]`, igual que la rejilla del núcleo.

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

- **`colores`:** fondo, celdas por carga, celda inestable, puntos de grano, texto de la banda superior y color del mensaje de error. La paleta vívida inicial:

  | Uso | Color |
  | --- | --- |
  | Fondo | `#0A0420` |
  | Celda vacía (carga 0) | `#22144D` (la propuesta era `#1A0F3D`, pero su contraste con el fondo, 1,12, no llegaba al mínimo de 1,2) |
  | Carga 1 | `#00E5FF` (cian) |
  | Carga 2 | `#FFE600` (amarillo eléctrico) |
  | Carga 3 | `#FF2E93` (rosa intenso) |
  | Inestable | `#FF3D00` (naranja rojizo) |
  | Puntos de grano y número de respaldo | `#0A0420` |
  | Texto de la banda superior | `#F5F0FF`, en negrita |
- **`granos`:** el desplazamiento de la disposición tipo dado y el radio de los puntos, en fracciones del lado de la celda.
- **`bandas`:** el reparto vertical. `BANDAS_INICIALES` reserva el 12 % para los indicadores, el 63 % para el tablero y el 25 % para la mano.
- **`proporciones`:** margen del tablero, hueco y radio de las celdas, y tamaño de los textos, todo relativo al tamaño de la celda o de la banda.
- **`tipografia`:** la fuente del sistema y el peso del número de respaldo y del texto de la banda superior.

La disposición de los puntos (qué posiciones ocupa cada cantidad de granos) está en `PATRONES_GRANOS`, en `src/vista.ts`, en unidades del desplazamiento.

Los colores son provisionales: el arte definitivo sustituirá el tema sin tocar la lógica. Para que no pueda dejar una paleta ilegible sin que salte un fallo, `test/contraste.test.ts` comprueba con la razón de contraste de WCAG que los puntos contra cada celda con color (cargas 1 a 3 e inestable) llegan a 4,5, que esas celdas contra el fondo llegan a 3, que la celda vacía contra el fondo llega a 1,2 y que el texto de la banda superior contra el fondo llega a 7.

## Reglas de importación

- `game` solo importa `@pila/core` por su interfaz pública, igual que `sim`. Una regla de ESLint prohíbe `@pila/core/...` y las rutas relativas a `core`.
- `game` no puede importar `@pila/sim`, ni por nombre ni por ruta relativa: los bots y las herramientas de balance no forman parte del juego. También lo prohíbe ESLint.
- Solo `src/render.ts` importa `pixi.js`. Los módulos puros no importan PixiJS ni usan el DOM, para que sus pruebas corran en Node.
