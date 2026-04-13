import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-raised": "var(--surface-raised)",
        "surface-sunken": "var(--surface-sunken)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        text: "var(--text)",
        "text-dim": "var(--text-dim)",
        "text-faint": "var(--text-faint)",
        profit: "var(--profit)",
        "profit-bg": "var(--profit-bg)",
        loss: "var(--loss)",
        "loss-bg": "var(--loss-bg)",
        boost: "var(--boost)",
        "boost-bg": "var(--boost-bg)",
        accent: "var(--accent)",
        "accent-bg": "var(--accent-bg)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "0.875rem" }],
      },
      letterSpacing: {
        tightest: "-0.035em",
        tighter: "-0.025em",
      },
      boxShadow: {
        "glow-profit":
          "0 0 0 1px var(--profit), 0 0 18px -4px var(--profit)",
        "glow-boost": "0 0 0 1px var(--boost), 0 0 18px -4px var(--boost)",
        card: "0 1px 0 0 var(--border), 0 0 0 1px var(--border)",
      },
      animation: {
        "pulse-stale": "pulseStale 2s ease-in-out infinite",
        "flash-up": "flashUp 500ms ease-out",
        "flash-down": "flashDown 500ms ease-out",
      },
      keyframes: {
        pulseStale: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        flashUp: {
          "0%": { backgroundColor: "var(--profit-bg)" },
          "100%": { backgroundColor: "transparent" },
        },
        flashDown: {
          "0%": { backgroundColor: "var(--loss-bg)" },
          "100%": { backgroundColor: "transparent" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
