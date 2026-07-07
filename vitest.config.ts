import { defineConfig } from 'vitest/config';

// `pool: forks` keeps each test file in its own Node process. The `ws` package
// (used by apps/orchestrator/tests/voice-bridge.test.ts and
// apps/orchestrator/tests/public-mcp.test.ts) is a native module that crashes
// the shared thread pool at process exit; isolating each file in its own
// process keeps the crash contained. Performance impact: a few hundred ms
// of startup per file, which is invisible at our scale.
export default defineConfig({
  test: {
    include: ['packages/**/tests/**/*.test.ts', 'apps/**/tests/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
