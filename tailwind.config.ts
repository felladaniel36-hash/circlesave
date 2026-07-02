import type { Config } from "tailwindcss";

/**
 * Tailwind config — mirrors the custom Material Design 3 design tokens
 * from the original HTML/Tailwind mockup.
 */
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Primary (warm orange)
        primary: "#ffb690",
        "on-primary": "#552100",
        "primary-container": "#f97316",
        "on-primary-container": "#582200",
        "primary-fixed": "#ffdbca",
        "primary-fixed-dim": "#ffb690",
        "on-primary-fixed": "#341100",
        "on-primary-fixed-variant": "#783200",
        // Secondary
        secondary: "#ffb95f",
        "on-secondary": "#472a00",
        "secondary-container": "#ee9800",
        "on-secondary-container": "#5b3800",
        "secondary-fixed": "#ffddb8",
        "secondary-fixed-dim": "#ffb95f",
        "on-secondary-fixed": "#2a1700",
        "on-secondary-fixed-variant": "#653e00",
        // Tertiary
        tertiary: "#c8c6c8",
        "on-tertiary": "#313032",
        "tertiary-container": "#9c9a9d",
        "on-tertiary-container": "#333235",
        "tertiary-fixed": "#e5e1e4",
        "tertiary-fixed-dim": "#c8c6c8",
        "on-tertiary-fixed": "#1c1b1d",
        "on-tertiary-fixed-variant": "#474649",
        // Error
        error: "#ffb4ab",
        "on-error": "#690005",
        "error-container": "#93000a",
        "on-error-container": "#ffdad6",
        // Surface / background
        background: "#131316",
        "on-background": "#e4e1e5",
        surface: "#131316",
        "on-surface": "#e4e1e5",
        "on-surface-variant": "#e0c0b1",
        "surface-variant": "#353437",
        "surface-dim": "#131316",
        "surface-bright": "#39393c",
        "surface-container-lowest": "#0e0e11",
        "surface-container-low": "#1b1b1e",
        "surface-container": "#1f1f22",
        "surface-container-high": "#2a2a2d",
        "surface-container-highest": "#353437",
        "surface-tint": "#ffb690",
        // Outline
        outline: "#a78b7d",
        "outline-variant": "#584237",
        // Inverse
        "inverse-surface": "#e4e1e5",
        "inverse-on-surface": "#303033",
        "inverse-primary": "#9d4300",
      },
      borderRadius: {
        DEFAULT: "0.125rem",
        lg: "0.25rem",
        xl: "0.5rem",
        full: "0.75rem",
      },
      spacing: {
        gutter: "24px",
        unit: "4px",
        "margin-mobile": "16px",
        "margin-desktop": "40px",
        "container-max": "1280px",
        "stack-sm": "8px",
        "stack-md": "16px",
        "stack-lg": "32px",
      },
      fontFamily: {
        "data-mono": ["JetBrains Mono", "monospace"],
        "body-sm": ["Inter", "sans-serif"],
        "display-lg": ["Inter", "sans-serif"],
        "body-base": ["Inter", "sans-serif"],
        "headline-md": ["Inter", "sans-serif"],
        "label-caps": ["Inter", "sans-serif"],
      },
      fontSize: {
        "data-mono": ["14px", { lineHeight: "20px", letterSpacing: "0", fontWeight: "500" }],
        "body-sm": ["14px", { lineHeight: "20px", letterSpacing: "0", fontWeight: "400" }],
        "display-lg": ["48px", { lineHeight: "56px", letterSpacing: "-0.02em", fontWeight: "700" }],
        "body-base": ["16px", { lineHeight: "24px", letterSpacing: "0", fontWeight: "400" }],
        "display-lg-mobile": ["32px", { lineHeight: "40px", letterSpacing: "-0.02em", fontWeight: "700" }],
        "headline-md": ["24px", { lineHeight: "32px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "label-caps": ["12px", { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "600" }],
      },
    },
  },
  plugins: [],
};

export default config;
