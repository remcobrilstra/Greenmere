// Lint for the game and its tools (npm run lint). Correctness rules only: the
// recommended set plus a few that catch real bugs; no style rules.
import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/", "_site/", "shots/", "agent-loop/", "tools/blender/"] },
  js.configs.recommended,
  {
    files: ["src/**/*.js", "sw.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...globals.browser } }
  },
  {
    files: ["sw.js"],
    languageOptions: { sourceType: "script", globals: { ...globals.serviceworker } }
  },
  {
    // Tools run in Node but hand callbacks to Playwright's page.evaluate, which run in the page.
    files: ["tools/**/*.mjs", "serve.mjs", "eslint.config.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...globals.node, ...globals.browser } }
  },
  {
    rules: {
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none", ignoreRestSiblings: true }],
      eqeqeq: ["error", "smart"],
      "no-implicit-globals": "error",
      "no-self-compare": "error",
      "no-template-curly-in-string": "error",
      "no-unreachable-loop": "error",
      "no-constant-binary-expression": "error",
      // The code often sets a default and then overwrites it in every branch; harmless.
      "no-useless-assignment": "off"
    }
  },
  {
    // The self-test spells out its arithmetic and calls things twice to prove determinism.
    files: ["src/test/**/*.js"],
    rules: { "no-self-compare": "off", "no-constant-binary-expression": "off", "no-loss-of-precision": "off" }
  }
];
