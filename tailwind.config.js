/** @type {import('tailwindcss').Config} */
// Design tokens. "slate" is re-mapped to warm neutrals and "teal" to the jade accent, so every screen
// inherits the palette. Text colours are re-checked for WCAG AA in src/index.css (verified with axe-core).
const neutral = { 50: '#faf9f7', 100: '#f3f2ee', 200: '#e7e5df', 300: '#d4d1c9', 400: '#a8a49a', 500: '#78746a', 600: '#57534b', 700: '#3f3c36', 800: '#2a2825', 900: '#1c1b19', 950: '#121211' };
const jade = { 50: '#eef8f5', 100: '#d5efe8', 200: '#abddd0', 300: '#78c4b1', 400: '#45a68f', 500: '#238a73', 600: '#17705d', 700: '#135a4b', 800: '#11483d', 900: '#0e3b33' };
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['"Plus Jakarta Sans Variable"', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      colors: {
        slate: neutral, teal: jade,
        income: { DEFAULT: '#15803d', soft: '#e7f5ec' },
        expense: { DEFAULT: '#c2362f', soft: '#fbeceb' },
        transfer: { DEFAULT: '#3b5bdb', soft: '#ecf0fd' },
        warn: { DEFAULT: '#c2410c', soft: '#fdf0e6' },
        saving: { DEFAULT: '#7c4dcc', soft: '#f3eefc' },
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.25rem' },
      letterSpacing: { tightish: '-0.015em' },
    },
  },
  plugins: [],
};
