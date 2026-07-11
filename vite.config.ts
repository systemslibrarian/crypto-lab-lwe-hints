import { defineConfig } from 'vitest/config';

// GitHub Pages serves this project under /crypto-lab-lwe-hints/.
export default defineConfig({
  base: '/crypto-lab-lwe-hints/',
  test: {
    globals: true,
    environment: 'node',
    // Only run Vitest unit tests. The Playwright e2e specs (e2e/) must not be
    // collected by Vitest, or they throw "test() was not expected here".
    include: ['src/**/*.test.ts'],
  },
});
