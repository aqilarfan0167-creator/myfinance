/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        income: { DEFAULT: '#16a34a', soft: '#dcfce7' },
        expense: { DEFAULT: '#dc2626', soft: '#fee2e2' },
        transfer: { DEFAULT: '#2563eb', soft: '#dbeafe' },
        warn: { DEFAULT: '#ea580c', soft: '#ffedd5' },
        saving: { DEFAULT: '#9333ea', soft: '#f3e8ff' },
      },
    },
  },
  plugins: [],
};
