import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri drives the dev server: fixed port, no screen clears, TAURI_ env passthrough.
// Watch only the frontend; Rust and spike build output must not trigger page reloads.
export default defineConfig({
  plugins: [react()],
  // Path-installed kbui symlinks into ../kbui: resolve from this node_modules for one React.
  resolve: { preserveSymlinks: true, dedupe: ["react", "react-dom"] },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**", "**/spikes/**", "**/target/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: { target: "safari17", minify: false, sourcemap: true },
});
