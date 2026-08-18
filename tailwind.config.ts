import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        ink: {
          950: '#0a0b0d',
          900: '#111318',
          800: '#1a1d24',
          700: '#252932',
          600: '#3a3f4b',
          500: '#5a6070',
          400: '#8b91a0',
          300: '#c4c9d3',
          200: '#e5e8ee',
          100: '#f4f5f8',
          50: '#fafbfc',
        },
        brand: {
          500: '#5b6cff',
          600: '#4553f5',
          700: '#3641d4',
        },
      },
    },
  },
  plugins: [],
};

export default config;
