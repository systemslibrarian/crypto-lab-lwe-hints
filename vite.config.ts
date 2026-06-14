import { defineConfig } from 'vite';

// GitHub Pages serves this project under /crypto-lab-lwe-hints/.
export default defineConfig({
  base: '/crypto-lab-lwe-hints/',
  test: {
    globals: true,
    environment: 'node',
  },
});
