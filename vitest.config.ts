import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
            environment: 'jsdom',
            setupFiles: ['./tests/setup/unit.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'integration',
            include: ['tests/integration/**/*.test.ts'],
            environment: 'jsdom',
            setupFiles: ['./tests/setup/integration.ts'],
            testTimeout: 30_000,
          },
        },
      ],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov', 'json-summary'],
        include: ['src/**/*.ts', 'src/**/*.tsx'],
        exclude: [
          'src/**/*.test.ts',
          'src/**/*.test.tsx',
          'src/**/*.d.ts',
          'src/wasm/**',
        ],
      },
    },
  }),
);
