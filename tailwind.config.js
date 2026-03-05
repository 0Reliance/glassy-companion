/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './src/popup/index.html'],
  theme: {
    extend: {
      colors: {
        'glass-dark': 'rgba(12,12,20,0.95)',
        'glass-border': 'rgba(255,255,255,0.08)',
      },
      backdropBlur: {
        glass: '20px',
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.4)',
        'glass-sm': '0 4px 16px rgba(0,0,0,0.3)',
        'accent-glow': '0 0 20px rgba(99,102,241,0.3)',
      },
    },
  },
  plugins: [],
}
