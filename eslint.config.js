// import js from "@eslint/js";
// import globals from "globals";
// import { defineConfig } from "eslint/config";


// export default defineConfig([
//   { files: ["**/*.{js,mjs,cjs}"], plugins: { js }, extends: ["js/recommended"] },
//   { files: ["**/*.{js,mjs,cjs}"], languageOptions: { globals: globals.browser } },
// ]);


import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { js },
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    },
    rules: {
      // ✅ TODO como advertencia o desactivado
      "no-undef": "warn",           // antes era error
      "no-unused-vars": "warn",
      "no-console": "off",
      "no-empty": "off",
      "no-var": "warn",
      "prefer-const": "warn"
    },
    extends: ["eslint:recommended"]
  }
]);
