import { fileURLToPath } from 'url';
import dts from 'rollup-plugin-dts';
import alias from '@rollup/plugin-alias';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

const external = ['fflate', 'fs', 'path', 'module'];

export default [
  // Main builds (CJS, ESM, UMD)
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
      // UMD build (for <script> tags; fflate expected as global)
      {
        file: 'dist/exrjs.umd.js',
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

  // Browser ESM build (fflate bundled inline, no node:zlib)
  {
    input: 'src/index.js',
    external: ['fs', 'path', 'module'],
    output: {
      file: 'dist/exrjs.browser.esm.js',
      format: 'es',
      sourcemap: true,
      plugins: [terser()],
    },
    plugins: [
      alias({
        entries: [
          {
            find: /^.*\/io\/zlib\.js$/,
            replacement: fileURLToPath(new URL('./src/io/zlib.browser.js', import.meta.url)),
          },
        ],
      }),
      nodeResolve({
        browser: true,
        preferBuiltins: false,
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
