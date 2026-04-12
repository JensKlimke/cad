/**
 * Ambient module declarations for ESLint plugins that do not ship their own
 * `.d.ts` files. Both plugins are declared as ESLint `Plugin`s so they
 * satisfy the shape ESLint's flat-config `plugins` map expects.
 *
 * Upstream projects to watch — delete the matching block once either publishes
 * types:
 *
 * - eslint-plugin-jsx-a11y       https://github.com/jsx-eslint/eslint-plugin-jsx-a11y
 * - eslint-plugin-no-only-tests  https://github.com/levibuzolic/eslint-plugin-no-only-tests
 */

declare module 'eslint-plugin-jsx-a11y' {
  import type { ESLint, Linter } from 'eslint';

  interface JsxA11yFlatConfigs {
    readonly recommended: Linter.Config;
    readonly strict: Linter.Config;
  }

  interface JsxA11yPlugin extends ESLint.Plugin {
    readonly flatConfigs: JsxA11yFlatConfigs;
  }

  const plugin: JsxA11yPlugin;
  export default plugin;
}

declare module 'eslint-plugin-no-only-tests' {
  import type { ESLint } from 'eslint';
  const plugin: ESLint.Plugin;
  export default plugin;
}
