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
        canvas: '#090a0d',
        surface: {
          DEFAULT: '#111317',
          hover: '#161920',
          elevated: '#1a1e26',
          border: 'rgba(255, 255, 255, 0.08)',
          'border-subtle': 'rgba(255, 255, 255, 0.04)',
        },
        ink: {
          primary: '#f4f4f5',
          secondary: '#a1a1aa',
          muted: '#71717a',
          faint: '#3f3f46',
        }
      },
      fontFamily: {
        mono: ['ui-monospace', 'SF Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
