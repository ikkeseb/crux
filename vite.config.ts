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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Grade only the load-bearing logic; views/types/entrypoints are excluded.
      exclude: [
        '**/*.test.ts',
        '**/types.ts',
        'src/main.ts',
        'src/ui/**',
        'src/style.css',
        '**/*.config.ts',
        '**/*.config.js',
        'dist/**',
        'tests/**',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
})
