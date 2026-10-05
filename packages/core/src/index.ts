/** Marcador provisional hasta que exista el núcleo real. */
export const NUCLEO_LISTO = true;

export type {
  AdicionGrano,
  Celdas,
  Colocacion,
  Config,
  Coordenada,
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
export { FASES, NOMBRES_FLUJO, TIPOS_GRANO } from './tipos.ts';
export { CONFIG_INICIAL } from './data/config-inicial.ts';
export { DEFINICIONES_GRANOS } from './data/granos.ts';
export { DIRECCIONES, crearRejilla, dentro, leerCelda } from './rejilla.ts';
export { validarConfig, validarEstado } from './validacion.ts';
export { deserializar, serializar } from './serializacion.ts';
export { barajar, derivarFlujo, enteroEnRango, siguienteU32 } from './azar.ts';
export type {
  AdicionAplicada,
  Derrumbe,
  Direccion,
  Evento,
  GranoFuera,
  ManoRobada,
  OleadaIniciada,
  OleadaTerminada,
  TiradaConfirmada,
  TiradaResuelta,
} from './eventos.ts';
export { GRANOS_POR_DERRUMBE, resolverOleadas } from './oleadas.ts';
export type { ErrorResolucion, ParametrosOleadas, ResultadoOleadas } from './oleadas.ts';
export { aplicarAdiciones } from './adiciones.ts';
export type { ResultadoAdiciones } from './adiciones.ts';
export { crearMazo, robarMano } from './mazo.ts';
export type { ResultadoRobo } from './mazo.ts';
export { resolverTirada } from './tirada.ts';
export type { ResolucionTirada } from './tirada.ts';
