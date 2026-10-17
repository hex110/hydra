// The add-on runs in the browser as plain scripts, not through Vite.
module.exports = {
  env: { browser: true, es2022: true, webextensions: true },
  parserOptions: { sourceType: "script" },
};
