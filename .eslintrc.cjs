module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parserOptions: {
    sourceType: "module",
    ecmaVersion: "latest",
  },
  extends: ["eslint:recommended", "prettier"],
  rules: {
    "no-unused-vars": "warn",
    "no-useless-escape": "warn",
    "no-empty": "warn",
  },
};
