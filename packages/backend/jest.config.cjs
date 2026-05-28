module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  clearMocks: true,
  testEnvironmentOptions: {
    env: {
      NODE_ENV: 'test',
      ENCRYPTION_KEY: 'test-encryption-key-for-traqora-database-encryption-!!!',
    },
  },
  moduleNameMapper: {
    '^.*/src/index$': '<rootDir>/tests/mock-index.ts',
  },
  setupFiles: ['<rootDir>/tests/setup.ts'],
  moduleDirectories: ['node_modules', '../../node_modules'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json',
        diagnostics: false,
      },
    ],
  },
};