import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts (which roots the web UI at ./web).
export default defineConfig({
  test: { root: '.', include: ['tests/**/*.test.ts'] },
});
