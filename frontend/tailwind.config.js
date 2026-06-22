/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Arena surfaces
        void: "#08080a",
        carbon: "#0d0d11",
        // Molten amber/gold — champions, stakes, victory
        ember: {
          50: "#fff7ed",
          100: "#ffedd5",
          300: "#fdba74",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
        },
        // Electric violet/cyan — AI, strategy, tech
        plasma: {
          300: "#a78bfa",
          400: "#8b5cf6",
          500: "#7c3aed",
          600: "#6d28d9",
        },
        cyber: {
          300: "#67e8f9",
          400: "#22d3ee",
          500: "#06b6d4",
        },
      },
      fontFamily: {
        display: ['"Chakra Petch"', "system-ui", "sans-serif"],
        sans: ['"Inter"', "system-ui", "-apple-system", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(245,158,11,0.12), 0 8px 40px -8px rgba(245,158,11,0.25)",
        "glow-plasma":
          "0 0 0 1px rgba(139,92,246,0.14), 0 8px 40px -8px rgba(139,92,246,0.3)",
        panel: "0 24px 64px -24px rgba(0,0,0,0.85)",
        inset: "inset 0 1px 0 0 rgba(255,255,255,0.05)",
      },
      backgroundImage: {
        "grid-arena":
          "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
        "ember-radial":
          "radial-gradient(60% 60% at 50% 0%, rgba(245,158,11,0.10) 0%, transparent 70%)",
      },
      keyframes: {
        floaty: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "pulse-glow": {
          "0%,100%": { opacity: "0.5", filter: "brightness(1)" },
          "50%": { opacity: "1", filter: "brightness(1.25)" },
        },
        "gradient-pan": {
          "0%,100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(400%)" },
        },
        "spin-slow": {
          to: { transform: "rotate(360deg)" },
        },
        "clash-left": {
          "0%": { transform: "translateX(-40px) rotate(-8deg)", opacity: "0" },
          "60%": { transform: "translateX(6px) rotate(2deg)", opacity: "1" },
          "100%": { transform: "translateX(0) rotate(0deg)", opacity: "1" },
        },
        "clash-right": {
          "0%": { transform: "translateX(40px) rotate(8deg)", opacity: "0" },
          "60%": { transform: "translateX(-6px) rotate(-2deg)", opacity: "1" },
          "100%": { transform: "translateX(0) rotate(0deg)", opacity: "1" },
        },
      },
      animation: {
        floaty: "floaty 6s ease-in-out infinite",
        "pulse-glow": "pulse-glow 2.4s ease-in-out infinite",
        "gradient-pan": "gradient-pan 6s ease infinite",
        scanline: "scanline 6s linear infinite",
        "spin-slow": "spin-slow 18s linear infinite",
        "clash-left": "clash-left 0.7s cubic-bezier(0.22,1,0.36,1) both",
        "clash-right": "clash-right 0.7s cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [],
};
