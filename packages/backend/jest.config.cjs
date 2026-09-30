module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
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
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
  },
  collectCoverageFrom: [
    'src/services/**/*.ts',
    'src/jobs/**/*.ts',
    '!src/**/index.ts',
    '!src/**/*.test.ts',
  ],
  coverageThreshold: {
    global: {
      statements: 35,
      branches: 30,
      functions: 34,
      lines: 35,
    },
  },
  setupFiles: ['<rootDir>/tests/setup.ts'],
  moduleDirectories: ['node_modules', '<rootDir>/node_modules'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.test.json',
        diagnostics: false,
      },
    ],
  },
};