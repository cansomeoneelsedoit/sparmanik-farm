/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0A0A0B",
          2: "#111113",
        },
        card: {
          DEFAULT: "#15151A",
          2: "#1C1C22",
        },
        accent: {
          DEFAULT: "#FF6B35",
          2: "#FFB84D",
        },
        text: {
          DEFAULT: "#F5F5F7",
          dim: "rgba(245,245,247,0.6)",
          faint: "rgba(245,245,247,0.4)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        serif: ['"Instrument Serif"', "serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      borderColor: {
        DEFAULT: "rgba(255,255,255,0.08)",
        strong: "rgba(255,255,255,0.12)",
      },
    },
  },
  plugins: [],
};
