/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest', // Use ts-jest for TypeScript support
  testEnvironment: 'node', // Run tests in a Node.js environment
  roots: ['<rootDir>/tests'], // Look for tests only in the `tests` folder
  testMatch: ['**/*.test.ts'], // Match test files ending with `.test.ts`
  clearMocks: true, // Automatically clear mocks between tests
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.jest.json" }], // ✅ Updated placement
  },
  moduleFileExtensions: ["ts", "js", "json", "node"], // Supported file extensions
  collectCoverage: true, // Enable coverage reports
  collectCoverageFrom: ["src/**/*.ts"], // Collect coverage only from `src` folder
  coverageDirectory: "coverage", // Output folder for coverage reports
  coverageReporters: ["text", "lcov"], // Output coverage in terminal and as an lcov report
};
