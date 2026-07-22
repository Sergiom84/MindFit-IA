/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Colores personalizados del proyecto
        dark: {
          primary: '#0b1220',
          secondary: '#0d1522',
          card: '#1a2332',
        },
        yellow: {
          300: '#fde047',
          400: '#facc15',
          500: '#eab308',
        },
        gray: {
          100: '#f3f4f6',
          300: '#d1d5db',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
        }
      },
      backgroundColor: {
        'dark-primary': '#0b1220',
        'dark-secondary': '#0d1522',
        'yellow-10': 'rgba(250, 204, 21, 0.1)',
        'yellow-20': 'rgba(250, 204, 21, 0.2)',
        'yellow-40': 'rgba(250, 204, 21, 0.4)',
        'black-60': 'rgba(0, 0, 0, 0.6)',
      },
      borderColor: {
        'yellow-20': 'rgba(250, 204, 21, 0.2)',
        'yellow-40': 'rgba(250, 204, 21, 0.4)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Sora', 'system-ui', 'sans-serif'],
        body: ['Manrope', 'system-ui', 'sans-serif'],
        montserrat: ['Montserrat', 'system-ui', 'sans-serif'],
        space: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        urbanist: ['Urbanist', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.5s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
