export default {
  testEnvironment: "node",
  verbose: true,
  testMatch: ["**/__tests__/**/*.test.js"],
  collectCoverageFrom: ["src/**/*.js", "!src/**/index.js"],
};
