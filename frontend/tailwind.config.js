/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        lacquer: {
          950: '#07080B',
          900: '#0D0F15',
          800: '#141822',
          700: '#1C2130',
        },
        kinpaku: {
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
        },
        wa: {
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
        },
        brand: {
          50: '#f5f3ff',
          100: '#ede9fe',
          500: '#8b5cf6',
          600: '#7c3aed',
          900: '#4c1d95',
        }
      }
    },
  },
  plugins: [],
};
