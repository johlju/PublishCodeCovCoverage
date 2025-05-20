/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Only run tests with the integration.test.ts suffix in the __integration_tests__ folder
  testMatch: ['**/__integration_tests__/**/*.integration.test.ts'],
  collectCoverage: false, // Integration tests shouldn't contribute to coverage
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: '.',
      outputName: 'integration-junit.xml',
    }],
  ],
  setupFilesAfterEnv: ['./jest.setup.ts'],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  passWithNoTests: true, // Don't fail if no tests are found
  // Increase timeout for integration tests
  testTimeout: 60000 // 60 seconds timeout for integration tests
};
