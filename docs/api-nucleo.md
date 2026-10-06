# Interfaz pública del núcleo (`@pila/core`)

Este documento describe cómo se usa `@pila/core` desde fuera del paquete (el simulador, el juego o una herramienta). El detalle de las reglas está en [`especificacion-nucleo.md`](especificacion-nucleo.md); el del azar, en [`azar.md`](azar.md).

Todo se importa de `@pila/core`. Sus módulos internos no forman parte de la interfaz: el campo `exports` del paquete los oculta y una regla de ESLint prohíbe importarlos desde `sim` y `game`, también por ruta relativa.

## Visión de uso

1. **Crear la ronda** con `crearRonda(config, semilla)`. Devuelve el estado inicial y un evento `ManoRobada`.
2. **Listar las acciones legales** con `accionesLegales(estado)`: las `Colocar` de cada grano sin colocar en cada celda, y `Deshacer` y `Confirmar` cuando proceden.
3. **Aplicar una acción** con `aplicar(estado, accion)`. Devuelve el estado siguiente y sus eventos, o un error tipado que deja el estado intacto.
4. **Leer los eventos** para animar, sonar o registrar. Los eventos describen lo que pasó; no deciden nada del juego.
5. **Serializar y deserializar** el estado con `serializar` y `deserializar` para guardar y cargar la partida, azar incluido.
6. **Reproducir una partida** con `reproducir(config, semilla, acciones)`: una partida queda definida por su configuración, su semilla y su lista de acciones.

## Ejemplo completo

```ts
import { CONFIG_INICIAL, accionesLegales, aplicar, crearRonda, deserializar, reproducir, serializar } from '@pila/core';
import type { Accion, Evento } from '@pila/core';

// 1. Crear la ronda: la configuración y la semilla definen toda la partida.
const ronda = crearRonda(CONFIG_INICIAL, 2026);
if (!ronda.ok) throw new Error(`configuración inválida: ${ronda.error.campo}: ${ronda.error.motivo}`);
let estado = ronda.valor.estado;
const eventos: Evento[] = [...ronda.valor.eventos];
const acciones: Accion[] = [];

// 2. Jugar: un bot mínimo confirma si puede y, si no, coloca el primer grano libre en la primera celda.
while (estado.fase === 'colocando') {
  const legales = accionesLegales(estado);
  const accion = legales.find((a) => a.tipo === 'Confirmar') ?? legales[0];
  if (accion === undefined) break;
  const paso = aplicar(estado, accion);
  if (!paso.ok) throw new Error(`acción rechazada: ${JSON.stringify(paso.error)}`);
  estado = paso.valor.estado;
  eventos.push(...paso.valor.eventos);
  acciones.push(accion);
}

// 3. Leer los eventos: por ejemplo, los puntos de cada tirada.
for (const e of eventos) {
  if (e.tipo === 'TiradaResuelta') console.log(`+${e.puntosGanados} → ${e.puntosTotales} centésimas`);
}
console.log(`fase final: ${estado.fase}`);

// 4. Guardar y cargar: serializar y deserializar son inversas exactas.
const texto = serializar(estado);
const cargado = deserializar(texto);
console.log(`ida y vuelta: ${cargado.ok && serializar(cargado.valor) === texto}`);

// 5. Reproducir: la misma configuración, semilla y acciones dan el mismo estado final.
const repeticion = reproducir(CONFIG_INICIAL, 2026, acciones);
console.log(`reproducible: ${repeticion.ok && serializar(repeticion.valor.estado) === texto}`);
```

## Funciones

