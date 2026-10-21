/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-base': 'var(--bg-base)',
        'bg-panel': 'var(--bg-panel)',
        'bg-elevated': 'var(--bg-elevated)',
        'bg-hover': 'var(--bg-hover)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        steel: 'var(--steel)',
        'steel-light': 'var(--steel-light)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-deep': 'var(--accent-deep)',
        denim: 'var(--denim)',
        'denim-light': 'var(--denim-light)',
        blush: 'var(--blush)',
        danger: 'var(--danger)',
        warning: 'var(--warning)',
        success: 'var(--success)',
        bg: {
          primary: 'var(--bg-base)',
          panel: 'var(--bg-panel)',
          elevated: 'var(--bg-elevated)',
          hover: 'var(--bg-hover)',
        },
      },
      boxShadow: {
        glow: '0 0 8px var(--accent-glow)',
        'glow-lg': '0 0 16px var(--accent-glow)',
        dropdown: '0 12px 32px rgba(0, 0, 0, 0.6)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
};
