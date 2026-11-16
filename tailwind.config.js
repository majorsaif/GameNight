import defaultTheme from 'tailwindcss/defaultTheme';

/**
 * Design tokens for Its Games Night. Everything visual comes from here:
 * colour, type scale, corner radius, shadows and motion. The radius, shadow
 * and font-size scales REPLACE Tailwind's defaults on purpose, so a size that
 * isn't in the system can't be used by accident.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    screens: {
      sm: '480px', // large phones
      md: '768px', // tablets
      lg: '1024px', // landscape tablets and small laptops
      xl: '1280px' // laptops and up
    },
    fontFamily: {
      sans: ['"Bricolage Grotesque Variable"', ...defaultTheme.fontFamily.sans]
    },
    fontSize: {
      xs: ['0.75rem', { lineHeight: '1rem' }],
      sm: ['0.875rem', { lineHeight: '1.25rem' }],
      base: ['1rem', { lineHeight: '1.5rem' }],
      lg: ['1.125rem', { lineHeight: '1.625rem' }],
      xl: ['1.375rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em' }],
      '2xl': ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.015em' }],
      '3xl': ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '-0.02em' }],
      '4xl': ['3rem', { lineHeight: '3.125rem', letterSpacing: '-0.025em' }],
      display: ['4rem', { lineHeight: '4rem', letterSpacing: '-0.03em' }],
      timer: ['5.5rem', { lineHeight: '5.5rem', letterSpacing: '-0.03em' }]
    },
    borderRadius: {
      none: '0',
      sm: '6px',
      DEFAULT: '10px',
      control: '12px', // buttons, inputs, list rows
      card: '16px', // cards and panels
      sheet: '24px', // sheets and dialogs
      full: '9999px'
    },
    boxShadow: {
      none: 'none',
      pop: '0 18px 48px -12px rgb(0 0 0 / 0.65)' // anything floating: sheets, menus, toasts
    },
    extend: {
      colors: {
        bg: '#0b0d1c',
        surface: {
          DEFAULT: '#14182d',
          raised: '#1c2140',
          sunken: '#0f1224'
        },
        line: {
          DEFAULT: '#2a3053',
          strong: '#40477a'
        },
        ink: {
          DEFAULT: '#f4f5fc',
          muted: '#b0b6d6',
          faint: '#8188ad'
        },
        brand: {
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9'
        },
        // One accent per game, taken from its artwork
        mafia: '#ff6b6b',
        imposter: '#f6b94a',
        spyfall: '#56c8ff',
        success: '#4ade80',
        warning: '#fbbf24',
        danger: {
          DEFAULT: '#f87171',
          strong: '#dc2626'
        }
      },
      spacing: {
        gutter: '1.25rem', // page side padding
        section: '1.5rem', // gap between page sections
        tap: '2.75rem' // 44px minimum touch target
      },
      maxWidth: {
        column: '28rem', // single phone-width column
        wide: '60rem' // two-column tablet and laptop layouts
      },
      keyframes: {
        enter: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'none' }
        },
        fade: {
          from: { opacity: '0' },
          to: { opacity: '1' }
        },
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'none' }
        },
        pop: {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'none' }
        }
      },
      animation: {
        enter: 'enter 200ms ease-out both',
        fade: 'fade 160ms ease-out both',
        'sheet-up': 'sheet-up 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        pop: 'pop 160ms ease-out both'
      }
    }
  },
  plugins: []
};
