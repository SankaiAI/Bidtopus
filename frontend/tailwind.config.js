/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        indigo:    '#4F46E5',
        'indigo-mid': '#6366F1',
        emerald:   '#10B981',
        amber:     '#F59E0B',
        rose:      '#EF4444',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
