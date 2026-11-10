module.exports = {
  // Worktrees live inside the main checkout; without this, ESLint also loads
  // the outer config and finds two copies of every plugin.
  root: true,
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react/jsx-runtime",
    "plugin:react-hooks/recommended",
    "plugin:jsx-a11y/recommended",
    "@electron-toolkit/eslint-config-ts/recommended",
    "plugin:prettier/recommended",
  ],
  rules: {
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
    "@typescript-eslint/no-explicit-any": "warn",
    "prettier/prettier": [
      "error",
      {
        endOfLine: "auto",
      },
    ],
  },
  overrides: [
    {
      // The TypeScript parser reads an import-free file as a script, so the
      // dev CDP helpers' top-level await looks like a call to `await`.
      files: ["scripts/dev/*.mjs"],
      parser: "espree",
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
  ],
  settings: {
    react: {
      version: "detect",
    },
  },
};
