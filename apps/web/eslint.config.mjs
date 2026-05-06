import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    // Build output, generated code, and third-party. Lint these and you get
    // hundreds of false-positive `require()` errors from compiled Next.js
    // chunks. This list is the parity with what `next lint` skipped by
    // default — when migrating off `next lint` to `eslint .` directly, this
    // is the missing piece.
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "public/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      ".turbo/**",
      ".vercel/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default eslintConfig;
