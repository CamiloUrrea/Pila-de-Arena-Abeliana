import { describe, expect, it } from 'vitest';
import * as nucleo from '../src/index.ts';
import type {
  Accion,
  AdicionAplicada,
  ColocacionDeshecha,
  Config,
  DefinicionGrano,
  Derrumbe,
  Direccion,
  ErrorAccion,
  ErrorConfig,
  ErrorDeserializacion,
  ErrorEstado,
  ErrorReproduccion,
  ErrorResolucion,
  Estado,
  EstadoFlujo,
  EstadoRng,
  Evento,
  Fase,
  GranoColocado,
  GranoFuera,
  GranoMano,
  ManoRobada,
  MotivoIlegal,
  NombreFlujo,
  OleadaIniciada,
  OleadaTerminada,
  Resultado,
  RondaGanada,
  RondaPerdida,
  TiradaConfirmada,
  TiradaResuelta,
  TipoGrano,
} from '../src/index.ts';

/** Nombres exportados en tiempo de ejecución por `@pila/core`. */
const SUPERFICIE = [
  'CONFIG_INICIAL',
  'DEFINICIONES_GRANOS',
  'accionesLegales',
  'aplicar',
  'barajar',
  'crearRonda',
  'derivarFlujo',
  'deserializar',
  'enteroEnRango',
  'reproducir',
  'serializar',
  'siguienteU32',
  'validarConfig',
  'validarEstado',
];

/**
 * Tipos públicos: si alguno deja de exportarse, el verificador de tipos falla aquí.
 * Cambiar esta lista también es un cambio de interfaz.
 */
export type TiposPublicos = [
  Accion,
  Config,
  DefinicionGrano,
  Direccion,
  Estado,
  EstadoFlujo,
  EstadoRng,
  Evento,
  Fase,
  GranoMano,
  NombreFlujo,
  Resultado<unknown, unknown>,
  TipoGrano,
  // Errores.
  ErrorAccion,
  ErrorConfig,
  ErrorDeserializacion,
  ErrorEstado,
  ErrorReproduccion,
  ErrorResolucion,
  MotivoIlegal,
  // Los 12 eventos.
  ManoRobada,
  GranoColocado,
  ColocacionDeshecha,
  TiradaConfirmada,
  AdicionAplicada,
  OleadaIniciada,
  Derrumbe,
  GranoFuera,
  OleadaTerminada,
  TiradaResuelta,
  RondaGanada,
  RondaPerdida,
];

describe('interfaz pública de @pila/core', () => {
  it('exporta exactamente la superficie fijada', () => {
    expect(
      Object.keys(nucleo).sort(),
      'La superficie pública de @pila/core cambió. Es un cambio de interfaz: si es intencionado, ' +
        'actualiza SUPERFICIE en esta prueba y docs/api-nucleo.md en el mismo cambio.',
    ).toEqual([...SUPERFICIE].sort());
  });

  it('la ronda inicial con CONFIG_INICIAL es válida y tiene acciones legales', () => {
    const ronda = nucleo.crearRonda(nucleo.CONFIG_INICIAL, 1);
    expect(ronda.ok).toBe(true);
    if (ronda.ok) {
      expect(nucleo.validarEstado(ronda.valor.estado).ok).toBe(true);
      expect(nucleo.accionesLegales(ronda.valor.estado).length).toBeGreaterThan(0);
    }
  });
});
