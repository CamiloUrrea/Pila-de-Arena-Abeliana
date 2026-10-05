/**
 * Interfaz pública de `@pila/core`: el núcleo puro y determinista del juego de la pila de arena abeliana.
 *
 * Esta lista es estable y la protege `test/interfaz.test.ts`. Cualquier cambio (añadir, quitar o renombrar)
 * es un cambio de interfaz y exige actualizar esa prueba y `docs/api-nucleo.md`.
 * Todo lo demás de `src/` es interno.
 *
 * @packageDocumentation
 */

// Ronda y acciones.
export { crearRonda } from './ronda.ts';
export { accionesLegales, aplicar, reproducir } from './acciones.ts';
export type { Accion, ErrorAccion, ErrorReproduccion, MotivoIlegal } from './acciones.ts';

// Serialización y validación.
export { deserializar, serializar } from './serializacion.ts';
export { validarConfig, validarEstado } from './validacion.ts';

// Azar, para bots y herramientas.
export { barajar, derivarFlujo, enteroEnRango, siguienteU32 } from './azar.ts';

// Datos.
export { CONFIG_INICIAL } from './data/config-inicial.ts';
export { DEFINICIONES_GRANOS } from './data/granos.ts';

// Tipos.
export type { ErrorResolucion } from './oleadas.ts';
export type {
  Config,
  DefinicionGrano,
  ErrorConfig,
  ErrorDeserializacion,
  ErrorEstado,
  Estado,
  EstadoFlujo,
  EstadoRng,
  Fase,
  GranoMano,
  NombreFlujo,
  Resultado,
  TipoGrano,
} from './tipos.ts';
export type {
  AdicionAplicada,
  ColocacionDeshecha,
  Derrumbe,
  Direccion,
  Evento,
  GranoColocado,
  GranoFuera,
  ManoRobada,
  OleadaIniciada,
  OleadaTerminada,
  RondaGanada,
  RondaPerdida,
  TiradaConfirmada,
  TiradaResuelta,
} from './eventos.ts';
