/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Noto Sans JP"', '"IBM Plex Sans"', "system-ui", "sans-serif"]
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
        out: "cubic-bezier(0.33, 1, 0.68, 1)"
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        "line-grow": {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" }
        }
      },
      animation: {
        "fade-up": "fade-up 0.55s var(--ease-smooth, cubic-bezier(0.22, 1, 0.36, 1)) both",
        "fade-in": "fade-in 0.45s ease-out both",
        "line-grow": "line-grow 0.6s var(--ease-smooth, cubic-bezier(0.22, 1, 0.36, 1)) forwards",
        "pulse-soft": "fade-in 1.2s ease-in-out infinite alternate"
      }
    }
  },
  plugins: []
};
