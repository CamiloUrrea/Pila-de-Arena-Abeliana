# Reglas del repositorio
- Responde en español.
- `core` es TypeScript puro: sin DOM, sin Node y sin dependencias. Prohibidos `Math.random` y `Date`.
- Todo el azar sale de flujos con nombre derivados de una semilla.
- Aritmética entera; los multiplicadores se guardan en centésimas.
- El núcleo es una función pura (estado, acción) → (estado, eventos). Una partida es la semilla más la lista de acciones.
- Granos y bonus son datos con ganchos declarados, no ramas de código.
- Una tarea termina cuando `pnpm check` pasa (tipos, linter y pruebas), sin excepciones.
- Todo cambio de reglas o de bonus se acompaña de su corrida del simulador.
- Cambios pequeños: un prompt, un cambio revisable.
- No añadas mecánicas fuera del alcance del MVP ni dependencias nuevas sin avisar.
- La especificación del núcleo está en `docs/especificacion-nucleo.md`; si algo la contradice, avisa y pregunta antes de cambiarla.
- Prohibida cualquier interacción con GitHub (push, pull, fetch, clone, remotos, `gh`, API, PR, issues, releases, Actions). Solo commits locales; el usuario se encarga del resto.

# Contexto de diseño
- La partida del MVP tiene un número fijo de rondas (valor provisional: 8; se fija en H6). El modo infinito, con escalada sin fin, queda fuera del MVP, pero la escalada (metas, recompensas) no debe suponer un final: el modo infinito debe ser después solo un cambio de configuración.
- En `game`, la lógica de presentación va en funciones puras y probables en Node; PixiJS solo dibuja. El aspecto vive en `src/tema.ts`.
