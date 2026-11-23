import { defineConfig } from 'vitest/config';

export default defineConfig({
  // "source" aponta os pacotes do workspace para src/*.ts (sem build na PHASE-01)
  // (testes rodam no ambiente SSR do vite, que usa ssr.resolve, não resolve.conditions)
  ssr: { resolve: { conditions: ['source'] } },
  test: { include: ['packages/*/test/**/*.test.{ts,tsx}', 'apps/*/test/**/*.test.{ts,tsx}', 'test/**/*.test.mjs'], testTimeout: 20000 },
});
