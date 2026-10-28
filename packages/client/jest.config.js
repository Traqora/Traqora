const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const customJestConfig = {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.test.tsx'],
  testPathIgnorePatterns: ['<rootDir>/tests/e2e/', '<rootDir>/tests/a11y/', '<rootDir>/.next/', '<rootDir>/node_modules/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
}

const configFactory = createJestConfig(customJestConfig)

module.exports = async () => {
  const config = await configFactory()

  config.transformIgnorePatterns = [
    '/node_modules/(?!.*(?:@exodus/bytes|@noble/|@scure/|@stellar/stellar-sdk|uint8array-extras))',
    ...config.transformIgnorePatterns.filter((pattern) => !pattern.includes('node_modules')),
  ]

  return config
}
