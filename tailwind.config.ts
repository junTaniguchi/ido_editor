import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            maxWidth: '100%',
            color: '#24292e',
            a: {
              color: '#0366d6',
              textDecoration: 'none',
              '&:hover': {
                textDecoration: 'underline',
              },
            },
            h1: {
              fontWeight: '600',
              borderBottom: '1px solid #eaecef',
              paddingBottom: '0.3em',
              marginTop: '24px',
              marginBottom: '16px',
              fontSize: '2em',
            },
            h2: {
              fontWeight: '600',
              borderBottom: '1px solid #eaecef',
              paddingBottom: '0.3em',
              marginTop: '24px',
              marginBottom: '16px',
              fontSize: '1.5em',
            },
            h3: {
              fontWeight: '600',
              marginTop: '24px',
              marginBottom: '16px',
              fontSize: '1.25em',
            },
            code: {
              padding: '0.2em 0.4em',
              margin: '0',
              fontSize: '85%',
              backgroundColor: 'rgba(27, 31, 35, 0.05)',
              borderRadius: '3px',
            },
          },
        },
        dark: {
          css: {
            color: '#c9d1d9',
            a: {
              color: '#58a6ff',
              '&:hover': {
                color: '#58a6ff',
              },
            },
            h1: {
              color: '#e6edf3',
              borderBottom: '1px solid #21262d',
            },
            h2: {
              color: '#e6edf3',
              borderBottom: '1px solid #21262d',
            },
            h3: {
              color: '#e6edf3',
            },
            code: {
              backgroundColor: 'rgba(240, 246, 252, 0.15)',
            },
          },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default config;
