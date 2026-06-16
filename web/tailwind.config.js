/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Фирменный синий в духе Контур.Эльбы
        brand: {
          DEFAULT: "#1E40AF",
          50: "#EFF4FF",
          100: "#DBEAFE",
          200: "#BFD6FE",
          500: "#2563EB",
          600: "#1E40AF",
          700: "#1E3A8A",
        },
        ink: "#0F172A", // основной текст
        muted: "#64748B", // вторичный текст
        canvas: "#F8FAFC", // фон приложения
        line: "#E2E8F0", // границы
        ok: "#16A34A",
        warn: "#D97706",
        danger: "#DC2626",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        tnum: ["Inter", "system-ui", "sans-serif"], // табличные цифры включаем через класс
      },
      borderRadius: { md: "8px", lg: "12px", xl: "16px" },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.06)",
      },
    },
  },
  plugins: [],
}
