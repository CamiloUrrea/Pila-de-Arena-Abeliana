# Versiones fijadas

Verificadas el 2026-10-05 contra fuentes oficiales. Todas las versiones son exactas (sin `^` ni `~`).

| Herramienta | Versión | Fuente | Fecha de publicación |
| --- | --- | --- | --- |
| Node.js (LTS activa, «Krypton») | 24.21.0 | <https://nodejs.org/dist/index.json> y <https://github.com/nodejs/Release/blob/main/schedule.json> (v24: LTS activa hasta 2026-10-20) | 2026-09-07 |
| pnpm | 12.9.1 | Registro npm (`npm view pnpm`, dist-tag `latest`) | 2026-10-03 |
| TypeScript | 6.0.3 | Registro npm (`npm view typescript`) | 2026-04-16 |
| Vitest | 5.0.3 | Registro npm (`npm view vitest`, dist-tag `latest`) | 2026-09-30 |
| fast-check | 4.10.2 | Registro npm (`npm view fast-check`) | 2026-09-19 |
| ESLint | 10.12.0 | Registro npm (`npm view eslint`, dist-tag `latest`) | 2026-10-02 |
| typescript-eslint | 8.71.0 | Registro npm (`npm view typescript-eslint`); la `latest` es 8.71.1 | 2026-09-28 |
| @types/node (solo `devDependency` de `@pila/sim`) | 24.19.1 | Registro npm (`npm view @types/node time`): la última de la rama 24; la `latest` es 26.6.4 | 2026-10-01 |
| pixi.js (solo `dependency` de `@pila/game`) | 8.22.0 | Registro npm (`npm view pixi.js`, dist-tag `latest`; última estable de la rama 8) | 2026-10-01 |
| Vite (solo `devDependency` de `@pila/game`) | 8.3.2 | Registro npm (`npm view vite`, dist-tag `latest`) | 2026-10-01 |
| tsx | no se usa | Node 24 ejecuta TypeScript de forma nativa (eliminación de tipos) | — |
| actions/checkout | v7.0.1 (`3d3c42e5aac5ba805825da76410c181273ba90b1`) | <https://github.com/actions/checkout/releases/tag/v7.0.1> | 2026-07-20 |
| actions/setup-node | v7.0.0 (`820762786026740c76f36085b0efc47a31fe5020`) | <https://github.com/actions/setup-node/releases/tag/v7.0.0> | 2026-07-14 |
| pnpm/action-setup | v6.1.0 (`ea17c68df8912ef543352723c149a84f56e3d413`) | <https://github.com/pnpm/action-setup/releases/tag/v6.1.0> | 2026-09-05 |

## Compatibilidad

- **TypeScript 6.0.3 en lugar de 7.0.2.** La última versión publicada es 7.0.2, pero `typescript-eslint@8.71.x` declara `peerDependencies.typescript: ">=4.8.4 <6.1.0"`. Se usa la última 6.0.x, que es compatible.
- **Node 24.** Vitest 5.0.3 exige `^22.12.0 || ^24.0.0 || >=26.0.0` y ESLint 10.12.0 exige `^20.19.0 || ^22.13.0 || >=24`; Node 24.21.0 cumple ambos. Node 26 pasa a LTS el 2026-10-28; hoy aún no lo es.
- Las actions se fijan por SHA del commit de la etiqueta; las tres usan el runtime `node24`.
- **typescript-eslint 8.71.0 en lugar de 8.71.1.** La 8.71.1 se publicó el 2026-10-05 a las 17:08 UTC y pnpm 12 aplica por defecto `minimumReleaseAge` (1 día): el lockfile con 8.71.1 falla la verificación de cadena de suministro y `pnpm install --frozen-lockfile` no pasa. Se usa la 8.71.0 en lugar de añadir excepciones a la política. Se puede subir a 8.71.1 a partir del 2026-10-06.
- **@types/node 24.19.1, solo en `sim`.** Da tipos a `console`, `process` y `node:util` en el script de ejemplo de `@pila/sim`. Se fija la rama 24 para que coincida con Node 24.21.0, y no la `latest` (26.x). Se publicó hace más de un día, así que cumple `minimumReleaseAge`; su dependencia `undici-types` resuelve a 7.24.6 (2026-03-25). `core` y `game` no la reciben: `core` sigue sin tipos de Node.
- **pixi.js 8.22.0 y Vite 8.3.2, solo en `game`.** Verificadas el 2026-10-05 en el registro de npm: son las `latest` y se publicaron hace más de un día, así que cumplen `minimumReleaseAge` (el lockfile pasa la verificación de cadena de suministro). Vite 8.3.2 exige Node `^20.19.0 || >=22.12.0` y Node 24.21.0 la cumple; sus `peerDependencies` (por ejemplo `@types/node`, `esbuild`, `tsx`) son opcionales y no se instalan. Vitest 5.0.3 ya usaba Vite 8.3.2 (admite `^6.4.0 || ^7.0.0 || ^8.0.0`), así que el lockfile no duplica Vite. pixi.js 8.22.0 no declara `engines` ni `peerDependencies` y sus tipos compilan con TypeScript 6.0.3 en modo estricto (`skipLibCheck` sigue activo como en el resto del repositorio). `core` y `sim` no reciben ninguna de las dos.
