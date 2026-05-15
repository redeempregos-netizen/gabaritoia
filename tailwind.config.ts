import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'sans-serif'],
        heading: ['var(--font-syne)', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#f0effe',
          100: '#e2dffe',
          200: '#c9c0fd',
          300: '#a99afb',
          400: '#8b73f8',
          500: '#7c6af7',
          600: '#6b4ef3',
          700: '#5a38df',
          800: '#4a2dba',
          900: '#3d2898',
        },
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #7c6af7, #a855f7)',
      },
    },
  },
  plugins: [],
}

export default config
