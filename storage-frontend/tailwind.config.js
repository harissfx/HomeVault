/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      screens: {
        xs: '400px',
      },
      colors: {
        vault: {
          bg: 'rgb(var(--vault-bg) / <alpha-value>)',
          surface: 'rgb(var(--vault-surface) / <alpha-value>)',
          surface2: 'rgb(var(--vault-surface2) / <alpha-value>)',
          border: 'rgb(var(--vault-border) / <alpha-value>)',
          text: 'rgb(var(--vault-text) / <alpha-value>)',
          muted: 'rgb(var(--vault-muted) / <alpha-value>)',
          brass: 'rgb(var(--vault-brass) / <alpha-value>)',
          brassdim: 'rgb(var(--vault-brassdim) / <alpha-value>)',
          ok: 'rgb(var(--vault-ok) / <alpha-value>)',
          danger: 'rgb(var(--vault-danger) / <alpha-value>)'
        }
      },
      fontFamily: {
        display: ['Roboto', 'sans-serif'],
        body: ['Roboto', 'sans-serif'],
        mono: ['Roboto', 'sans-serif']
      }
    },
  },
  plugins: [],
}