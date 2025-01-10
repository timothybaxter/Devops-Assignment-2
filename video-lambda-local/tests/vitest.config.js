import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000,  // Increased to 60 seconds
    setupFiles: ['./tests/setup.js'],
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  }
});