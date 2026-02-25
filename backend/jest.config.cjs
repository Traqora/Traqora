module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.integration.test.ts'],
  clearMocks: true,
  testEnvironmentOptions: {
    env: { NODE_ENV: 'test' },
  },
  globals: {
    'ts-jest': {
      diagnostics: {
        ignoreCodes: ['TS6133'], // unused variable — test files only
      },
    },
  },
};