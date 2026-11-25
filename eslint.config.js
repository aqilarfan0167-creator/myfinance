import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
export default tseslint.config(
  { ignores: ['dist', 'public', 'node_modules'] },
  { files: ['src/**/*.{ts,tsx}'], linterOptions: { reportUnusedDisableDirectives: 'off' }, languageOptions: { parser: tseslint.parser }, plugins: { 'react-hooks': reactHooks }, rules: { 'react-hooks/rules-of-hooks': 'error' } },
);
