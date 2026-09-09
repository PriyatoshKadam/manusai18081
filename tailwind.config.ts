import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Poppins', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'Roboto Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Light "GAfix" surface/text scale (Claude Design mockup palette).
        // Kept under the historical `ink` key so every page already written
        // against text-ink-*/bg-ink-*/border-ink-* picks up the new look for free.
        ink: {
          950: '#16182B', // --text
          900: '#1E2036',
          800: '#282B45',
          700: '#3A3F5E',
          600: '#4A4F66', // --text-2
          500: '#6B7086',
          400: '#8A8FA3', // --text-3
          300: '#D6D8E4', // --border-strong
          200: '#E7E7EF', // --border
          100: '#F1F1F7', // --surface-3
          50: '#F8F8FB',  // --canvas
          0: '#FFFFFF',
        },
        brand: {
          50: '#F1F0FE',  // --tint
          100: '#E4E1FC',
          200: '#CBC5FA',
          300: '#A79EF6',
          400: '#8981F0',
          500: '#6E63F2', // --accent-2
          600: '#4F46E5', // --accent
          700: '#4238D4', // --accent-hover
          800: '#372DB0',
          950: '#221C6B',
        },
        accent: {
          DEFAULT: '#4F46E5',
          hover: '#4238D4',
          soft: '#6E63F2',
          tint: '#F1F0FE',
        },
        canvas: '#F8F8FB',
        surface: {
          DEFAULT: '#FFFFFF',
          2: '#FAFAFD',
          3: '#F1F1F7',
        },
        'btn-dark': {
          DEFAULT: '#0F1117',
          fg: '#FFFFFF',
          hover: '#25283A',
        },
        ok: { bg: '#ECFDF3', border: '#D5F0DE', fg: '#15803D', dot: '#16A34A' },
        warn: { bg: '#FFF6E5', border: '#F5E3BC', fg: '#B4830E', dot: '#F59E0B' },
        crit: { bg: '#FEECEC', border: '#F6D9D9', fg: '#DC2626' },
        high: { bg: '#FFF1E8', fg: '#C2560F', dot: '#EA7317' },
        info: { bg: '#EEF2FF', fg: '#3F46C4' },
        mon: { DEFAULT: '#ED6A1F', hover: '#D2560F', tint: '#FFF1E8', fg: '#A8430B' },
      },
      fontSize: {
        display: ['44px', { lineHeight: '1.08', fontWeight: '700' }],
        h1: ['32px', { lineHeight: '1.15', fontWeight: '600' }],
        h2: ['26px', { lineHeight: '1.2', fontWeight: '600' }],
        h3: ['20px', { lineHeight: '1.25', fontWeight: '600' }],
        title: ['16px', { lineHeight: '1.35', fontWeight: '600' }],
        kpi: ['30px', { lineHeight: '1.1', fontWeight: '700' }],
      },
      letterSpacing: {
        tight: '-0.02em',
        wide: '0.04em',
        caps: '0.08em',
      },
      borderRadius: {
        rail: '11px',
      },
    },
  },
  plugins: [],
};

export default config;
