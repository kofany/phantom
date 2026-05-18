console.error(
  [
    'This project uses Vitest for React/jsdom tests.',
    'Run: bun run test',
    '',
    'Direct `bun test` does not load vitest.config.ts and gives misleading DOM failures.',
  ].join('\n'),
)

process.exit(1)
