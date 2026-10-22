import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri drives the dev server: fixed port, no screen clears, TAURI_ env passthrough.
// Watch only the frontend; Rust and spike build output must not trigger page reloads.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**", "**/spikes/**", "**/target/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: { target: "safari17", minify: false, sourcemap: true },
});
