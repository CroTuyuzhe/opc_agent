import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
  target: 'node18',
  platform: 'node',
  splitting: false,
});
