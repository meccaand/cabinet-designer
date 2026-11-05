/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/**/*.test.ts', 'src/core/**/index.ts', 'src/core/**/__tests__/**'],
      thresholds: {
        // Dimensional code carries the accuracy bar; see docs/PLAN.md "Verification".
        'src/core/units/**': { lines: 95, branches: 95, functions: 95, statements: 95 },
        'src/core/model/**': { lines: 95, branches: 95, functions: 95, statements: 95 },
        'src/core/generate/**': { lines: 95, branches: 90, functions: 95, statements: 95 },
        'src/core/drawing/**': { lines: 95, branches: 90, functions: 95, statements: 95 },
        'src/core/layout/**': { lines: 95, branches: 85, functions: 95, statements: 95 },
        'src/core/nesting/**': { lines: 95, branches: 90, functions: 95, statements: 95 },
        'src/core/cutlist/**': { lines: 95, branches: 90, functions: 95, statements: 95 },
        'src/core/costing/**': { lines: 95, branches: 90, functions: 95, statements: 95 },
        'src/core/report/**': { lines: 95, branches: 90, functions: 95, statements: 95 },
        'src/core/geometry/**': { lines: 95, branches: 95, functions: 95, statements: 95 },
        'src/core/hardware/**': { lines: 95, branches: 95, functions: 95, statements: 95 },
      },
    },
  },
});
