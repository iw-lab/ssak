/** @type {import('tailwindcss').Config} */
// 싹 디자인 토큰 — A «새싹 벤토» (docs/DESIGN-BRIEF.md · 2026-11-18)
//   1층 primitives = 아래 색 계단(hex). 2층 semantics = src/index.css 의 CSS 변수(--background 등).
//   화면 코드는 gray/blue/emerald… 유틸리티를 그대로 쓰되, 계단 자체를 새 팔레트로 바꿔 한 번에 갈아입힌다.
// 500·600 은 흰 글씨 대비 4.5:1↑(#16874A 4.57 · design-gate)
const sprout = { 50: "#EEF8F1", 100: "#DDF1E4", 200: "#B9E3C8", 300: "#86CBA1", 400: "#3DAA6B", 500: "#16874A", 600: "#13723E", 700: "#115E34", 800: "#0F4B2B", 900: "#0D3E24", 950: "#072314" };
const sky = { 50: "#EEF5FE", 100: "#DCEAFD", 200: "#BAD4FB", 300: "#8DB8F7", 400: "#4C8FEF", 500: "#1F6FD8", 600: "#1A5DB8", 700: "#184E98", 800: "#17427D", 900: "#163867", 950: "#0F2546" };
const leafGray = { 50: "#F7F8F3", 100: "#EFF1EA", 200: "#E3E7DC", 300: "#CDD3C6", 400: "#9AA39A", 500: "#6E786F", 600: "#5B6660", 700: "#3F4943", 800: "#2A322D", 900: "#18211B", 950: "#0E140F" };
const sun = { 50: "#FFF8EB", 100: "#FFEFCF", 200: "#FFDC9C", 300: "#FBC468", 400: "#F5B04A", 500: "#F2A93B", 600: "#D8861C", 700: "#B36716", 800: "#8F5217", 900: "#754416", 950: "#432308" };

import defaultColors from "tailwindcss/colors";
const red = { ...defaultColors.red, 500: "#DC2626", 600: "#C81E1E" }; // 흰 글씨 대비 4.8

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        gray: leafGray, slate: leafGray, zinc: leafGray, neutral: leafGray, stone: leafGray,
        green: sprout, emerald: sprout, teal: sprout,
        blue: sky, indigo: sky, sky, cyan: sky,
        amber: sun, yellow: sun, red, rose: red,
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        border: "hsl(var(--border))",
        ring: "hsl(var(--ring))",
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        warning: { DEFAULT: "hsl(var(--warning))", foreground: "hsl(var(--warning-foreground))" },
      },
      fontFamily: { sans: ["Pretendard", "Noto Sans KR", "system-ui", "-apple-system", "sans-serif"] },
      borderRadius: { lg: "0.875rem", xl: "1.125rem", "2xl": "1.5rem", "3xl": "1.75rem" },
      boxShadow: {
        sm: "0 1px 2px rgb(20 30 20 / 0.05)",
        DEFAULT: "0 1px 2px rgb(20 30 20 / 0.05), 0 4px 12px rgb(20 30 20 / 0.05)",
        md: "0 1px 2px rgb(20 30 20 / 0.06), 0 8px 24px rgb(20 30 20 / 0.06)",
        lg: "0 2px 4px rgb(20 30 20 / 0.05), 0 12px 32px rgb(20 30 20 / 0.08)",
        xl: "0 4px 8px rgb(20 30 20 / 0.05), 0 20px 44px rgb(20 30 20 / 0.10)",
        "2xl": "0 8px 16px rgb(20 30 20 / 0.06), 0 28px 60px rgb(20 30 20 / 0.12)",
      },
    },
  },
  plugins: [],
};
