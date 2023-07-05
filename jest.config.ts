import type { Config } from 'jest';

/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */
const config: Config = {
  // Automatically clear mock calls, instances, contexts and results before every test
  clearMocks: true,

  // An array of glob patterns indicating a set of files for which coverage information should be collected
  collectCoverageFrom: [
    '<rootDir>/**',
    '!**/main.ts',
    '!**/*.dto.ts',
    '!**/*.module.ts',
    '!**/__tests__/*.ts',
  ],

  // The directory where Jest should output its coverage files
  coverageDirectory: '../coverage',

  // Indicates which provider should be used to instrument code for coverage
  coverageProvider: 'babel',

  // A list of reporter names that Jest uses when writing coverage reports
  coverageReporters: ['json', 'lcov', 'text', 'text-summary'],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      statements: 65,
      branches: 50,
      functions: 60,
      lines: 65,
    },
  },

  // An array of file extensions your modules use
  moduleFileExtensions: ['js', 'ts', 'json'],

  // The root directory that Jest should scan for tests and modules within
  rootDir: 'src',

  // The test environment that will be used for testing
  testEnvironment: 'node',

  // The glob patterns Jest uses to detect test files
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)', '**/?(*.)+test.[jt]s?(x)'],

  // A map from regular expressions to paths to transformers
  transform: {
    '^.+\\.ts$': ['ts-jest', { isolatedModules: true }],
  },
};

export default config;
