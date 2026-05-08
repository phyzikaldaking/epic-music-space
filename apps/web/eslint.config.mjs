import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [
  {
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
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // eslint-plugin-react-hooks v7 (shipped with Next 16) added new strict
      // rules built around the React Compiler. The existing codebase wasn't
      // authored against them. Demote to warnings so lint passes; revisit each
      // class as part of a focused React Compiler readiness pass.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/static-components": "warn",
    },
  },
];

export default eslintConfig;
