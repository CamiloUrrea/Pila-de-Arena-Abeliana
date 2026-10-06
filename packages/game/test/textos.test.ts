import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFINICIONES_GRANOS } from '@pila/core';
import { CONFIG_INICIAL, crearRonda } from '@pila/core';
import type { Estado, MotivoIlegal } from '@pila/core';
import type { ErrorCascada } from '../src/cascada.ts';
import type { ErrorControlador } from '../src/controlador.ts';
import {
  TEXTOS,
  describirDefinicion,
  describirError,
  describirContadorRonda,
  describirFinDeRonda,
  describirGrano,
  describirMazo,
  describirTiradas,
  formatearPuntos,
  lineasMazo,
} from '../src/textos.ts';

describe('describirGrano', () => {
  it('describe los tres tipos del MVP a partir de DEFINICIONES_GRANOS', () => {
    expect(describirGrano('normal')).toBe('Normal: +1 en la celda');
    expect(describirGrano('pesado')).toBe('Pesado: +2 en la celda');
    expect(describirGrano('explosivo')).toBe('Explosivo: +1 en la celda y +1 en cada vecina');
  });

  it('se genera de los datos: si cambian las adiciones, cambia la frase', () => {
    const definiciones = { ...DEFINICIONES_GRANOS, normal: { tipo: 'normal', adiciones: [{ dx: 0, dy: 0, cantidad: 3 }] } };
    expect(describirGrano('normal', definiciones)).toBe('Normal: +3 en la celda');
  });

  it.each([
    [
      'cruz',
      [
        { dx: 0, dy: 0, cantidad: 2 },
        { dx: -1, dy: -1, cantidad: 1 },
        { dx: 1, dy: -1, cantidad: 1 },
        { dx: -1, dy: 1, cantidad: 1 },
        { dx: 1, dy: 1, cantidad: 1 },
      ],
      'Cruz: +2 en la celda y +1 en cada diagonal',
    ],
    [
      'cohete',
      [
        { dx: 0, dy: -1, cantidad: 1 },
        { dx: 0, dy: -1, cantidad: 1 },
      ],
      'Cohete: +2 arriba',
    ],
    [
      'gancho',
      [
        { dx: 0, dy: 0, cantidad: 1 },
        { dx: 1, dy: 0, cantidad: 1 },
        { dx: 0, dy: 1, cantidad: 2 },
      ],
      'Gancho: +1 en la celda, +1 a la derecha y +2 abajo',
    ],
    ['vacio', [], 'Vacio: sin efecto'],
    ['lejano', [{ dx: 2, dy: 0, cantidad: 1 }], 'Lejano: +1 grano en otra celda'],
    [
      'raro',
      [
        { dx: 0, dy: 0, cantidad: 1 },
        { dx: 3, dy: -2, cantidad: 2 },
      ],
      'Raro: +3 granos repartidos en 2 celdas',
    ],
  ])('una definición ficticia «%s» da una frase coherente o el respaldo genérico', (tipo, adiciones, frase) => {
    expect(describirDefinicion({ tipo, adiciones })).toBe(frase);
  });

  it('propiedad: con cualquier definición no lanza y empieza por el nombre del tipo', () => {
    const adicion = fc.record({
      dx: fc.integer({ min: -3, max: 3 }),
      dy: fc.integer({ min: -3, max: 3 }),
      cantidad: fc.integer({ min: -3, max: 5 }),
    });
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), fc.array(adicion, { maxLength: 10 }), (tipo, adiciones) => {
        const frase = describirDefinicion({ tipo, adiciones });
        expect(frase.startsWith(`${tipo.charAt(0).toUpperCase()}${tipo.slice(1)}: `)).toBe(true);
        expect(frase.length).toBeGreaterThan(tipo.length + 2);
      }),
    );
  });

  it('los textos fijos de la interfaz están en español', () => {
    expect(TEXTOS.deshacer).toBe('Deshacer');
    expect(TEXTOS.manoCompleta).toBe('Mano completa: confirma la tirada');
    expect(TEXTOS.confirmar).toBe('Confirmar');
    expect(TEXTOS.resolviendo).toBe('Resolviendo…');
    expect(TEXTOS.otraRonda).toBe('Otra ronda (Enter)');
    expect(TEXTOS.informacion(1, 42, 3)).toBe('Ronda 1 · semilla 42 · lado 3');
    expect(TEXTOS.informacion(7, 4294967295, 9)).toBe('Ronda 7 · semilla 4294967295 · lado 9');
  });
});

type ErrorPosible = ErrorControlador | ErrorCascada;

/** Clave de cada error posible: su tipo o, para `AccionIlegal`, su motivo. */
type ClaveError = Exclude<ErrorPosible['tipo'], 'AccionIlegal'> | MotivoIlegal;

const ilegal = (motivo: MotivoIlegal): ErrorPosible => ({ tipo: 'AccionIlegal', motivo });

/**
 * Un ejemplo de cada error conocido. El tipo `Record<ClaveError, …>` obliga a añadir aquí cualquier error nuevo
 * del controlador o del núcleo: si falta uno, esta prueba deja de compilar.
 */
