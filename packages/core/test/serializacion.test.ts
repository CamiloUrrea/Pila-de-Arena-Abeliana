import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { deserializar, serializar } from '../src/index.ts';
import { arbEstado, congelar, conMano, estadoDePrueba, invertirClaves } from './ayudantes.ts';

describe('serializar y deserializar', () => {
  it('produce JSON canónico con la envoltura de formato 1', () => {
    const texto = serializar(estadoDePrueba());
    expect(texto.startsWith('{"estado":{"celdas":[[0,0,0],[0,0,0],[0,0,0]],"config":{"lado":3,')).toBe(true);
    expect(texto.endsWith(',"formato":1}')).toBe(true);
  });

  it('deserializar(serializar(e)) es igual a e', () => {
    fc.assert(
      fc.property(arbEstado, (estado) => {
        expect(deserializar(serializar(estado))).toEqual({ ok: true, valor: estado });
      }),
    );
  });

  it('la ida y vuelta conserva ordenColocacion', () => {
    const estado = conMano(
      estadoDePrueba(),
      [
        { tipo: 'normal', celda: { x: 2, y: 2 } },
        { tipo: 'normal', celda: { x: 0, y: 1 } },
        { tipo: 'normal', celda: null },
        { tipo: 'normal', celda: { x: 0, y: 1 } },
        { tipo: 'normal', celda: null },
      ],
      [3, 0, 1],
    );
    const leido = deserializar(serializar(estado));
    expect(leido).toEqual({ ok: true, valor: estado });
    if (leido.ok) expect(leido.valor.ordenColocacion).toEqual([3, 0, 1]);
  });

  it('volver a serializar da exactamente el mismo texto', () => {
    fc.assert(
      fc.property(arbEstado, (estado) => {
        const texto = serializar(estado);
        const leido = deserializar(texto);
        expect(leido.ok).toBe(true);
        if (leido.ok) expect(serializar(leido.valor)).toBe(texto);
      }),
    );
  });

  it('el texto no depende del orden de claves de la entrada', () => {
    fc.assert(
      fc.property(arbEstado, (estado) => {
        const invertido = invertirClaves(estado);
        expect(Object.keys(invertido)).not.toEqual(Object.keys(estado));
        expect(serializar(invertido)).toBe(serializar(estado));
      }),
    );
  });

  it('serializar no muta su entrada', () => {
    fc.assert(
      fc.property(arbEstado, (estado) => {
        const antes = deserializar(serializar(estado));
        const congelado = congelar(estado);
        serializar(congelado);
        expect(antes).toEqual({ ok: true, valor: congelado });
      }),
    );
  });

  it('deserializar nunca lanza ante texto o JSON arbitrario', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.json()), (texto) => {
        expect(typeof deserializar(texto).ok).toBe('boolean');
      }),
    );
  });
});

describe('deserializar rechaza', () => {
  const texto = serializar(estadoDePrueba());

  it.each([
    ['JSON roto', texto.slice(0, -1), { tipo: 'JsonInvalido' }],
    ['texto vacío', '', { tipo: 'JsonInvalido' }],
    ['un valor que no es objeto', '[1]', { tipo: 'FormatoDesconocido' }],
    ['formato 2', texto.replace('"formato":1', '"formato":2'), { tipo: 'FormatoDesconocido' }],
    ['formato como texto', texto.replace('"formato":1', '"formato":"1"'), { tipo: 'FormatoDesconocido' }],
    ['sin formato', texto.replace(',"formato":1', ''), { tipo: 'FormatoDesconocido' }],
    ['una clave extra en la envoltura', texto.replace('"formato":1', '"formato":1,"x":0'), { tipo: 'FormatoDesconocido' }],
    ['sin puntos', texto.replace('"puntos":0,', ''), { tipo: 'EstadoInvalido', campo: 'puntos' }],
    ['sin config.meta', texto.replace('"meta":1000,', ''), { tipo: 'EstadoInvalido', campo: 'config.meta' }],
    ['un campo extra', texto.replace('"puntos":0', '"puntos":0,"vidas":3'), { tipo: 'EstadoInvalido', campo: 'vidas' }],
    [
      'un campo extra anidado',
      texto.replace('"min":0', '"media":1,"min":0'),
      { tipo: 'EstadoInvalido', campo: 'config.siembra.media' },
    ],
    ['sin ordenColocacion', texto.replace('"ordenColocacion":[],', ''), { tipo: 'EstadoInvalido', campo: 'ordenColocacion' }],
    [
      'ordenColocacion que no es arreglo',
      texto.replace('"ordenColocacion":[]', '"ordenColocacion":{}'),
      { tipo: 'EstadoInvalido', campo: 'ordenColocacion' },
    ],
    [
      'ordenColocacion con texto',
      texto.replace('"ordenColocacion":[]', '"ordenColocacion":["0"]'),
      { tipo: 'EstadoInvalido', campo: 'ordenColocacion[0]' },
    ],
    ['puntos como texto', texto.replace('"puntos":0', '"puntos":"0"'), { tipo: 'EstadoInvalido', campo: 'puntos' }],
    [
      'celdas que no son arreglo',
      texto.replace('"celdas":[[0,0,0],[0,0,0],[0,0,0]]', '"celdas":{"0":[0,0,0]}'),
      { tipo: 'EstadoInvalido', campo: 'celdas' },
    ],
    ['tipo de grano desconocido', texto.replace('"usados":[]', '"usados":["arcilla"]'), { tipo: 'EstadoInvalido', campo: 'usados[0]' }],
    ['fase desconocida', texto.replace('"fase":"colocando"', '"fase":"pausada"'), { tipo: 'EstadoInvalido', campo: 'fase' }],
    ['rng con valores no numéricos', texto.replace('"mazo":[5,6,7,8]', '"mazo":[5,6,7,"8"]'), { tipo: 'EstadoInvalido', campo: 'rng.mazo[3]' }],
    [
      'un flujo de más en rng',
      texto.replace('"rng":{', '"rng":{"bonus":[1,2,3,4],'),
      { tipo: 'EstadoInvalido', campo: 'rng.bonus' },
    ],
    ['un flujo de 3 palabras', texto.replace('[5,6,7,8]', '[5,6,7]'), { tipo: 'EstadoInvalido', campo: 'rng.mazo' }],
    ['un flujo todo ceros', texto.replace('[5,6,7,8]', '[0,0,0,0]'), { tipo: 'EstadoInvalido', campo: 'rng.mazo' }],
    ['una palabra de 2^32', texto.replace('[5,6,7,8]', '[4294967296,6,7,8]'), { tipo: 'EstadoInvalido', campo: 'rng.mazo[0]' }],
    ['puntos negativos (forma bien, estado inválido)', texto.replace('"puntos":0', '"puntos":-1'), { tipo: 'EstadoInvalido', campo: 'puntos' }],
    ['composición alterada', texto.replace('"usados":[]', '"usados":["normal"]'), { tipo: 'EstadoInvalido', campo: 'mazo' }],
  ])('%s', (_, entrada, esperado) => {
    expect(entrada).not.toBe(texto);
    const resultado = deserializar(entrada);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toMatchObject(esperado);
  });
});
