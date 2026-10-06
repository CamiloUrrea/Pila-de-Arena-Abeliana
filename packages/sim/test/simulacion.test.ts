import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CONFIG_INICIAL, accionesLegales, aplicar, crearRonda, derivarFlujo } from '@pila/core';
import type { Evento } from '@pila/core';
import { BOT_CICLICO, flujoDelBot, simularLote, simularRonda } from '../src/index.ts';
import type { Bot } from '../src/index.ts';

const temporal = mkdtempSync(join(tmpdir(), 'pila-sim-'));
afterAll(() => rmSync(temporal, { recursive: true, force: true }));

let contador = 0;
const ruta = (nombre: string): string => join(temporal, `${contador++}-${nombre}.jsonl`);

type LineaRonda = {
  tipo: 'ronda';
  indice: number;
  semilla: number;
  fase: string;
  puntos: number;
  tiradas: number;
  porTirada: { oleadas: number; derrumbes: number; granosFuera: number; puntosGanados: number }[];
};

function lote(desde: number, rondas: number, semillaInicial = 1): { texto: string; lineas: string[] } {
  const salida = ruta(`lote-${desde}-${rondas}`);
  simularLote({ config: CONFIG_INICIAL, bot: BOT_CICLICO, semillaInicial, desde, rondas, salida });
  const texto = readFileSync(salida, 'utf8');
  return { texto, lineas: texto.split('\n').filter((l) => l !== '') };
}

function rondasDe(lineas: readonly string[]): LineaRonda[] {
  return lineas.slice(1).map((l): LineaRonda => JSON.parse(l));
}

describe('simularLote', () => {
  it('determinismo: dos ejecuciones del mismo lote dan archivos idénticos byte a byte', () => {
    const a = ruta('a');
    const b = ruta('b');
    simularLote({ config: CONFIG_INICIAL, bot: BOT_CICLICO, semillaInicial: 77, desde: 0, rondas: 300, salida: a });
    simularLote({ config: CONFIG_INICIAL, bot: BOT_CICLICO, semillaInicial: 77, desde: 0, rondas: 300, salida: b });
    expect(readFileSync(b).equals(readFileSync(a))).toBe(true);
  });

  it('trozos equivalentes: [0, 200) da las mismas rondas que [0, 100) más [100, 200)', () => {
    const entero = lote(0, 200).lineas.slice(1);
    const trozos = [...lote(0, 100).lineas.slice(1), ...lote(100, 100).lineas.slice(1)];
    expect(trozos).toEqual(entero);
  });

  it('la ronda i usa la semilla semillaInicial + i, con vuelta a 0 desde 4294967295', () => {
    expect(rondasDe(lote(0, 3, 4294967295).lineas).map((r) => [r.indice, r.semilla])).toEqual([
      [0, 4294967295],
      [1, 0],
      [2, 1],
    ]);
    expect(rondasDe(lote(5, 4, 1000).lineas).map((r) => [r.indice, r.semilla])).toEqual([
      [5, 1005],
      [6, 1006],
      [7, 1007],
      [8, 1008],
    ]);
  });

  it('cabecera y líneas con el esquema y orden de claves fijos', () => {
    const { lineas } = lote(0, 2, 9);
    expect(lineas).toHaveLength(3);
    expect(lineas[0]).toBe(
      '{"tipo":"cabecera","formato":1,"bot":"ciclico","config":{"lado":3,"umbral":4,"tiradas":5,"tamanoMano":5,' +
        '"siembra":{"min":0,"max":2},"mazo":{"normal":20,"pesado":6,"explosivo":4},"meta":5000,' +
        '"multiplicadorPorOleada":50,"topeOleadas":1000},"semillaInicial":9,"desde":0,"rondas":2}',
    );
    for (const linea of lineas.slice(1)) {
      expect(Object.keys(JSON.parse(linea))).toEqual(['tipo', 'indice', 'semilla', 'fase', 'puntos', 'tiradas', 'porTirada']);
    }
  });

  it('cada ronda es coherente: fase, tiradas, suma de puntos y meta', () => {
    for (const r of rondasDe(lote(0, 300).lineas)) {
      expect(['ganada', 'perdida']).toContain(r.fase);
      expect(r.porTirada).toHaveLength(r.tiradas);
      expect(r.porTirada.reduce((t, p) => t + p.puntosGanados, 0)).toBe(r.puntos);
      expect(r.puntos >= CONFIG_INICIAL.meta).toBe(r.fase === 'ganada');
      for (const p of r.porTirada) {
        expect(Object.keys(p)).toEqual(['oleadas', 'derrumbes', 'granosFuera', 'puntosGanados']);
        expect(p.derrumbes).toBeGreaterThanOrEqual(p.oleadas);
      }
    }
  });

  it('porTirada coincide con un recálculo independiente con la interfaz de core (50 rondas)', () => {
    for (const r of rondasDe(lote(0, 50, 321).lineas)) {
      const ronda = crearRonda(CONFIG_INICIAL, r.semilla);
      if (!ronda.ok) throw new Error('configuración inválida');
      let estado = ronda.valor.estado;
      let azar = flujoDelBot(r.semilla);
      const eventos: Evento[] = [];
      while (estado.fase === 'colocando') {
        const [accion, siguiente] = BOT_CICLICO.elegir(estado, accionesLegales(estado), azar);
        const paso = aplicar(estado, accion);
        if (!paso.ok) throw new Error('acción rechazada');
        azar = siguiente;
        estado = paso.valor.estado;
        eventos.push(...paso.valor.eventos);
      }
      // Recálculo con otra fuente: derrumbes sumando OleadaTerminada en lugar de contar Derrumbe.
      const esperado: LineaRonda['porTirada'] = [];
      let derrumbes = 0;
      for (const e of eventos) {
        if (e.tipo === 'OleadaTerminada') derrumbes += e.derrumbes;
        if (e.tipo === 'TiradaResuelta') {
          esperado.push({ oleadas: e.oleadas, derrumbes, granosFuera: e.granosFuera, puntosGanados: e.puntosGanados });
          derrumbes = 0;
        }
      }
      expect(r.porTirada).toEqual(esperado);
      expect([r.fase, r.puntos]).toEqual([estado.fase, estado.puntos]);
    }
  });
});

