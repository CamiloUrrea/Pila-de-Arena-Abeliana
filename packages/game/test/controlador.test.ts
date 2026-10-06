import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CONFIG_INICIAL, aplicar, crearRonda, validarEstado } from '@pila/core';
import type { Accion, Estado } from '@pila/core';
import { colocar, deshacer, iniciarControlador } from '../src/controlador.ts';
import type { EstadoInterfaz } from '../src/controlador.ts';

function ronda(semilla = 2026, lado = CONFIG_INICIAL.lado): Estado {
  const r = crearRonda({ ...CONFIG_INICIAL, lado }, semilla);
  if (!r.ok) throw new Error('configuración inválida');
  return r.valor.estado;
}

/** Desenvuelve un paso correcto del controlador o falla la prueba. */
function ok(paso: ReturnType<typeof colocar>): EstadoInterfaz {
  if (!paso.ok) throw new Error(`paso rechazado: ${JSON.stringify(paso.error)}`);
  return paso.valor.ui;
}

/** Congela un valor JSON en profundidad, para que cualquier mutación lance. */
function congelar<T>(valor: T): T {
  if (typeof valor === 'object' && valor !== null) {
    for (const v of Object.values(valor)) congelar(v);
    Object.freeze(valor);
  }
  return valor;
}

type Gesto = { readonly tipo: 'colocar'; readonly x: number; readonly y: number } | { readonly tipo: 'deshacer' };

const arbGestos = (lado: number): fc.Arbitrary<Gesto[]> =>
  fc.array(
    fc.oneof(
      fc.record({
        tipo: fc.constant('colocar' as const),
        x: fc.integer({ min: -1, max: lado }),
        y: fc.integer({ min: -1, max: lado }),
      }),
      fc.constant({ tipo: 'deshacer' as const }),
    ),
    { maxLength: 30 },
  );

describe('controlador', () => {
  it('iniciarControlador selecciona el índice 0; cada colocar avanza al siguiente y tras el último queda null', () => {
    let ui = iniciarControlador(ronda());
    expect(ui.seleccionado).toBe(0);
    for (let i = 1; i <= CONFIG_INICIAL.tamanoMano; i++) {
      const paso = colocar(ui, 0, 0);
      if (!paso.ok) throw new Error('colocación rechazada');
      expect(paso.valor.eventos).toEqual([{ tipo: 'GranoColocado', indiceMano: i - 1, x: 0, y: 0 }]);
      ui = paso.valor.ui;
      expect(ui.seleccionado).toBe(i < CONFIG_INICIAL.tamanoMano ? i : null);
    }
  });

  it('deshacer vuelve a seleccionar el grano deshecho', () => {
    let ui = iniciarControlador(ronda());
    ui = ok(colocar(ui, 0, 0));
    ui = ok(colocar(ui, 1, 1));
    ui = ok(colocar(ui, 2, 2));
    expect(ui.seleccionado).toBe(3);
    const paso = deshacer(ui);
    if (!paso.ok) throw new Error('deshacer rechazado');
    expect(paso.valor.eventos).toEqual([{ tipo: 'ColocacionDeshecha', indiceMano: 2 }]);
    ui = paso.valor.ui;
    expect(ui.seleccionado).toBe(2);
    ui = ok(deshacer(ui));
    expect(ui.seleccionado).toBe(1);
    // Al colocar de nuevo se selecciona el siguiente sin colocar de menor índice.
    ui = ok(colocar(ui, 0, 1));
    expect(ui.seleccionado).toBe(2);
  });

  it('deshacer con la mano completa vuelve a seleccionar el último grano colocado', () => {
    let ui = iniciarControlador(ronda());
    for (let i = 0; i < CONFIG_INICIAL.tamanoMano; i++) ui = ok(colocar(ui, 1, 1));
    expect(ui.seleccionado).toBeNull();
    expect(ok(deshacer(ui)).seleccionado).toBe(CONFIG_INICIAL.tamanoMano - 1);
  });

  it('colocar sin grano seleccionado devuelve SinGranoSeleccionado', () => {
    const ui: EstadoInterfaz = { estado: ronda(), seleccionado: null };
    expect(colocar(ui, 0, 0)).toEqual({ ok: false, error: { tipo: 'SinGranoSeleccionado' } });
  });

  it.each<[number, number]>([
    [-1, 0],
    [0, -1],
    [3, 0],
    [0, 3],
    [1.5, 0],
  ])('colocar en (%d, %d), fuera de la rejilla, devuelve el error de core', (x, y) => {
    const ui = iniciarControlador(ronda());
    expect(colocar(ui, x, y)).toEqual({ ok: false, error: { tipo: 'AccionIlegal', motivo: 'CeldaFueraDeRejilla' } });
  });

  it('deshacer sin colocaciones devuelve NadaQueDeshacer de core', () => {
    expect(deshacer(iniciarControlador(ronda()))).toEqual({
      ok: false,
      error: { tipo: 'AccionIlegal', motivo: 'NadaQueDeshacer' },
    });
  });

  it('fuera de la fase colocando no hay selección y los errores de core se propagan', () => {
    const ganado: Estado = { ...ronda(), fase: 'ganada', mano: [], ordenColocacion: [] };
    const ui = iniciarControlador(ganado);
    expect(ui.seleccionado).toBeNull();
    expect(deshacer(ui)).toEqual({ ok: false, error: { tipo: 'AccionIlegal', motivo: 'FaseIncorrecta' } });
  });

  it('propiedad: colocar y deshacer equivalen a las mismas acciones de core, no lanzan ni mutan y dejan estados válidos', () => {
    const arb = fc
      .record({ semilla: fc.nat({ max: 0xffffffff }), lado: fc.integer({ min: 1, max: 5 }) })
      .chain((r) => fc.record({ r: fc.constant(r), gestos: arbGestos(r.lado) }));
    fc.assert(
      fc.property(arb, ({ r, gestos }) => {
        let ui = congelar(iniciarControlador(ronda(r.semilla, r.lado)));
        let manual = ui.estado;
        for (const gesto of gestos) {
          const copia = structuredClone(ui);
          const { seleccionado } = ui;
          const paso = gesto.tipo === 'colocar' ? colocar(ui, gesto.x, gesto.y) : deshacer(ui);
          expect(ui).toEqual(copia);

          if (gesto.tipo === 'colocar' && seleccionado === null) {
            expect(paso).toEqual({ ok: false, error: { tipo: 'SinGranoSeleccionado' } });
            continue;
          }
          const accion: Accion =
            gesto.tipo === 'colocar'
              ? { tipo: 'Colocar', indiceMano: seleccionado ?? -1, x: gesto.x, y: gesto.y }
              : { tipo: 'Deshacer' };
          const esperado = aplicar(manual, accion);
          if (!esperado.ok) {
            expect(paso).toEqual({ ok: false, error: esperado.error });
            continue;
          }
          if (!paso.ok) throw new Error(`el controlador rechazó un paso que core acepta: ${JSON.stringify(paso.error)}`);
          manual = esperado.valor.estado;
          ui = congelar(paso.valor.ui);
          expect(ui.estado).toEqual(manual);
          expect(paso.valor.eventos).toEqual(esperado.valor.eventos);
          expect(validarEstado(ui.estado).ok).toBe(true);
          // La selección, si la hay, es siempre un grano sin colocar; si no, la mano está completa.
          if (ui.seleccionado !== null) expect(ui.estado.mano[ui.seleccionado]?.celda).toBeNull();
          else expect(ui.estado.mano.every((g) => g.celda !== null)).toBe(true);
        }
      }),
    );
  });
});
