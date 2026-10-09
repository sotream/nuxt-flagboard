import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import prettier from 'eslint-config-prettier';
import base from '../../eslint.config.mjs';

export default defineConfig(
  base,
  { ignores: ['.nuxt/**', '.output/**', '.data/**'] },
  vue.configs['flat/recommended'],
  {
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    rules: { 'vue/block-lang': ['error', { script: { lang: 'ts' } }] },
  },
  {
    // Pages and layouts are named after their route (index.vue, [project].vue, default.vue), which is a single
    // word by design.
    files: ['app/pages/**/*.vue', 'app/layouts/**/*.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },
  // Last, so Prettier owns formatting and the Vue style rules that would fight it are off.
  prettier,
);