describe('simularRonda: fallo rápido', () => {
  const nuncaConfirma: Bot = {
    nombre: 'indeciso',
    elegir: (_, acciones, azar) => {
      const accion = acciones.find((a) => a.tipo === 'Colocar') ?? acciones.find((a) => a.tipo === 'Deshacer');
      if (accion === undefined) throw new Error('sin acciones');
      return [accion, azar];
    },
  };
  const tramposo: Bot = {
    nombre: 'tramposo',
    elegir: (_, __, azar) => [{ tipo: 'Colocar', indiceMano: 99, x: 0, y: 0 }, azar],
  };

  it('un bot que nunca confirma supera maxAcciones y el error lleva la semilla y el bot', () => {
    expect(() => simularRonda(CONFIG_INICIAL, 4242, nuncaConfirma, { maxAcciones: 500 })).toThrow(
      /500 acciones.*semilla 4242, bot indeciso/,
    );
  });

  it('un bot que devuelve una acción ilegal da un error con la semilla', () => {
    expect(() => simularRonda(CONFIG_INICIAL, 17, tramposo)).toThrow(/acción rechazada \(semilla 17, bot tramposo\)/);
  });
});

describe('flujo de azar del bot', () => {
  it('es distinto de los flujos siembra y mazo del juego para las semillas 0 a 999', () => {
    for (let semilla = 0; semilla < 1000; semilla++) {
      const bot = flujoDelBot(semilla);
      expect(bot).not.toEqual(derivarFlujo(semilla, 'siembra'));
      expect(bot).not.toEqual(derivarFlujo(semilla, 'mazo'));
    }
  });
});
