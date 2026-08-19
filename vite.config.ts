import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// `next/*` specifiers resolve to shims so the POS components (originally
// written for Next.js) run unchanged under Vite/React.
export default defineConfig({
  // Relative base so the packaged renderer loads assets over file://
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "next/image": fileURLToPath(new URL("./src/shims/next-image.tsx", import.meta.url)),
      "next/link": fileURLToPath(new URL("./src/shims/next-link.tsx", import.meta.url)),
      "next/navigation": fileURLToPath(new URL("./src/shims/next-navigation.ts", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5180,
    strictPort: true,
  },
});
