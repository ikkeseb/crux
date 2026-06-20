import { defineConfig } from 'vitest/config'

// Static, no backend. Relative base so the build can be served from any path.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Property/generation tests can be heavy; give them room.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
