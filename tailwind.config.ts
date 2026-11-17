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
        midnight: "#101827",
        navy: "#17263C",
        "navy-light": "#1F3453",
        gold: "#C6A15B",
        "gold-light": "#E3C98F",
        ivory: "#F0E9DA",
        "ivory-dim": "#CBC3B2",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "var(--font-thai-serif)", "serif"],
        sans: ["var(--font-sans)", "sans-serif"],
      },
      boxShadow: {
        card: "0 10px 40px -10px rgba(0,0,0,0.6)",
        glow: "0 0 24px rgba(198,161,91,0.25)",
      },
      backgroundImage: {
        "radial-fade":
          "radial-gradient(ellipse at top, rgba(31,52,83,0.6), transparent 65%)",
      },
    },
  },
  plugins: [],
};

export default config;
