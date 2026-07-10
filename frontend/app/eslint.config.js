import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist", "coverage"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      // Must be last: turns off ESLint rules that would conflict with Prettier
      // so formatting is owned solely by Prettier.
      prettier,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Diagnostics go through the shared logger (src/shared/utils/logger.ts),
      // the single sanctioned console sink, so the output destination can change
      // in one place. Direct console usage anywhere else is an error.
      "no-console": "error",
      // Loose coupling: a feature may only be imported through its public API
      // (its index.ts, e.g. "@features/upload"), never through its internal
      // files. See docs/architecture/frontend-architecture.md §5.
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@features/*/*"],
              message:
                'Import a feature only through its public API (e.g. "@features/upload"), not its internal files. See frontend-architecture.md §5.',
            },
          ],
        },
      ],
    },
  },
]);
