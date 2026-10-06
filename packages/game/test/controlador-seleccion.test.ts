import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CONFIG_INICIAL, aplicar, crearRonda, validarEstado } from '@pila/core';
import type { Accion, Estado } from '@pila/core';
import { ciclar, colocar, deshacer, deshacerDesdeFicha, iniciarControlador, seleccionar } from '../src/controlador.ts';
import type { ErrorControlador, EstadoInterfaz, PasoInterfaz } from '../src/controlador.ts';
import type { Resultado } from '@pila/core';

function ronda(semilla = 2026, lado = CONFIG_INICIAL.lado, tamanoMano = CONFIG_INICIAL.tamanoMano): Estado {
  const r = crearRonda({ ...CONFIG_INICIAL, lado, tamanoMano }, semilla);
  if (!r.ok) throw new Error('configuración inválida');
  return r.valor.estado;
}

/** Desenvuelve un paso correcto del controlador o falla la prueba. */
function ok(paso: Resultado<PasoInterfaz, ErrorControlador>): EstadoInterfaz {
  if (!paso.ok) throw new Error(`paso rechazado: ${JSON.stringify(paso.error)}`);
  return paso.valor.ui;
}

/** Selecciona `indice` y lo coloca en la celda (0, 0). */
const colocarIndice = (ui: EstadoInterfaz, indice: number): EstadoInterfaz => ok(colocar(ok(seleccionar(ui, indice)), 0, 0));

/** Congela un valor JSON en profundidad, para que cualquier mutación lance. */
function congelar<T>(valor: T): T {
  if (typeof valor === 'object' && valor !== null) {
    for (const v of Object.values(valor)) congelar(v);
    Object.freeze(valor);
  }
  return valor;
}

describe('seleccionar', () => {
  it('acepta un índice de la mano sin colocar, sin cambiar el estado del núcleo ni emitir eventos', () => {
    const ui = iniciarControlador(ronda());
    for (let i = 0; i < CONFIG_INICIAL.tamanoMano; i++) {
      const paso = seleccionar(ui, i);
      expect(paso).toEqual({ ok: true, valor: { ui: { estado: ui.estado, seleccionado: i }, eventos: [] } });
    }
  });

  it.each([-1, 5, 99, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rechaza el índice %d con GranoNoSeleccionable', (indice) => {
    expect(seleccionar(iniciarControlador(ronda()), indice)).toEqual({
      ok: false,
      error: { tipo: 'GranoNoSeleccionable', indice },
    });
  });

  it('rechaza un grano ya colocado', () => {
    const ui = colocarIndice(iniciarControlador(ronda()), 2);
    expect(seleccionar(ui, 2)).toEqual({ ok: false, error: { tipo: 'GranoNoSeleccionable', indice: 2 } });
  });
});

describe('regla de selección tras colocar', () => {
  it('colocar el grano 1 de una mano de 5 selecciona el 2', () => {
    const ui = colocarIndice(iniciarControlador(ronda()), 1);
    expect(ui.seleccionado).toBe(2);
  });

  it('se salta los ya colocados: con el 2 colocado, colocar el 1 selecciona el 3', () => {
    let ui = colocarIndice(iniciarControlador(ronda()), 2);
    ui = colocarIndice(ui, 1);
    expect(ui.seleccionado).toBe(3);
  });

  it('colocar el último índice sin colocar selecciona el menor sin colocar', () => {
    let ui = iniciarControlador(ronda());
    ui = colocarIndice(ui, 4);
    expect(ui.seleccionado).toBe(0);
    ui = colocarIndice(ui, 0);
    ui = colocarIndice(ui, 3);
    // Sin colocar quedan el 1 y el 2; tras el 3 no hay ninguno mayor.
    expect(ui.seleccionado).toBe(1);
  });

  it('con todos colocados queda null', () => {
    let ui = iniciarControlador(ronda());
    for (const i of [3, 0, 4, 1, 2]) ui = colocarIndice(ui, i);
    expect(ui.seleccionado).toBeNull();
  });

  it('tras deshacer se selecciona el grano deshecho', () => {
    let ui = iniciarControlador(ronda());
    ui = colocarIndice(ui, 3);
    ui = colocarIndice(ui, 1);
    expect(ok(deshacer(ui)).seleccionado).toBe(1);
  });
});

