import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0c0e0d',
        s2: '#191c18',
        s3: '#1f231e',
        border: '#272b26',
        muted: '#505850',
        text: '#e4e8e3',
        gold: '#c8a96e',
        'gold-hover': '#e8c98a',
        green: '#4a9e6b',
        red: '#c45a3a',
        blue: '#4a80c8',
        teal: '#3a9e8a',
      },
      fontFamily: {
        sans: ['Geist', 'sans-serif'],
        serif: ['Cormorant Garamond', 'Georgia', 'serif'],
        mono: ['Geist Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
