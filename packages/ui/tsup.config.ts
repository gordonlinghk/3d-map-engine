import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  tsconfig: 'tsconfig.build.json',
  external: ['@map-engine/core', 'react', 'react-dom', 'react/jsx-runtime', 'zustand', 'fuse.js'],
});
