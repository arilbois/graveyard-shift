import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'property',
          environment: 'node',
          include: ['tests/property/**/*.test.ts'],
          // Whole-engine properties simulate many hours of events per run.
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'webview',
          environment: 'jsdom',
          include: ['tests/webview/**/*.test.tsx'],
        },
      },
    ],
  },
});
