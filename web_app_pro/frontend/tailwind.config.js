/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        sage: {
          50: '#f8faf8',
          100: '#f0f4f0',
          200: '#e0e8e0',
          300: '#c5d3c5',
          400: '#8ab68a',
          500: '#557c55', // Base Sophisticated Sage
          600: '#4a6d4a',
          700: '#3d5a3d',
          800: '#2d452d',
          900: '#1e2d1e',
        },
        accent: {
          primary: 'var(--accent-primary)',
          secondary: 'var(--accent-secondary)',
          muted: 'var(--accent-muted)',
        }
      },
      fontFamily: {
        outfit: ['Outfit', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse-sage 4s infinite ease-in-out',
        'float': 'float 6s ease-in-out infinite',
        'fade-in': 'fade-in 0.8s ease-out forwards',
      },
      keyframes: {
        'pulse-sage': {
          '0%, 100%': { opacity: 0.4 },
          '50%': { opacity: 0.7 },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'fade-in': {
          'from': { opacity: 0, transform: 'translateY(20px)' },
          'to': { opacity: 1, transform: 'translateY(0)' },
        }
      },
      backdropBlur: {
        xs: '2px',
      }
    },
  },
  plugins: [],
}
