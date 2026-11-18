// Run with --no-inline-config so no eslint-disable or inline config comment can switch these off.
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";
import local from "./eslint-rules/index.mjs";

export default defineConfig([
  globalIgnores([".next/**", "out/**", "build/**", "supabase/.temp/**", ".claude/worktrees/**"]),
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    plugins: { local },
    rules: { "local/no-server-code-in-client": "error" },
  },
]);
