import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        orange: {
          DEFAULT: '#FF6B2B',
          light: '#FF8F5E',
          pale: '#FFF0EA',
        },
        brand: {
          green: '#1DB954',
          'green-pale': '#E8FAF0',
          blue: '#007AFF',
          'blue-pale': '#EBF4FF',
          red: '#FF3B30',
          'red-pale': '#FFECEB',
          bg: '#F5F5F0',
          border: '#E8E8E0',
          text: '#1A1A1A',
          text2: '#555555',
          text3: '#999999',
        },
      },
      fontFamily: {
        sans: ['Nunito', 'sans-serif'],
        display: ['Bricolage Grotesque', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
