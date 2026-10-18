import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  // LANDLENS_API (shell or .env.local) points the dev proxy at another API port.
  const env = { ...loadEnv(mode, ".", ""), ...(globalThis as { process?: { env: Record<string, string> } }).process?.env };
  return {
    plugins: [react(), tailwindcss()],
    // MapLibre v6 loads its worker relative to its own module file; pre-bundling breaks that path.
    optimizeDeps: { exclude: ["maplibre-gl"] },
    server: {
      port: 5173,
      proxy: { "/api": env.LANDLENS_API ?? "http://localhost:8080" },
    },
  };
});
