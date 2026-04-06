import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: './',
    environment: 'node',
    include: ['**/*.spec.ts', '**/*.test.ts', 'test/**/*.e2e-spec.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
