import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

const entry = ['src/index.js'];

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

const common = { entryPoints: entry, bundle: true, target: ['es2022'], logLevel: 'info' };

await build({ ...common, format: 'esm', outfile: 'dist/index.mjs' });
await build({ ...common, format: 'cjs', outfile: 'dist/index.cjs' });
await build({ ...common, format: 'iife', globalName: 'SelectorObserver', outfile: 'dist/index.global.js' });
await build({ ...common, format: 'iife', globalName: 'SelectorObserver', minify: true, outfile: 'dist/index.global.min.js' });

await cp('src/index.d.ts', 'dist/index.d.ts');
