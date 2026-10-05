import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

const importNoRelativo = 'core solo admite imports relativos: sin paquetes externos ni módulos de Node.';

export default defineConfig(
  globalIgnores(['**/node_modules/', '**/dist/', '**/coverage/']),
  tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  // Pureza del núcleo: sin azar global, sin reloj y sin dependencias.
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Usa un flujo de azar con nombre derivado de la semilla.' },
        { object: 'globalThis', property: 'Date', message: 'core no puede leer el reloj.' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'core no puede leer el reloj (Date, Date.now y new Date están prohibidos).' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: '^node:', message: 'core no puede usar módulos de Node (node:*).' },
            { regex: '^(?!\.{1,2}/)', message: importNoRelativo },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression[source.type="Literal"]:not([source.value=/^\./])',
          message: importNoRelativo,
        },
        {
          selector: 'ImportExpression:not([source.type="Literal"])',
          message: 'core no admite import() dinámico con ruta calculada.',
        },
      ],
    },
  },
);