| Función | Firma | Semántica |
| --- | --- | --- |
| `crearRonda` | `(config: Config, semilla: number) => Resultado<{ estado: Estado; eventos: readonly Evento[] }, ErrorConfig>` | Valida la configuración, siembra la rejilla (flujo `siembra`), baraja el mazo y roba la primera mano (flujo `mazo`). Emite un único `ManoRobada`. |
| `aplicar` | `(estado: Estado, accion: Accion) => Resultado<{ estado: Estado; eventos: readonly Evento[] }, ErrorAccion>` | Aplica `Colocar`, `Deshacer` o `Confirmar`. `Confirmar` resuelve la tirada y evalúa su fin: victoria, derrota o mano nueva. |
| `accionesLegales` | `(estado: Estado) => readonly Accion[]` | Acciones que `aplicar` acepta, en orden fijo: `Colocar` por índice de mano y celdas por filas, luego `Deshacer` y luego `Confirmar`. Vacía fuera de la fase `colocando`. |
| `aplicarAdiciones` | `(celdas: readonly (readonly number[])[], colocaciones: readonly Colocacion[]) => { celdas; eventos: readonly AdicionAplicada[] }` | Paso 1 de la resolución: el efecto de colocar granos sobre una rejilla, sin mutarla. Devuelve la rejilla nueva y un `AdicionAplicada` por celda que recibe granos, por filas. Es la misma función que usa `Confirmar`; sirve para previsualizar una mano. Lanza `RangeError` si una colocación cae fuera de la rejilla (error de programación). |
| `reproducir` | `(config: Config, semilla: number, acciones: readonly Accion[]) => Resultado<{ estado: Estado; eventos: readonly Evento[] }, ErrorReproduccion>` | `crearRonda` y luego cada acción en orden. Ante un error informa del índice de la acción que falla. |
| `serializar` | `(estado: Estado) => string` | JSON canónico (claves ordenadas) con la envoltura `{"estado":{…},"formato":1}`. |
| `deserializar` | `(texto: string) => Resultado<Estado, ErrorDeserializacion>` | Inversa exacta de `serializar`; comprueba la forma y valida el estado. |
| `validarConfig` | `(config: Config) => Resultado<Config, ErrorConfig>` | Reglas de la configuración (por ejemplo, `siembra.max < umbral`). |
| `validarEstado` | `(estado: Estado) => Resultado<Estado, ErrorEstado>` | Invariantes del estado: composición del mazo, coherencia de la fase, `ordenColocacion`, flujos de azar, etc. |
| `derivarFlujo` | `(semilla: number, nombre: NombreFlujo) => EstadoFlujo` | Estado inicial del flujo de azar `nombre`. |
| `siguienteU32` | `(flujo: EstadoFlujo) => readonly [number, EstadoFlujo]` | Siguiente salida de 32 bits de xoshiro128** y el estado siguiente. |
| `enteroEnRango` | `(flujo: EstadoFlujo, min: number, max: number) => readonly [number, EstadoFlujo]` | Entero uniforme en `[min, max]`, sin sesgo de módulo. |
| `barajar` | `<T>(items: readonly T[], flujo: EstadoFlujo) => readonly [T[], EstadoFlujo]` | Fisher–Yates sobre una copia. |

Datos: `CONFIG_INICIAL` (la configuración de la ronda 1, calibrada en T2.5: `multiplicadorPorOleada` 50 y `meta` 5000) y `DEFINICIONES_GRANOS` (las adiciones de cada tipo de grano como tabla de desplazamientos).

Tipos: `Config`, `Estado`, `Accion`, `Evento` y cada evento por separado, `Resultado`, `TipoGrano`, `Fase`, `GranoMano`, `Colocacion` (un grano de un tipo en una celda, la entrada de `aplicarAdiciones`), `Direccion`, `EstadoFlujo`, `NombreFlujo`, `EstadoRng`, `DefinicionGrano` y los errores (`ErrorConfig`, `ErrorEstado`, `ErrorDeserializacion`, `ErrorResolucion`, `ErrorAccion`, `MotivoIlegal` y `ErrorReproduccion`). Cada uno lleva su TSDoc en el código.

## Política de errores

