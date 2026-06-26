/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/ui/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        heading: ['Montserrat', 'sans-serif'],
      },
      colors: {
        void: 'var(--color-void)',
        primary: 'var(--color-primary)',
        gunmetal: 'var(--color-gunmetal)',
        foreground: 'var(--color-foreground)',
        gray: {
          100: 'var(--color-gray-100)',
          200: 'var(--color-gray-200)',
          300: 'var(--color-gray-300)',
          400: 'var(--color-gray-400)',
          500: 'var(--color-gray-500)',
          600: 'var(--color-gray-600)',
          700: 'var(--color-gray-700)',
          800: 'var(--color-gray-800)',
          900: 'var(--color-gray-900)',
        },
        'brand-navy': '#0A1B3A', 
        'sovereign-gold': 'var(--color-sovereign-gold, #D4AF37)',
        'sterling-silver': 'var(--color-sterling-silver, #C0C0C0)',
        'core-exec': 'var(--color-core-exec, #00E5FF)',
        'port-grid': 'var(--color-port-grid, #00FFCC)',
        'route-switch': 'var(--color-route-switch, #FFB300)',
        'scout-daemon': 'var(--color-scout-daemon, #8E24AA)',
        'neural-blue': 'var(--color-neural-blue, #3882F6)',
        'report-green': 'var(--color-report-green, #00FF41)'
      },
      backgroundImage: {
        'void-gradient': 'radial-gradient(circle at top center, var(--color-primary) 0%, var(--color-void) 100%)',
        'glass-gradient': 'var(--color-glass-gradient)',
      },
      boxShadow: {
        'glass-inner': 'inset 0 1px 1px rgba(255, 255, 255, 0.1), inset 0 -1px 1px rgba(0, 0, 0, 0.5)',
        'glow-gold': '0 0 35px -10px rgba(212, 175, 55, 0.6)',
        'glow-blue': '0 0 35px -10px rgba(0, 229, 255, 0.6)',
        'glow-cyan': '0 0 35px -10px rgba(0, 255, 204, 0.6)',
        'glow-amber': '0 0 35px -10px rgba(255, 179, 0, 0.6)',
        'glow-violet': '0 0 35px -10px rgba(142, 36, 170, 0.6)',
      }
    }
  },
  plugins: [],
}