describe('ciclar', () => {
  it('es circular en ambos sentidos', () => {
    let ui = iniciarControlador(ronda());
    const adelante: (number | null)[] = [];
    for (let i = 0; i < 6; i++) {
      ui = ok(ciclar(ui, 1));
      adelante.push(ui.seleccionado);
    }
    expect(adelante).toEqual([1, 2, 3, 4, 0, 1]);
    const atras: (number | null)[] = [];
    for (let i = 0; i < 6; i++) {
      ui = ok(ciclar(ui, -1));
      atras.push(ui.seleccionado);
    }
    expect(atras).toEqual([0, 4, 3, 2, 1, 0]);
  });

  it('se salta los granos colocados', () => {
    let ui = iniciarControlador(ronda());
    ui = colocarIndice(ui, 1);
    ui = colocarIndice(ui, 4);
    ui = ok(seleccionar(ui, 0));
    expect(ok(ciclar(ui, 1)).seleccionado).toBe(2);
    expect(ok(ciclar(ui, -1)).seleccionado).toBe(3);
  });

  it('con un solo grano sin colocar se queda en él', () => {
    let ui = iniciarControlador(ronda());
    for (const i of [0, 1, 2, 3]) ui = colocarIndice(ui, i);
    expect(ui.seleccionado).toBe(4);
    expect(ok(ciclar(ui, 1)).seleccionado).toBe(4);
    expect(ok(ciclar(ui, -1)).seleccionado).toBe(4);
  });

  it('sin granos sin colocar no hace nada', () => {
    let ui = iniciarControlador(ronda());
    for (const i of [0, 1, 2, 3, 4]) ui = colocarIndice(ui, i);
    expect(ciclar(ui, 1)).toEqual({ ok: true, valor: { ui, eventos: [] } });
    expect(ciclar(ui, -1)).toEqual({ ok: true, valor: { ui, eventos: [] } });
  });
});

describe('deshacerDesdeFicha', () => {
  it('con el último grano colocado equivale a deshacer', () => {
    let ui = iniciarControlador(ronda());
    ui = colocarIndice(ui, 0);
    ui = colocarIndice(ui, 3);
    expect(deshacerDesdeFicha(ui, 3)).toEqual(deshacer(ui));
    expect(ok(deshacerDesdeFicha(ui, 3)).seleccionado).toBe(3);
  });

  it('con otro grano colocado devuelve NoEsLaUltimaColocacion', () => {
    let ui = iniciarControlador(ronda());
    ui = colocarIndice(ui, 0);
    ui = colocarIndice(ui, 3);
    expect(deshacerDesdeFicha(ui, 0)).toEqual({ ok: false, error: { tipo: 'NoEsLaUltimaColocacion', indice: 0 } });
  });

  it.each([1, -1, 5, 0.5])('con el grano %d, sin colocar o inexistente, devuelve GranoNoColocado', (indice) => {
    const ui = colocarIndice(iniciarControlador(ronda()), 0);
    expect(deshacerDesdeFicha(ui, indice)).toEqual({ ok: false, error: { tipo: 'GranoNoColocado', indice } });
  });
});

type Gesto =
  | { readonly tipo: 'seleccionar'; readonly indice: number }
  | { readonly tipo: 'colocar'; readonly x: number; readonly y: number }
  | { readonly tipo: 'deshacer' }
  | { readonly tipo: 'ciclar'; readonly direccion: 1 | -1 }
  | { readonly tipo: 'deshacerDesdeFicha'; readonly indice: number };

const arbIndice = (n: number) => fc.oneof(fc.integer({ min: -1, max: n }), fc.constant(0.5));
const arbGestos = (lado: number, n: number): fc.Arbitrary<Gesto[]> =>
  fc.array(
    fc.oneof(
      fc.record({ tipo: fc.constant('seleccionar' as const), indice: arbIndice(n) }),
      fc.record({
        tipo: fc.constant('colocar' as const),
        x: fc.integer({ min: -1, max: lado }),
        y: fc.integer({ min: -1, max: lado }),
      }),
      fc.constant({ tipo: 'deshacer' as const }),
      fc.record({ tipo: fc.constant('ciclar' as const), direccion: fc.constantFrom(1 as const, -1 as const) }),
      fc.record({ tipo: fc.constant('deshacerDesdeFicha' as const), indice: arbIndice(n) }),
    ),
    { maxLength: 40 },
  );

