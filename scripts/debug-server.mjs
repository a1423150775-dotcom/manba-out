process.env.NODE_ENV = 'development';
process.env.DEBUG_SCENARIOS = '1';
await import('../src/server/index.ts');
