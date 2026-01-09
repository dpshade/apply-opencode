import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
      },
      globals: {
        ...globals.node, // Allow Node.js globals (process, Buffer, etc.)
      },
    },
    rules: {
      // Allow Node.js modules - required for spawning OpenCode CLI
      "import/no-nodejs-modules": "off",
      // Allow innerHTML - used by @pierre/diffs library for rendering
      "@microsoft/sdl/no-inner-html": "off",
      // Allow console.log for debugging (convert to debug in production)
      "no-console": ["error", { allow: ["warn", "error", "debug", "log"] }],
    },
  },
  {
    ignores: ["node_modules/**", "main.js", "*.mjs"],
  },
]);