/** La acción de `core` que debería disparar el gesto, `null` si no toca el núcleo, o el error esperado del controlador. */
function esperado(ui: EstadoInterfaz, gesto: Gesto): Accion | null | ErrorControlador {
  const { estado, seleccionado } = ui;
  switch (gesto.tipo) {
    case 'seleccionar':
      return Number.isInteger(gesto.indice) && estado.mano[gesto.indice]?.celda === null
        ? null
        : { tipo: 'GranoNoSeleccionable', indice: gesto.indice };
    case 'ciclar':
      return null;
    case 'colocar':
      return seleccionado === null
        ? { tipo: 'SinGranoSeleccionado' }
        : { tipo: 'Colocar', indiceMano: seleccionado, x: gesto.x, y: gesto.y };
    case 'deshacer':
      return { tipo: 'Deshacer' };
    case 'deshacerDesdeFicha': {
      const grano = Number.isInteger(gesto.indice) ? estado.mano[gesto.indice] : undefined;
      if (grano === undefined || grano.celda === null) return { tipo: 'GranoNoColocado', indice: gesto.indice };
      if (estado.ordenColocacion.at(-1) !== gesto.indice) return { tipo: 'NoEsLaUltimaColocacion', indice: gesto.indice };
      return { tipo: 'Deshacer' };
    }
  }
}

function ejecutar(ui: EstadoInterfaz, gesto: Gesto): Resultado<PasoInterfaz, ErrorControlador> {
  switch (gesto.tipo) {
    case 'seleccionar':
      return seleccionar(ui, gesto.indice);
    case 'colocar':
      return colocar(ui, gesto.x, gesto.y);
    case 'deshacer':
      return deshacer(ui);
    case 'ciclar':
      return ciclar(ui, gesto.direccion);
    case 'deshacerDesdeFicha':
      return deshacerDesdeFicha(ui, gesto.indice);
  }
}

const esAccion = (x: Accion | ErrorControlador): x is Accion => ['Colocar', 'Deshacer', 'Confirmar'].includes(x.tipo);

describe('propiedad del controlador completo', () => {
  it('seleccionar, colocar, deshacer, ciclar y deshacerDesdeFicha: sin lanzar ni mutar, igual que core a mano', () => {
    const arb = fc
      .record({
        semilla: fc.nat({ max: 0xffffffff }),
        lado: fc.integer({ min: 1, max: 5 }),
        tamanoMano: fc.integer({ min: 1, max: 9 }),
      })
      .chain((r) => fc.record({ r: fc.constant(r), gestos: arbGestos(r.lado, r.tamanoMano) }));
    fc.assert(
      fc.property(arb, ({ r, gestos }) => {
        let ui = congelar(iniciarControlador(ronda(r.semilla, r.lado, r.tamanoMano)));
        let manual = ui.estado;
        for (const gesto of gestos) {
          const copia = structuredClone(ui);
          const previsto = esperado(ui, gesto);
          const paso = ejecutar(ui, gesto);
          expect(ui).toEqual(copia);

          if (previsto === null) {
            // Gesto solo de interfaz: el núcleo no cambia.
            ui = congelar(ok(paso));
            expect(ui.estado).toEqual(manual);
          } else if (!esAccion(previsto)) {
            expect(paso).toEqual({ ok: false, error: previsto });
            continue;
          } else {
            const deCore = aplicar(manual, previsto);
            if (!deCore.ok) {
              expect(paso).toEqual({ ok: false, error: deCore.error });
              continue;
            }
            manual = deCore.valor.estado;
            ui = congelar(ok(paso));
            expect(ui.estado).toEqual(manual);
            if (paso.ok) expect(paso.valor.eventos).toEqual(deCore.valor.eventos);
          }
          expect(validarEstado(ui.estado).ok).toBe(true);
          // `seleccionado` es siempre null o un grano sin colocar; null solo con la mano completa.
          if (ui.seleccionado === null) expect(ui.estado.mano.every((g) => g.celda !== null)).toBe(true);
          else expect(ui.estado.mano[ui.seleccionado]?.celda).toBeNull();
        }
      }),
    );
  });
});