- **Los errores de juego se devuelven como `Resultado`**, nunca como excepciones: una acción ilegal (`AccionIlegal` con su `MotivoIlegal`), una resolución que supera `topeOleadas` (`ResolucionNoTermino`), una configuración inválida (`ErrorConfig`) o un texto que no se puede cargar (`ErrorDeserializacion`). Un error de `aplicar` deja el estado intacto, sin consumir azar ni emitir eventos.
- **Los motivos de acción ilegal se comprueban en este orden:** `FaseIncorrecta`, `IndiceManoInvalido`, `GranoYaColocado`, `CeldaFueraDeRejilla`, `NadaQueDeshacer` y `ManoIncompleta`.
- **Los `RangeError` son errores de programación**, no caminos de juego: una semilla que no es un entero de 0 a 2^32−1, límites inválidos en `enteroEnRango` o una colocación fuera de la rejilla en `aplicarAdiciones`.
- **`aplicar` presupone un estado válido**, como los que producen `crearRonda`, `aplicar` y `deserializar`. Con un estado inválido construido a mano su comportamiento no está definido; para comprobarlo antes existe `validarEstado`.

## Inmutabilidad

Los estados, las configuraciones y los eventos son datos JSON planos. Ninguna función los modifica: cada acción devuelve un estado nuevo. Quien los reciba no debe mutarlos; si necesita cambiar algo, debe construir una copia.

## Determinismo y azar

El núcleo es una función pura: sin reloj, sin `Math.random` y sin efectos secundarios. Todo el azar sale de dos flujos con nombre (`siembra` y `mazo`), derivados de la semilla de la ronda y guardados en `estado.rng`. Por eso la misma configuración, semilla y lista de acciones dan siempre los mismos estados y eventos, y una partida serializada sigue exactamente donde quedó. Consumir un flujo no altera al otro. Los detalles del generador (xoshiro128** 1.1) están en [`azar.md`](azar.md).

## Eventos

Los 12 eventos llevan el discriminante `tipo`, y sus puntos van siempre en centésimas. El detalle y el orden de emisión están en la sección «Eventos» de la especificación.

| Evento | Cuándo |
| --- | --- |
| `ManoRobada` | Al crear la ronda y tras cada tirada que no la termina; lleva los tipos de la mano nueva. |
| `GranoColocado` | Al colocar un grano de la mano en una celda (provisional; la rejilla no cambia). |
| `ColocacionDeshecha` | Al deshacer la colocación más reciente. |
| `TiradaConfirmada` | Al empezar `Confirmar`, con el número de tirada desde 1. |
| `AdicionAplicada` | Una vez por celda que recibe granos al aplicar la mano, por filas. |
| `OleadaIniciada` | Al empezar cada oleada, con sus celdas inestables. |
| `Derrumbe` | Una vez por celda que se derrumba en una oleada. |
| `GranoFuera` | Una vez por grano que sale de la rejilla, con la celda de origen, la dirección y sus puntos. |
| `OleadaTerminada` | Al terminar cada oleada, con derrumbes, granos fuera y puntos ganados. |
| `TiradaResuelta` | Tras la última oleada, con los totales de la tirada y los puntos acumulados. |
| `RondaGanada` | Cuando los puntos alcanzan la meta; conserva los sobrantes. |
| `RondaPerdida` | Cuando se acaban las tiradas sin alcanzar la meta. |

## Estabilidad

La lista de nombres exportados está fijada por `packages/core/test/interfaz.test.ts`, que comprueba los nombres en tiempo de ejecución y, en el verificador de tipos, los tipos públicos. Cualquier cambio en la superficie (añadir, quitar o renombrar) es un cambio de interfaz: exige actualizar esa prueba y este documento en el mismo commit.

## Ejemplo ejecutable

`packages/sim/src/ejemplo-ronda.ts` juega una ronda con un bot determinista y comprueba que es reproducible:

```sh
pnpm --filter @pila/sim ejemplo -- 42
```

Imprime la configuración, cada tirada, la fase final, el número de acciones y de eventos por tipo, y `reproducible: sí`. Si la partida no fuera reproducible, imprime `reproducible: NO` y sale con código distinto de 0.
