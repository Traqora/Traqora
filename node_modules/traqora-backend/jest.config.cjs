module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  clearMocks: true,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
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