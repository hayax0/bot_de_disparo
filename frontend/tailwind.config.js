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
        emerald: {
          50: '#effcf5', 100: '#d9fbea', 200: '#b5f7d6',
          300: '#98f7c8', 400: '#74efb3', 500: '#74efb3',
          600: '#5bd79b', 700: '#27794f', 800: '#1a5037', 900: '#123524', 950: '#080b0b',
        },
        lacquer: {
          950: '#080b0b',
          900: '#101615',
          800: '#17211c',
          700: '#213229',
        },
        kinpaku: {
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
        },
        wa: {
          400: '#74efb3',
          500: '#74efb3',
          600: '#5bd79b',
        },
        brand: {
          50: '#effcf5',
          100: '#d9fbea',
          500: '#74efb3',
          600: '#5bd79b',
          900: '#123524',
        }
      }
    },
  },
  plugins: [],
};
