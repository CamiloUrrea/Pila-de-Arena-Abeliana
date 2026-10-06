# Pila de arena abeliana

Roguelike por turnos basado en la pila de arena abeliana. Monorepo con tres paquetes:

- `@pila/core`: núcleo puro del juego (sin DOM, sin Node, sin dependencias).
- `@pila/sim`: simulador y bots.
- `@pila/game`: cliente web del juego (PixiJS y Vite).

## Requisitos

- Node 24.21.0 (ver `.nvmrc`).
- pnpm 12.9.1 (fijado en `packageManager`; con `corepack enable` o `npm i -g pnpm@12.9.1`).

## Uso

```sh
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` ejecuta, en orden y deteniéndose en el primer fallo:

- `pnpm typecheck`: TypeScript estricto en los tres paquetes.
- `pnpm lint`: ESLint, incluidas las reglas de pureza de `core`.
- `pnpm test`: Vitest en los tres paquetes.
- `pnpm build`: compilación del cliente web con Vite.

No hay paso de compilación: Vitest y Node 24 ejecutan el TypeScript directamente.

Para jugar una ronda de ejemplo con un bot determinista y comprobar que es reproducible:

```sh
pnpm --filter @pila/sim ejemplo -- 42
```

Para ver el tablero en el navegador: `pnpm --filter @pila/game dev` (detalles en `docs/cliente.md`).

Más contexto en `docs/api-nucleo.md` (interfaz pública del núcleo), `docs/especificacion-nucleo.md`, `docs/azar.md` y `docs/versiones.md`.
