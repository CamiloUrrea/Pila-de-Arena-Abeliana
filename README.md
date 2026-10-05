# Pila de arena abeliana

Roguelike por turnos basado en la pila de arena abeliana. Monorepo con tres paquetes:

- `@pila/core`: núcleo puro del juego (sin DOM, sin Node, sin dependencias).
- `@pila/sim`: simulador y bots.
- `@pila/game`: interfaz del juego.

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

No hay paso de compilación: Vitest y Node 24 ejecutan el TypeScript directamente.

Más contexto en `docs/especificacion-nucleo.md` y `docs/versiones.md`.
