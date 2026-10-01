import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: process.env.API_URL ? { proxy: { "/api": { target: process.env.API_URL, changeOrigin: true } } } : {},
})
