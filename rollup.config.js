import dts from 'rollup-plugin-dts';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

const external = ['fflate', 'fs', 'path', 'module'];

export default [
  // Main builds (CJS, ESM, Browser)
  {
    input: 'src/index.js',
    external,
    output: [
      // ESM build
      {
        file: 'dist/exrjs.esm.js',
        format: 'es',
        sourcemap: true,
      },
      // CJS build
      {
        file: 'dist/exrjs.cjs',
        format: 'cjs',
        sourcemap: true,
        exports: 'named',
      },
      // Browser build (bundled, minified)
      {
        file: 'dist/exrjs.browser.js',
        format: 'iife',
        name: 'exrjs',
        sourcemap: true,
        globals: {
          fflate: 'fflate',
        },
        plugins: [terser()],
      },
    ],
    plugins: [
      nodeResolve({
        preferBuiltins: true,
      }),
    ],
  },

  // TypeScript declarations build
  {
    input: 'types/index.d.ts',
    output: {
      file: 'dist/index.d.ts',
      format: 'es',
    },
    plugins: [dts()],
    external: ['fflate'],
  },
];