const ERRORES: Readonly<Record<ClaveError, ErrorPosible>> = {
  SinGranoSeleccionado: { tipo: 'SinGranoSeleccionado' },
  GranoNoSeleccionable: { tipo: 'GranoNoSeleccionable', indice: 3 },
  NoEsLaUltimaColocacion: { tipo: 'NoEsLaUltimaColocacion', indice: 1 },
  GranoNoColocado: { tipo: 'GranoNoColocado', indice: 2 },
  ResolucionNoTermino: { tipo: 'ResolucionNoTermino', topeOleadas: 1000 },
  CascadaInvalida: { tipo: 'CascadaInvalida', motivo: 'Derrumbe de (1, 1), que no está en OleadaIniciada 1' },
  FaseIncorrecta: ilegal('FaseIncorrecta'),
  IndiceManoInvalido: ilegal('IndiceManoInvalido'),
  GranoYaColocado: ilegal('GranoYaColocado'),
  CeldaFueraDeRejilla: ilegal('CeldaFueraDeRejilla'),
  NadaQueDeshacer: ilegal('NadaQueDeshacer'),
  ManoIncompleta: ilegal('ManoIncompleta'),
};

describe('describirError', () => {
  it.each(Object.entries(ERRORES))('%s tiene un mensaje en español', (_, error) => {
    const mensaje = describirError(error);
    expect(mensaje.length).toBeGreaterThan(10);
    // Frase en español: empieza en mayúscula, termina en punto y no es el respaldo de error desconocido.
    expect(mensaje).toMatch(/^[A-ZÁÉÍÓÚÑ]/);
    expect(mensaje.endsWith('.')).toBe(true);
    expect(mensaje).not.toContain('desconocido');
  });

  it('cada error tiene un mensaje distinto', () => {
    const mensajes = Object.values(ERRORES).map(describirError);
    expect(new Set(mensajes).size).toBe(mensajes.length);
  });

  it('ManoIncompleta pide colocar todos los granos', () => {
    expect(describirError(ERRORES.ManoIncompleta)).toBe('Coloca todos los granos antes de confirmar.');
  });

  it('ResolucionNoTermino y CascadaInvalida son errores internos', () => {
    expect(describirError(ERRORES.ResolucionNoTermino)).toMatch(/^Error interno/);
    expect(describirError(ERRORES.CascadaInvalida)).toMatch(/^Error interno/);
  });

  it('NoEsLaUltimaColocacion explica cómo deshacer', () => {
    expect(describirError(ERRORES.NoEsLaUltimaColocacion)).toBe('Solo se puede deshacer la última colocación: usa Deshacer.');
  });
});

describe('describirFinDeRonda', () => {
  const estado = (): Estado => {
    const r = crearRonda(CONFIG_INICIAL, 1);
    if (!r.ok) throw new Error('configuración inválida');
    return r.valor.estado;
  };

  it('ronda ganada: título, puntos sobre la meta, tiradas usadas y botón', () => {
    expect(describirFinDeRonda({ ...estado(), fase: 'ganada', puntos: 523_450, tiradasRestantes: 2 })).toEqual({
      titulo: 'RONDA GANADA',
      puntos: '5234,5 / 50',
      tiradas: 'Tiradas usadas: 3 de 5',
      boton: 'Otra ronda (Enter)',
    });
  });

  it('ronda perdida, con todas las tiradas usadas', () => {
    expect(describirFinDeRonda({ ...estado(), fase: 'perdida', puntos: 4_007, tiradasRestantes: 0 })).toEqual({
      titulo: 'RONDA PERDIDA',
      puntos: '40,07 / 50',
      tiradas: 'Tiradas usadas: 5 de 5',
      boton: 'Otra ronda (Enter)',
    });
  });

  it.each([1, 3, 12])('el contador de ronda %i', (n) => {
    expect(describirContadorRonda(n)).toBe(`Ronda ${n}`);
  });

  it('con la ronda en juego no hay texto de fin', () => {
    expect(describirFinDeRonda(estado())).toBeNull();
  });

  it('formatearPuntos usa aritmética entera, coma decimal y sin ceros sobrantes', () => {
    expect([0, 5, 10, 100, 150, 175, 200, 4007, 523_450].map(formatearPuntos)).toEqual([
      '0',
      '0,05',
      '0,1',
      '1',
      '1,5',
      '1,75',
      '2',
      '40,07',
      '5234,5',
    ]);
    expect(formatearPuntos(-150)).toBe('−1,5');
  });
});

describe('describirMazo y describirTiradas', () => {
  it('el mazo con sus recuentos por tipo, con los nombres generados de los datos', () => {
    expect(describirMazo({ total: 17, porTipo: { normal: 12, pesado: 3, explosivo: 2 } })).toBe(
      'Mazo 17 · Normal 12 · Pesado 3 · Explosivo 2',
    );
    expect(describirMazo({ total: 0, porTipo: { normal: 0, pesado: 0, explosivo: 0 } })).toBe(
      'Mazo 0 · Normal 0 · Pesado 0 · Explosivo 0',
    );
    expect(lineasMazo({ total: 4, porTipo: { normal: 0, pesado: 4, explosivo: 0 } })).toEqual([
      'Mazo 4',
      'Normal 0',
      'Pesado 4',
      'Explosivo 0',
    ]);
  });

  it('los nombres del mazo coinciden con los de describirGrano', () => {
    for (const tipo of ['normal', 'pesado', 'explosivo'] as const) {
      const nombre = describirGrano(tipo).split(':')[0];
      expect(describirMazo({ total: 1, porTipo: { normal: 0, pesado: 0, explosivo: 0, [tipo]: 1 } })).toContain(`${nombre} 1`);
    }
  });

  it.each<[number, number, string]>([
    [5, 5, 'Tiradas 5/5'],
    [5, 3, 'Tiradas 3/5'],
    [5, 0, 'Tiradas 0/5'],
    [1, 1, 'Tiradas 1/1'],
  ])('tiradas %i con %i restantes: «%s»', (total, restantes, texto) => {
    expect(describirTiradas({ total, restantes })).toBe(texto);
  });
});
