import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { derivarFlujo, enteroEnRango } from '@pila/core';
import type { Estado, EstadoFlujo, Evento } from '@pila/core';
import { colocar, confirmar, deshacer } from '../src/controlador.ts';
import type { EstadoInterfaz } from '../src/controlador.ts';
import {
  cerrarRegistro,
  esRegistro,
  idSesion,
  marcarPidioOtra,
  seguimientoNuevo,
  seguirConfirmacion,
  seguirDeshacer,
} from '../src/registro.ts';
import type { RegistroRonda, Seguimiento } from '../src/registro.ts';
import { nuevaRonda } from '../src/rondas.ts';
import { resumenSesion } from '../src/sesion.ts';
import { jugar } from './bot.ts';

const congelar = <T>(valor: T): T => {
  if (typeof valor === 'object' && valor !== null) {
    for (const v of Object.values(valor)) congelar(v);
    Object.freeze(valor);
  }
  return valor;
};

const datosCierre = { sesion: 'abcd1234', jugador: 'Ana', indice: 1, finMs: 5000, fecha: '2026-10-06T12:00:00.000Z' };

/** Oleadas y derrumbes de una tirada calculados directamente de sus eventos. */
function directo(eventos: readonly Evento[]): { oleadas: number; derrumbes: number } {
  const resuelta = eventos.find((e) => e.tipo === 'TiradaResuelta');
  return {
    oleadas: resuelta?.tipo === 'TiradaResuelta' ? resuelta.oleadas : 0,
    derrumbes: eventos.filter((e) => e.tipo === 'Derrumbe').length,
  };
}

describe('seguimiento de una ronda', () => {
  it('propiedad: con partidas reales, oleadasMax, avalanchaMax y tiradasUsadas salen de los eventos', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 6 }), fc.nat({ max: 0xffffffff }), fc.nat({ max: 0xffffffff }), (lado, semilla, bot) => {
        const tiradas = jugar(lado, semilla, bot, 20);
        let s = congelar(seguimientoNuevo({ semilla, lado, inicioMs: 1000 }));
        for (const t of tiradas) s = congelar(seguirConfirmacion(s, congelar(t.eventos)));
        const medidas = tiradas.map((t) => directo(t.eventos));
        expect(s.tiradas).toBe(tiradas.length);
        expect(s.oleadasMax).toBe(Math.max(0, ...medidas.map((m) => m.oleadas)));
        expect(s.avalanchaMax).toBe(Math.max(0, ...medidas.map((m) => m.derrumbes)));
        const final = tiradas.at(-1)?.despues;
        if (final === undefined || final.fase === 'colocando') return;
        const r = cerrarRegistro(s, congelar(final), datosCierre);
        expect(r).not.toBeNull();
        expect(r?.tiradasUsadas).toBe(tiradas.length);
        expect(r?.resultado).toBe(final.fase);
        expect(r?.puntos).toBe(final.puntos);
        expect(r?.meta).toBe(final.config.meta);
        expect(r?.tiradasTotales).toBe(final.config.tiradas);
        expect(r && esRegistro(r)).toBe(true);
      }),
      { numRuns: 40 },
    );
  });

  it('deshacer cuenta sus usos sin mutar el seguimiento', () => {
    const inicial = congelar(seguimientoNuevo({ semilla: 1, lado: 3, inicioMs: 0 }));
    const tres = seguirDeshacer(seguirDeshacer(seguirDeshacer(inicial)));
    expect(tres.deshacer).toBe(3);
    expect(inicial.deshacer).toBe(0);
  });

  it('cerrarRegistro: todos los campos, con pidioOtra en false; null si la ronda no terminó', () => {
    const t = jugar(3, 2026, 1, 20).at(-1);
    if (t === undefined || t.despues.fase === 'colocando') throw new Error('la partida no terminó');
    const s: Seguimiento = { semilla: 2026, lado: 3, inicioMs: 1000, tiradas: 5, oleadasMax: 4, avalanchaMax: 9, deshacer: 2 };
    const r = cerrarRegistro(s, t.despues, datosCierre);
    expect(r).toEqual({
      version: 1,
      sesion: 'abcd1234',
      jugador: 'Ana',
      indice: 1,
      semilla: 2026,
      lado: 3,
      resultado: t.despues.fase,
      puntos: t.despues.puntos,
      meta: t.despues.config.meta,
      tiradasUsadas: 5,
      tiradasTotales: t.despues.config.tiradas,
      oleadasMax: 4,
      avalanchaMax: 9,
      deshacer: 2,
      duracionMs: 4000,
      pidioOtra: false,
      fecha: '2026-10-06T12:00:00.000Z',
    });
    expect(cerrarRegistro(s, t.antes, datosCierre)).toBeNull();
  });

  it('marcarPidioOtra devuelve una copia y no modifica el original', () => {
    const t = jugar(3, 5, 5, 20).at(-1);
    if (t === undefined) throw new Error('sin tiradas');
    const r = cerrarRegistro(seguimientoNuevo({ semilla: 5, lado: 3, inicioMs: 0 }), t.despues, datosCierre);
    if (r === null) throw new Error('la partida no terminó');
    const original = congelar(r);
    const marcado = marcarPidioOtra(original);
    expect(original.pidioOtra).toBe(false);
    expect(marcado).toEqual({ ...original, pidioOtra: true });
  });

  it('idSesion da 8 caracteres hexadecimales', () => {
    expect(idSesion(0)).toBe('00000000');
    expect(idSesion(0xffffffff)).toBe('ffffffff');
    expect(idSesion(0xabc)).toBe('00000abc');
    fc.assert(
      fc.property(fc.nat({ max: 0xffffffff }), (n) => {
        expect(idSesion(n)).toMatch(/^[0-9a-f]{8}$/);
      }),
    );
  });
});

