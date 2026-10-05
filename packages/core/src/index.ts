/** Marcador provisional hasta que exista el núcleo real. */
export const NUCLEO_LISTO = true;

export type {
  Celdas,
  Config,
  Coordenada,
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
export { crearRejilla, dentro, leerCelda } from './rejilla.ts';
export { validarConfig, validarEstado } from './validacion.ts';
export { deserializar, serializar } from './serializacion.ts';
export { barajar, derivarFlujo, enteroEnRango, siguienteU32 } from './azar.ts';
