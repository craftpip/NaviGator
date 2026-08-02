import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "doc/**", "screenshots/**"]
  },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.node,
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        location: "readonly",
        MutationObserver: "readonly",
        IntersectionObserver: "readonly",
        requestAnimationFrame: "readonly",
        Element: "readonly",
        Node: "readonly",
        NodeList: "readonly",
        HTMLCollection: "readonly",
        HTMLElement: "readonly",
        XPathResult: "readonly",
        NodeFilter: "readonly"
      }
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", ignoreRestSiblings: true }
      ]
    }
  }
];
