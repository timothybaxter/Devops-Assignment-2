export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.m?js$': 'babel-jest'
  },
  moduleFileExtensions: ['js', 'mjs'],
  testMatch: ['**/tests/**/*.js', '**/?(*.)+(spec|test).js'],
  verbose: true,
  collectCoverage: true,
  coverageDirectory: 'coverage'
};