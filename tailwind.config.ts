import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#07090e',
          card: '#0d1117',
          cardBorder: '#1e293b',
          accent: '#06b6d4',
          emerald: '#10b981',
          danger: '#ef4444',
          warning: '#f59e0b',
          muted: '#64748b',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'monospace'],
      },
      boxShadow: {
        'cyber-neon': '0 0 20px -5px rgba(6, 182, 212, 0.4)',
        'cyber-danger': '0 0 20px -5px rgba(239, 68, 68, 0.4)',
        'cyber-success': '0 0 20px -5px rgba(16, 185, 129, 0.4)',
      },
    },
  },
  plugins: [],
};

export default config;
