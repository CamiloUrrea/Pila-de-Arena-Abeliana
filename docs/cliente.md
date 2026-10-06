# Cliente web (`@pila/game`)

El cliente dibuja con PixiJS una ronda real creada con `@pila/core`. Por ahora (T3.1) solo muestra el tablero: la rejilla con la carga de cada celda y, arriba, la semilla y el lado. Todavía no hay interacción, mano, animaciones, indicadores ni sonido.

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
| `src/vista.ts` | `describirCeldas(celdas, umbral)`: posición lógica, carga, texto, color e inestabilidad de cada celda. Recibe la matriz de celdas, no el estado, para reutilizarla en las animaciones. | Sí |
| `src/render.ts` | `crearEscena(contenedor, semilla)`: crea la aplicación de PixiJS ajustada a la ventana y a la densidad de píxeles, y expone `mostrarEstado(estado)`. Redibuja al redimensionar. Es el único módulo que importa PixiJS. | No |
| `src/main.ts` | Punto de entrada: lee los parámetros, crea la ronda y la muestra, o muestra el error. | No |

**Disposición.** La ventana se reparte en tres bandas horizontales: indicadores arriba, tablero en el centro y mano abajo. El tablero es el mayor cuadrado que cabe en la banda central menos un margen. Las celdas son cuadradas e iguales, con un hueco proporcional a su tamaño, y el conjunto queda centrado. Así cabe en cualquier forma de ventana: ancha, estrecha o muy pequeña. Con una ventana de tamaño 0 las celdas miden 0, nunca NaN. Las celdas se indexan `celdas[y][x]`, igual que la rejilla del núcleo.

**Celdas.** Cada celda es un rectángulo redondeado con un color según su carga (0 a 3) y la carga como número centrado. Una celda con `umbral` granos o más se marca como inestable y usa su propio color. Fuera de una animación no debería verse ninguna, porque el núcleo siempre deja la rejilla estable.

## Cambiar el aspecto

Todo el aspecto vive en `src/tema.ts`, en el objeto `TEMA`:

- **`colores`:** fondo, celdas por carga, celda inestable, texto, texto secundario y color del mensaje de error.
- **`bandas`:** el reparto vertical. `BANDAS_INICIALES` reserva el 12 % para los indicadores, el 63 % para el tablero y el 25 % para la mano.
- **`proporciones`:** margen del tablero, hueco y radio de las celdas, y tamaño de los textos, todo relativo al tamaño de la celda o de la banda.
- **`tipografia`:** la fuente del sistema.

Los colores de las celdas son provisionales: el arte definitivo sustituirá el tema sin tocar la lógica.

## Reglas de importación

- `game` solo importa `@pila/core` por su interfaz pública, igual que `sim`. Una regla de ESLint prohíbe `@pila/core/...` y las rutas relativas a `core`.
- `game` no puede importar `@pila/sim`, ni por nombre ni por ruta relativa: los bots y las herramientas de balance no forman parte del juego. También lo prohíbe ESLint.
- Solo `src/render.ts` importa `pixi.js`. Los módulos puros no importan PixiJS ni usan el DOM, para que sus pruebas corran en Node.