/** Juega una ronda hasta su fin con el controlador puro, usando a veces Deshacer, y lleva su seguimiento. */
function jugarRonda(inicio: EstadoInterfaz, semillaBot: number, s0: Seguimiento): { final: Estado; seguimiento: Seguimiento } {
  let ui = inicio;
  let s = s0;
  let flujo: EstadoFlujo = derivarFlujo(semillaBot, 'mazo');
  const lado = ui.estado.config.lado;
  for (let vueltas = 0; ui.estado.fase === 'colocando'; vueltas++) {
    if (vueltas > 100) throw new Error('la ronda no termina');
    while (ui.seleccionado !== null) {
      const [x, f1] = enteroEnRango(flujo, 0, lado - 1);
      const [y, f2] = enteroEnRango(f1, 0, lado - 1);
      const [d, f3] = enteroEnRango(f2, 0, 3);
      flujo = f3;
      const paso = colocar(ui, x, y);
      if (!paso.ok) throw new Error('colocación rechazada');
      ui = paso.valor.ui;
      if (d === 0) {
        // De vez en cuando se deshace y se cuenta.
        const deshecho = deshacer(ui);
        if (deshecho.ok) {
          ui = deshecho.valor.ui;
          s = seguirDeshacer(s);
        }
      }
    }
    const paso = confirmar(ui);
    if (!paso.ok) throw new Error('confirmación rechazada');
    s = seguirConfirmacion(s, paso.valor.eventos);
    ui = paso.valor.ui;
  }
  return { final: ui.estado, seguimiento: s };
}

describe('sesión simulada con registro', () => {
  it('varias rondas: un registro por ronda, índices consecutivos y solo la última sin pidioOtra', () => {
    const sesion = 'cafe0001';
    const semillas = [101, 202, 303, 404];
    let registros: RegistroRonda[] = [];
    let reloj = 0;
    for (const [i, semilla] of semillas.entries()) {
      // Al empezar otra ronda, la anterior queda marcada.
      const ultima = registros.at(-1);
      if (ultima !== undefined) registros = [...registros.slice(0, -1), marcarPidioOtra(ultima)];
      const ronda = nuevaRonda({ lado: 3, semilla });
      if (!ronda.ok) throw new Error('ronda rechazada');
      const { final, seguimiento } = jugarRonda(ronda.valor, semilla + 1, seguimientoNuevo({ semilla, lado: 3, inicioMs: reloj }));
      reloj += 60_000;
      const r = cerrarRegistro(seguimiento, final, { sesion, jugador: null, indice: i + 1, finMs: reloj, fecha: `f${i}` });
      if (r === null) throw new Error('la ronda no terminó');
      registros = [...registros, r];
    }
    expect(registros).toHaveLength(semillas.length);
    expect(registros.map((r) => r.indice)).toEqual([1, 2, 3, 4]);
    expect(registros.map((r) => r.semilla)).toEqual(semillas);
    expect(registros.map((r) => r.pidioOtra)).toEqual([true, true, true, false]);
    expect(registros.every(esRegistro)).toBe(true);
    expect(registros.some((r) => r.deshacer > 0)).toBe(true);
    const resumen = resumenSesion(registros);
    expect(resumen.rondas).toBe(4);
    expect(resumen.pidioOtra).toBe(3);
  });
});
