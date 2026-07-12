import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/tasting-shrek/",
  server: {
    port: 5173,
  },
  build: {
    // Source maps let the VSCode Chrome debugger map back to the .tsx source.
    sourcemap: true,
  },
});
